package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
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

func main() {
	// Register API Routes
	http.HandleFunc("/webhook", enableCORS(webhookHandler))
	http.HandleFunc("/deploy", enableCORS(webhookHandler)) // Same as webhook for now
	http.HandleFunc("/deployments", enableCORS(getDeploymentsHandler))
	http.HandleFunc("/logs", enableCORS(getLogsHandler))

	fmt.Println("🚀 Open-PaaS Engine started on port 8080")
	fmt.Println("API Endpoints Ready:")
	fmt.Println(" - POST /webhook (GitHub triggers)")
	fmt.Println(" - POST /deploy  (Dashboard manual deploy)")
	fmt.Println(" - GET  /deployments (List running apps)")
	fmt.Println(" - GET  /logs?container=my-app (Stream logs)")
	
	log.Fatal(http.ListenAndServe(":8080", nil))
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
	fmt.Println("🧹 Step 1: Cleaning up old deployments...")
	exec.Command("docker", "rm", "-f", "my-app", "my-tunnel").Run()
	os.RemoveAll(".tmp-build")

	fmt.Println("📥 Step 2: Cloning repository...")
	err := exec.Command("git", "clone", repoURL, ".tmp-build").Run()
	if err != nil {
		fmt.Printf("❌ Failed to clone repo: %v\n", err)
		return
	}

	fmt.Println("⚙️  Step 3: Running Nixpacks Builder...")
	pwd, _ := os.Getwd()
	repoPath := filepath.Join(pwd, ".tmp-build")
	
	buildCmd := exec.Command("docker", "run", "--rm", 
		"-e", "DOCKER_BUILDKIT=0",
		"-v", "/var/run/docker.sock:/var/run/docker.sock", 
		"-v", repoPath+":/app", 
		"open-paas-builder", "build", "/app", "--name", "my-custom-app")
	
	buildCmd.Stdout = os.Stdout
	buildCmd.Stderr = os.Stderr
	err = buildCmd.Run()
	if err != nil {
		fmt.Printf("❌ Nixpacks build failed: %v\n", err)
		return
	}

	fmt.Println("📦 Step 4: Spinning up application...")
	err = exec.Command("docker", "run", "-d", "-e", "PORT=3000", "--name", "my-app", "my-custom-app").Run()
	if err != nil {
		fmt.Printf("❌ Failed to start app container: %v\n", err)
		return
	}

	fmt.Println("☁️  Step 5: Provisioning Tunnel...")
	tunnelArgs := []string{"run", "-d", "--name", "my-tunnel", "--link", "my-app", "node:18-alpine", "npx", "localtunnel", "--port", "3000", "--local-host", "my-app"}
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

	logs, _ := exec.Command("docker", "logs", "my-tunnel").CombinedOutput()
	re := regexp.MustCompile(`https://[a-zA-Z0-9-]+\.loca\.lt`)
	match := re.FindString(string(logs))

	if match != "" {
		fmt.Printf("\n✅ SUCCESS! LIVE at: 🌐 %s\n\n", match)
	} else {
		fmt.Println("⚠️  Could not parse Tunnel URL yet. Check logs.")
	}
}
