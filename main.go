package main

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
)

const (
	maxRequestBytes = 64 * 1024
	managedLabel    = "open-paas.managed"
)

type DeployPayload struct {
	RepoURL   string `json:"repo_url"`
	Subdomain string `json:"subdomain"`
}

type Deployment struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Status string `json:"status"`
}

type APIError struct {
	Error string `json:"error"`
}

var (
	githubOwnerPattern = regexp.MustCompile(`^[A-Za-z0-9_.-]{1,100}$`)
	githubRepoPattern  = regexp.MustCompile(`^[A-Za-z0-9_.-]{1,100}$`)
	subdomainPattern   = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$`)
	containerPattern   = regexp.MustCompile(`^open-paas-app-[a-z0-9-]{1,100}$`)
	publicTunnelURL    = regexp.MustCompile(`https://[a-zA-Z0-9-]+\.loca\.lt`)
)

type messageBroker struct {
	broadcast chan string
	clients   map[chan string]struct{}
	mu        sync.Mutex
}

func newMessageBroker() *messageBroker {
	return &messageBroker{broadcast: make(chan string, 128), clients: make(map[chan string]struct{})}
}

func (b *messageBroker) run() {
	for message := range b.broadcast {
		b.mu.Lock()
		for client := range b.clients {
			// A slow subscriber must never stall other subscribers or publishers.
			select {
			case client <- message:
			default:
			}
		}
		b.mu.Unlock()
	}
}

func (b *messageBroker) subscribe() chan string {
	client := make(chan string, 16)
	b.mu.Lock()
	b.clients[client] = struct{}{}
	b.mu.Unlock()
	return client
}

func (b *messageBroker) unsubscribe(client chan string) {
	b.mu.Lock()
	delete(b.clients, client)
	close(client)
	b.mu.Unlock()
}

func (b *messageBroker) publish(message string) bool {
	select {
	case b.broadcast <- message:
		return true
	default:
		return false
	}
}

var broker = newMessageBroker()
var deploymentLocks sync.Map

func main() {
	apiToken := strings.TrimSpace(os.Getenv("OPEN_PAAS_API_TOKEN"))
	if len(apiToken) < 32 {
		log.Fatal("OPEN_PAAS_API_TOKEN must be set to a secret of at least 32 characters")
	}
	secure := func(handler http.HandlerFunc) http.HandlerFunc {
		return withCORS(requireAPIToken(handler))
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/health", secure(healthHandler))
	mux.HandleFunc("/webhook", secure(deployHandler))
	mux.HandleFunc("/deploy", secure(deployHandler))
	mux.HandleFunc("/deployments", secure(deploymentsHandler))
	mux.HandleFunc("/logs", secure(logsHandler))
	mux.HandleFunc("/restart", secure(restartHandler))
	mux.HandleFunc("/relay", secure(relayHandler))
	mux.HandleFunc("/publish", secure(publishHandler))

	go broker.run()
	address := strings.TrimSpace(os.Getenv("LISTEN_ADDR"))
	if address == "" {
		address = ":8080"
	}
	server := &http.Server{Addr: address, Handler: mux, ReadHeaderTimeout: 5 * time.Second, IdleTimeout: 60 * time.Second}
	log.Printf("Open-PaaS engine listening on %s", address)
	log.Fatal(server.ListenAndServe())
}

func allowedOrigins() map[string]struct{} {
	configured := strings.TrimSpace(os.Getenv("CORS_ALLOWED_ORIGINS"))
	if configured == "" {
		configured = "http://localhost:3000,http://127.0.0.1:3000"
	}
	origins := make(map[string]struct{})
	for _, value := range strings.Split(configured, ",") {
		origin := strings.TrimSpace(value)
		parsed, err := url.Parse(origin)
		if err != nil || parsed.Scheme == "" || parsed.Host == "" || parsed.User != nil || parsed.Path != "" || parsed.RawQuery != "" || parsed.Fragment != "" {
			continue
		}
		origins[origin] = struct{}{}
	}
	return origins
}

func withCORS(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" {
			if _, ok := allowedOrigins()[origin]; ok {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
				w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
				w.Header().Add("Vary", "Origin")
			}
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next(w, r)
	}
}

func requireAPIToken(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		expected := strings.TrimSpace(os.Getenv("OPEN_PAAS_API_TOKEN"))
		if expected == "" {
			writeJSON(w, http.StatusServiceUnavailable, APIError{Error: "engine API token is not configured"})
			return
		}
		scheme, provided, ok := strings.Cut(r.Header.Get("Authorization"), " ")
		if !ok || !strings.EqualFold(scheme, "Bearer") || subtle.ConstantTimeCompare([]byte(provided), []byte(expected)) != 1 {
			w.Header().Set("WWW-Authenticate", `Bearer realm="open-paas"`)
			writeJSON(w, http.StatusUnauthorized, APIError{Error: "valid bearer token required"})
			return
		}
		next(w, r)
	}
}

func methodOnly(w http.ResponseWriter, r *http.Request, method string) bool {
	if r.Method == method {
		return true
	}
	w.Header().Set("Allow", method+", OPTIONS")
	writeJSON(w, http.StatusMethodNotAllowed, APIError{Error: "method not allowed"})
	return false
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		log.Printf("write response: %v", err)
	}
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	if !methodOnly(w, r, http.MethodGet) {
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func decodeDeployPayload(w http.ResponseWriter, r *http.Request) (DeployPayload, error) {
	var payload DeployPayload
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxRequestBytes))
	if err := decoder.Decode(&payload); err != nil {
		return payload, fmt.Errorf("request body must be valid JSON: %w", err)
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		return payload, fmt.Errorf("request body must contain a single JSON object")
	}
	return payload, nil
}

func validateGitHubRepo(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	parsed, err := url.ParseRequestURI(raw)
	if err != nil || parsed.Scheme != "https" || !strings.EqualFold(parsed.Hostname(), "github.com") || parsed.Port() != "" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" || parsed.RawPath != "" {
		return "", fmt.Errorf("repository must be an HTTPS URL on github.com")
	}
	path := strings.Trim(parsed.Path, "/")
	if strings.HasSuffix(strings.ToLower(path), ".git") {
		path = path[:len(path)-4]
	}
	parts := strings.Split(path, "/")
	if len(parts) != 2 || !githubOwnerPattern.MatchString(parts[0]) || !githubRepoPattern.MatchString(parts[1]) || parts[0] == "." || parts[0] == ".." || parts[1] == "." || parts[1] == ".." {
		return "", fmt.Errorf("repository URL must look like https://github.com/owner/repository")
	}
	return "https://github.com/" + parts[0] + "/" + parts[1] + ".git", nil
}

func validateSubdomain(value string) (string, error) {
	value = strings.ToLower(strings.TrimSpace(value))
	if value == "" {
		return "", nil
	}
	if !subdomainPattern.MatchString(value) {
		return "", fmt.Errorf("subdomain must use 1–63 lowercase letters, numbers, or hyphens, and cannot start or end with a hyphen")
	}
	return value, nil
}

func deploymentName(repoURL, subdomain string) string {
	parsed, _ := url.Parse(repoURL)
	parts := strings.Split(strings.Trim(parsed.Path, "/"), "/")
	slug := "app"
	if subdomain != "" {
		slug = subdomain
	} else if len(parts) == 2 {
		slug = strings.TrimSuffix(parts[1], ".git")
	}
	slug = strings.ToLower(strings.Trim(slug, "-_."))
	slug = strings.ReplaceAll(slug, "_", "-")
	if len(slug) > 48 {
		slug = slug[:48]
	}
	if slug == "" {
		slug = "app"
	}
	digest := sha256.Sum256([]byte(repoURL + "\n" + subdomain))
	return "open-paas-app-" + slug + "-" + hex.EncodeToString(digest[:3])
}

func deployHandler(w http.ResponseWriter, r *http.Request) {
	if !methodOnly(w, r, http.MethodPost) {
		return
	}
	payload, err := decodeDeployPayload(w, r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, APIError{Error: err.Error()})
		return
	}
	repoURL, err := validateGitHubRepo(payload.RepoURL)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, APIError{Error: err.Error()})
		return
	}
	subdomain, err := validateSubdomain(payload.Subdomain)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, APIError{Error: err.Error()})
		return
	}
	name := deploymentName(repoURL, subdomain)
	log.Printf("deployment requested: repo=%s container=%s", repoURL, name)
	writeJSON(w, http.StatusAccepted, map[string]string{"status": "accepted", "repository": repoURL, "container": name})
	go func() {
		if err := runPipeline(repoURL, subdomain, name); err != nil {
			log.Printf("deployment %s failed: %v", name, err)
		}
	}()
}

func dockerCommand(ctx context.Context, args ...string) *exec.Cmd {
	return exec.CommandContext(ctx, "docker", args...)
}

func runPipeline(repoURL, subdomain, containerName string) error {
	lockValue, _ := deploymentLocks.LoadOrStore(containerName, &sync.Mutex{})
	deploymentLock := lockValue.(*sync.Mutex)
	deploymentLock.Lock()
	defer deploymentLock.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()
	buildRoot, err := os.MkdirTemp("", "open-paas-build-")
	if err != nil {
		return fmt.Errorf("create isolated build directory: %w", err)
	}
	defer os.RemoveAll(buildRoot)
	repoPath := filepath.Join(buildRoot, "source")

	log.Printf("%s: cloning repository", containerName)
	clone := exec.CommandContext(ctx, "git", "clone", "--depth", "1", "--", repoURL, repoPath)
	clone.Env = append(os.Environ(), "GIT_TERMINAL_PROMPT=0")
	if output, err := clone.CombinedOutput(); err != nil {
		return fmt.Errorf("clone repository: %w: %s", err, conciseOutput(output))
	}

	tunnelName := strings.Replace(containerName, "open-paas-app-", "open-paas-tunnel-", 1)
	imageName := containerName + "-image"

	log.Printf("%s: building application image", containerName)
	build := dockerCommand(ctx,
		"run", "--rm",
		"-e", "DOCKER_BUILDKIT=0",
		"-v", "/var/run/docker.sock:/var/run/docker.sock",
		"-v", repoPath+":/app:ro",
		"open-paas-builder", "build", "/app", "--name", imageName,
	)
	build.Stdout = os.Stdout
	build.Stderr = os.Stderr
	if err := build.Run(); err != nil {
		return fmt.Errorf("build failed: %w", err)
	}
	log.Printf("%s: replacing existing app container", containerName)
	_ = dockerCommand(ctx, "rm", "-f", containerName, tunnelName).Run()

	volumeName := containerName + "-data"
	if output, err := dockerCommand(ctx, "volume", "create", volumeName).CombinedOutput(); err != nil {
		return fmt.Errorf("create data volume: %w: %s", err, conciseOutput(output))
	}
	log.Printf("%s: starting app container", containerName)
	appArgs := []string{
		"run", "-d",
		"--restart", "unless-stopped",
		"--label", managedLabel + "=true",
		"--label", "open-paas.repository=" + repoURL,
		"--cpus", "0.5",
		"--memory", "512m",
		"--pids-limit", "100",
		"--security-opt", "no-new-privileges:true",
		"-v", volumeName + ":/data",
		"-e", "PORT=3000",
		"-e", "DATABASE_URL=sqlite:///data/sqlite.db",
		"--name", containerName,
		imageName,
	}
	if output, err := dockerCommand(ctx, appArgs...).CombinedOutput(); err != nil {
		return fmt.Errorf("start app container: %w: %s", err, conciseOutput(output))
	}

	log.Printf("%s: starting localtunnel", containerName)
	tunnelArgs := []string{
		"run", "-d", "--label", managedLabel + "=tunnel",
		"--link", containerName,
		"--name", tunnelName,
		"node:18-alpine", "npx", "localtunnel", "--port", "3000", "--local-host", containerName,
	}
	if subdomain != "" {
		tunnelArgs = append(tunnelArgs, "--subdomain", subdomain)
	}
	if output, err := dockerCommand(ctx, tunnelArgs...).CombinedOutput(); err != nil {
		return fmt.Errorf("start tunnel: %w: %s", err, conciseOutput(output))
	}
	for attempt := 0; attempt < 12; attempt++ {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		time.Sleep(2 * time.Second)
		logs, _ := dockerCommand(ctx, "logs", tunnelName).CombinedOutput()
		if liveURL := publicTunnelURL.FindString(string(logs)); liveURL != "" {
			log.Printf("%s is available at %s", containerName, liveURL)
			return nil
		}
	}
	return fmt.Errorf("tunnel started but no loca.lt URL appeared in its logs")
}

func conciseOutput(output []byte) string {
	text := strings.TrimSpace(string(output))
	if len(text) > 1000 {
		text = text[len(text)-1000:]
	}
	return text
}

func deploymentsHandler(w http.ResponseWriter, r *http.Request) {
	if !methodOnly(w, r, http.MethodGet) {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	output, err := dockerCommand(ctx, "ps", "--all", "--filter", "label="+managedLabel+"=true", "--format", "{{.ID}}|{{.Names}}|{{.Status}}").Output()
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, APIError{Error: "Docker is unavailable or could not list managed containers"})
		return
	}
	deployments := make([]Deployment, 0)
	for _, line := range strings.Split(strings.TrimSpace(string(output)), "\n") {
		parts := strings.SplitN(line, "|", 3)
		if len(parts) == 3 && parts[0] != "" && parts[1] != "" {
			deployments = append(deployments, Deployment{ID: parts[0], Name: parts[1], Status: parts[2]})
		}
	}
	writeJSON(w, http.StatusOK, deployments)
}

func ensureManagedContainer(ctx context.Context, name string) error {
	if !containerPattern.MatchString(name) {
		return fmt.Errorf("container name is not managed by Open-PaaS")
	}
	format := `{{ index .Config.Labels "open-paas.managed" }}`
	output, err := dockerCommand(ctx, "inspect", "--format", format, name).Output()
	if err != nil || strings.TrimSpace(string(output)) != "true" {
		return fmt.Errorf("container is not a managed Open-PaaS app")
	}
	return nil
}

func logsHandler(w http.ResponseWriter, r *http.Request) {
	if !methodOnly(w, r, http.MethodGet) {
		return
	}
	containerName := r.URL.Query().Get("container")
	if containerName == "" {
		writeJSON(w, http.StatusBadRequest, APIError{Error: "container query parameter is required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	if err := ensureManagedContainer(ctx, containerName); err != nil {
		writeJSON(w, http.StatusNotFound, APIError{Error: err.Error()})
		return
	}
	output, err := dockerCommand(ctx, "logs", "--tail", "100", containerName).CombinedOutput()
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, APIError{Error: "could not read logs for this app"})
		return
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	_, _ = w.Write(output)
}

func restartHandler(w http.ResponseWriter, r *http.Request) {
	if !methodOnly(w, r, http.MethodPost) {
		return
	}
	containerName := r.URL.Query().Get("container")
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()
	if err := ensureManagedContainer(ctx, containerName); err != nil {
		writeJSON(w, http.StatusNotFound, APIError{Error: err.Error()})
		return
	}
	if output, err := dockerCommand(ctx, "restart", containerName).CombinedOutput(); err != nil {
		log.Printf("restart %s: %v: %s", containerName, err, conciseOutput(output))
		writeJSON(w, http.StatusServiceUnavailable, APIError{Error: "could not restart this app"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "restarted", "container": containerName})
}

func relayHandler(w http.ResponseWriter, r *http.Request) {
	if !methodOnly(w, r, http.MethodGet) {
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeJSON(w, http.StatusInternalServerError, APIError{Error: "streaming is not supported by this server"})
		return
	}
	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache, no-transform")
	w.Header().Set("X-Accel-Buffering", "no")
	client := broker.subscribe()
	defer broker.unsubscribe(client)
	ticker := time.NewTicker(20 * time.Second)
	defer ticker.Stop()
	flusher.Flush()
	for {
		select {
		case message := <-client:
			for _, line := range strings.Split(message, "\n") {
				if _, err := fmt.Fprintf(w, "data: %s\n", line); err != nil {
					return
				}
			}
			if _, err := fmt.Fprint(w, "\n"); err != nil {
				return
			}
			flusher.Flush()
		case <-ticker.C:
			if _, err := fmt.Fprint(w, ": keep-alive\n\n"); err != nil {
				return
			}
			flusher.Flush()
		case <-r.Context().Done():
			return
		}
	}
}

func publishHandler(w http.ResponseWriter, r *http.Request) {
	if !methodOnly(w, r, http.MethodPost) {
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxRequestBytes))
	if err != nil {
		writeJSON(w, http.StatusRequestEntityTooLarge, APIError{Error: "message exceeds the request size limit"})
		return
	}
	if !json.Valid(body) {
		writeJSON(w, http.StatusBadRequest, APIError{Error: "message must be valid JSON"})
		return
	}
	if !broker.publish(string(body)) {
		writeJSON(w, http.StatusServiceUnavailable, APIError{Error: "relay is busy; try again shortly"})
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]string{"status": "published"})
}
