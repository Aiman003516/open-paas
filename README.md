# Open-PaaS 🚀

Open-PaaS is a hyper-modern, lightweight Platform-as-a-Service (PaaS) engine designed to build and deploy applications instantly. It brings Vercel-like developer experience and Fly.io-like edge networking to your own infrastructure.

## 🌟 Features

1. **Instant Builds via Nixpacks** 📦
   Automatically detects your application's language (Node, Python, Go, Rust, etc.) and builds a production-ready OCI image without writing a `Dockerfile`.

2. **WASI 0.2 MicroVMs** ⚡
   If your project contains a `main.wasm` file, the Engine bypasses Docker completely and runs your WebAssembly module on a `wasmtime` MicroVM, achieving cold-start times of `<10ms` (similar to Cloudflare Workers).

3. **Edge Data Network (Local-First SQLite)** 💾
   Zero-configuration persistent databases. Every deployed container automatically gets a dedicated Docker volume mounted at `/data` with the `DATABASE_URL` environment variable injected natively.

4. **Zero-Trust Security & Microsegmentation** 🔒
   Built-in resource hard-limits to prevent noisy-neighbor attacks. Every container is automatically isolated with strict boundaries:
   - `--cpus 0.5`
   - `--memory 512m`
   - `--pids-limit 100`
   - `--security-opt no-new-privileges:true`

5. **Agentic DevOps (MCP Server)** 🧠
   Ships with a built-in Model Context Protocol (MCP) server located in `/mcp-server`. Connect any AI agent (Claude, Cursor, etc.) to automatically monitor your deployments, read stack traces via `/logs`, and self-heal crashed containers via `/restart`.

6. **Stateful SSE Relay (Actor-Model)** 📡
   A built-in global message broker running on the Engine. Deployed microservices can use Server-Sent Events (SSE) to natively subscribe to channels (`/relay`) and broadcast events (`/publish`) to other containers in real-time, completely bypassing the need for Redis or Kafka.

7. **Public Tunnels** 🌐
   Automatic deployment to the public internet using `localtunnel`, giving you instant `https://*.loca.lt` URLs for every single deployment.

---

## 🛠️ Quick Start (Local Setup)

The absolute easiest way to run the entire stack (The Go Engine + The Next.js Dashboard) is using the unified Docker Compose setup:

```bash
# 1. Clone the repository
git clone https://github.com/Aiman003516/open-paas.git
cd open-paas

# 2. Start the PaaS Engine and Dashboard
docker-compose up -d --build
```

That's it! 
- The Next.js Dashboard is now running at `http://localhost:3000`
- The Go Engine is listening at `http://localhost:8080`

### 💻 Using the Dashboard
Open `http://localhost:3000` in your browser. Enter a public GitHub repository URL and click **Deploy**. The Engine will instantly clone it, build it, and provide you with a live URL!

---

## 🤖 Using the Agentic DevOps MCP Server

If an app crashes, you don't need to manually check logs. You can instruct an AI agent to do it for you.

1. Navigate to the MCP server directory:
```bash
cd mcp-server
npm install
```

2. Add the MCP server to your AI Client's configuration (e.g., Claude Desktop `claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "open-paas-agentic-devops": {
      "command": "node",
      "args": ["/absolute/path/to/open-paas/mcp-server/index.js"]
    }
  }
}
```

3. The AI now has real-time access to the following tools:
   - `list_containers`: Returns all running apps.
   - `get_container_logs`: Reads the stack trace of any app.
   - `restart_container`: Hard-reboots a container to heal it.

---

## 📡 Stateful Relay API

The PaaS Engine acts as a central communication hub for your deployed microservices.

**Subscribe to global events (Listen):**
```bash
curl -N http://localhost:8080/relay
```

**Broadcast an event to all containers:**
```bash
curl -X POST http://localhost:8080/publish -d '{"service": "auth", "event": "user_signup"}'
```

---

## 🏗️ Architecture Stack

- **Backend / PaaS Engine:** Built in standard `Go`.
- **Frontend / Dashboard:** Built with `Next.js 15` + `Tailwind CSS`.
- **Builder:** `Nixpacks` (by Railway/Vercel).
- **WebAssembly Runtime:** `Wasmtime`.
- **Orchestrator:** `Docker CLI` + `Docker Compose`.

Enjoy building the future of the web! 🚀
