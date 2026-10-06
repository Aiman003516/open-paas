package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
)

type WebhookPayload struct {
	RepoURL   string `json:"repo_url"`
	Subdomain string `json:"subdomain"`
}

type Deployment struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Status string `json:"status"`
}

// Middleware to allow the Next.js Dashboard to call this API without CORS errors
func enableCORS(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		next(w, r)
	}
}

var (
	clients   = make(map[chan string]bool)
	broadcast = make(chan string)
	mutex     = &sync.Mutex{}
)

func main() {
	// Start the relay broker
	go handleMessages()

	// Register API Routes
	http.HandleFunc("/webhook", enableCORS(webhookHandler))
	http.HandleFunc("/deploy", enableCORS(webhookHandler)) // Same as webhook for now
	http.HandleFunc("/deployments", enableCORS(getDeploymentsHandler))
	http.HandleFunc("/logs", enableCORS(getLogsHandler))
	http.HandleFunc("/restart", enableCORS(restartHandler))
	
	// Phase 7: Stateful Relay
	http.HandleFunc("/relay", enableCORS(relayHandler))
	http.HandleFunc("/publish", enableCORS(publishHandler))

	fmt.Println("🚀 Open-PaaS Engine started on port 8080")
	fmt.Println("API Endpoints Ready:")
	fmt.Println(" - POST /webhook (GitHub triggers)")
	fmt.Println(" - POST /deploy  (Dashboard manual deploy)")
	fmt.Println(" - GET  /deployments (List running apps)")
	fmt.Println(" - GET  /logs?container=my-app (Stream logs)")
	fmt.Println(" - POST /restart?container=my-app (Restart container)")
	fmt.Println(" - GET  /relay   (Subscribe to events)")
	fmt.Println(" - POST /publish (Send event)")
	
	log.Fatal(http.ListenAndServe(":8080", nil))
}

// Endpoint: POST /restart
func restartHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	containerName := r.URL.Query().Get("container")
	if containerName == "" {
		http.Error(w, "Missing container query param", http.StatusBadRequest)
		return
	}
	err := exec.Command("docker", "restart", containerName).Run()
	if err != nil {
		http.Error(w, "Failed to restart container", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("Container restarted successfully"))
}

// Endpoint: GET /deployments
func getDeploymentsHandler(w http.ResponseWriter, r *http.Request) {
	// Read running Docker containers to show them on the Dashboard
	out, err := exec.Command("docker", "ps", "--format", "{{.ID}}|{{.Names}}|{{.Status}}").Output()
	if err != nil {
		http.Error(w, "Failed to get deployments", http.StatusInternalServerError)
		return
	}

	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	var deployments []Deployment

	for _, line := range lines {
		if line == "" {
			continue
		}
		parts := strings.Split(line, "|")
		if len(parts) >= 3 {
			deployments = append(deployments, Deployment{
				ID:     parts[0],
				Name:   parts[1],
				Status: parts[2],
			})
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(deployments)
}

// Endpoint: GET /logs
func getLogsHandler(w http.ResponseWriter, r *http.Request) {
	containerName := r.URL.Query().Get("container")
	if containerName == "" {
		containerName = "my-app" // default to the main app if not specified
	}

	// Fetch the last 100 lines of logs from the Docker container
	out, err := exec.Command("docker", "logs", "--tail", "100", containerName).CombinedOutput()
	if err != nil {
		w.Header().Set("Content-Type", "text/plain")
		w.Write([]byte("Container not found or starting up..."))
		return
	}

	w.Header().Set("Content-Type", "text/plain")
	w.Write(out)
}

// Endpoint: POST /webhook or /deploy
func webhookHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Only POST requests are allowed", http.StatusMethodNotAllowed)
		return
	}

	repoURL := "https://github.com/heroku/node-js-getting-started"
	subdomain := ""
	var payload WebhookPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err == nil {
		if payload.RepoURL != "" {
			repoURL = payload.RepoURL
		}
		if payload.Subdomain != "" {
			subdomain = payload.Subdomain
		}
	}

	fmt.Printf("\n🔔 Deployment triggered for: %s (Subdomain: %s)\n", repoURL, subdomain)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status": "Deploying", "repo": "` + repoURL + `"}`))

	go runPipeline(repoURL, subdomain)
}

func runPipeline(repoURL, subdomain string) {
	// Generate unique names based on the subdomain
	containerName := "app"
	if subdomain != "" {
		containerName = "app-" + subdomain
	}
	imageName := containerName + "-image"
	tunnelName := containerName + "-tunnel"

	fmt.Println("🧹 Step 1: Cleaning up old deployments...")
	exec.Command("docker", "rm", "-f", containerName, tunnelName).Run()
	os.RemoveAll(".tmp-build")

	fmt.Println("📥 Step 2: Cloning repository...")
	err := exec.Command("git", "clone", repoURL, ".tmp-build").Run()
	if err != nil {
		fmt.Printf("❌ Failed to clone repo: %v\n", err)
		return
	}

	pwd, _ := os.Getwd()
	repoPath := filepath.Join(pwd, ".tmp-build")

	// Phase 6: WASI 0.2 MicroVMs & Confidential Computing
	wasmPath := filepath.Join(repoPath, "main.wasm")
	if _, err := os.Stat(wasmPath); err == nil {
		fmt.Println("⚡ WebAssembly (WASI) MicroVM detected! Bypassing Docker...")
		fmt.Println("🚀 Spinning up Wasmtime runtime in <10ms...")
		
		runWasm := exec.Command("wasmtime", "serve", "main.wasm", "--addr", "0.0.0.0:3000")
		runWasm.Dir = repoPath
		runWasm.Start() // Run in background

		fmt.Println("☁️  Step 5: Provisioning Tunnel for MicroVM...")
		tunnelArgs := []string{"run", "-d", "--name", tunnelName, "--network", "host", "node:18-alpine", "npx", "localtunnel", "--port", "3000"}
		if subdomain != "" {
			tunnelArgs = append(tunnelArgs, "--subdomain", subdomain)
		}
		exec.Command("docker", tunnelArgs...).Run()
		
		time.Sleep(3 * time.Second)
		logs, _ := exec.Command("docker", "logs", tunnelName).CombinedOutput()
		re := regexp.MustCompile(`https://[a-zA-Z0-9-]+\.loca\.lt`)
		match := re.FindString(string(logs))
		if match != "" {
			fmt.Printf("\n✅ MICRO-VM SUCCESS! LIVE at: 🌐 %s\n\n", match)
		}
		return // Skip docker build
	}

	fmt.Println("⚙️  Step 3: Running Nixpacks Builder...")
	
	buildCmd := exec.Command("docker", "run", "--rm", 
		"-e", "DOCKER_BUILDKIT=0",
		"-v", "/var/run/docker.sock:/var/run/docker.sock", 
		"-v", repoPath+":/app", 
		"open-paas-builder", "build", "/app", "--name", imageName)
	
	buildCmd.Stdout = os.Stdout
	buildCmd.Stderr = os.Stderr
	err = buildCmd.Run()
	if err != nil {
		fmt.Printf("❌ Nixpacks build failed: %v\n", err)
		return
	}

	fmt.Println("📦 Step 4: Provisioning Edge Database & Spinning up application...")
	volumeName := containerName + "-data"
	exec.Command("docker", "volume", "create", volumeName).Run()

	err = exec.Command("docker", "run", "-d", 
		"--cpus", "0.5", 
		"--memory", "512m", 
		"--pids-limit", "100", 
		"--security-opt", "no-new-privileges:true", 
		"-v", volumeName+":/data", 
		"-e", "PORT=3000", 
		"-e", "DATABASE_URL=sqlite:///data/sqlite.db", 
		"--name", containerName, imageName).Run()
	if err != nil {
		fmt.Printf("❌ Failed to start app container: %v\n", err)
		return
	}

	fmt.Println("☁️  Step 5: Provisioning Tunnel...")
	tunnelArgs := []string{"run", "-d", "--name", tunnelName, "--link", containerName, "node:18-alpine", "npx", "localtunnel", "--port", "3000", "--local-host", containerName}
	if subdomain != "" {
		tunnelArgs = append(tunnelArgs, "--subdomain", subdomain)
	}

	err = exec.Command("docker", tunnelArgs...).Run()
	if err != nil {
		fmt.Printf("❌ Failed to start tunnel: %v\n", err)
		return
	}

	fmt.Println("⏳ Waiting for Tunnel...")
	time.Sleep(6 * time.Second)

	logs, _ := exec.Command("docker", "logs", tunnelName).CombinedOutput()
	re := regexp.MustCompile(`https://[a-zA-Z0-9-]+\.loca\.lt`)
	match := re.FindString(string(logs))

	if match != "" {
		fmt.Printf("\n✅ SUCCESS! LIVE at: 🌐 %s\n\n", match)
	} else {
		fmt.Println("⚠️  Could not parse Tunnel URL yet. Check logs.")
	}
}

// --- Phase 7: Stateful SSE Relay Handlers ---
func handleMessages() {
	for {
		msg := <-broadcast
		mutex.Lock()
		for client := range clients {
			client <- msg
		}
		mutex.Unlock()
	}
}

func relayHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	messageChan := make(chan string)
	mutex.Lock()
	clients[messageChan] = true
	mutex.Unlock()

	defer func() {
		mutex.Lock()
		delete(clients, messageChan)
		mutex.Unlock()
		close(messageChan)
	}()

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming unsupported", http.StatusInternalServerError)
		return
	}

	for {
		select {
		case msg := <-messageChan:
			fmt.Fprintf(w, "data: %s\n\n", msg)
			flusher.Flush()
		case <-r.Context().Done():
			return
		}
	}
}

func publishHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	body, _ := io.ReadAll(r.Body)
	broadcast <- string(body)
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("Published"))
}
