# The Next-Generation Open-Source PaaS (Architecture & Master Plan)

## Vision
To build the world's first **Zero-Config, Local-First, Zero-Trust PaaS**. A platform that allows developers to turn any local laptop, Raspberry Pi, or cheap VPS into a production-ready edge node. It bypasses NAT/Firewalls instantly using Cloudflare Tunnels, builds code autonomously using Nixpacks, and secures the host using kernel-level eBPF microsegmentation.

---

## Phase 1: The Zero-Config Engine (✅ COMPLETED)
**Goal:** Orchestrate Docker and bypass CGNAT without manual configuration.
- [x] Go Engine HTTP Webhook Listener.
- [x] Docker CLI integration for container orchestration.
- [x] Native Cloudflare Tunnel (`trycloudflare.com`) integration.
- [x] Dynamic URL extraction and routing.

## Phase 2: GitOps & Autonomous Build (🚧 NEXT)
**Goal:** Transform raw GitHub code into running applications automatically.
- [ ] **Git Integration:** Auto-clone repositories from GitHub Webhooks.
- [ ] **Nixpacks Engine:** Run Nixpacks inside a Docker container to automatically detect languages (Node, Python, Go) and build optimized Docker images without local dependencies.
- [ ] **Ephemeral PR Previews:** Listen for Pull Request events, build the branch, generate a temporary Cloudflare URL, and post the link as a GitHub comment. Auto-destroy the container when the PR closes.

## Phase 3: Zero-Trust Security & eBPF Microsegmentation
**Goal:** Guarantee that running public apps on a home laptop is 100% secure.
- [ ] **Docker Rootless Mode:** Enforce all deployments to run without root privileges.
- [ ] **eBPF LSM (Linux Security Modules):** Implement kernel-level sandboxing. 
- [ ] **LAN Egress Blocking:** Explicitly drop any outbound traffic from the containers attempting to reach private LAN IP ranges (e.g., `192.168.0.0/16` or `10.0.0.0/8`). Prevent lateral movement attacks natively.

## Phase 4: Agentic DevOps via MCP (AI Auto-Healing)
**Goal:** Allow AI models to monitor and fix broken deployments in real-time.
- [ ] **Embedded MCP Server:** Add a Model Context Protocol (MCP) server to the Go Engine.
- [ ] **Observability API:** Expose container metrics, build states, and crash logs to the MCP interface.
- [ ] **AI Auto-Healing:** Allow AI assistants (like Claude or Cursor) to query the PaaS, read the Docker logs of a crashing app, identify missing environment variables, and automatically propose or inject fixes.

## Phase 5: The Edge Data Network (Local-First Sync)
**Goal:** Eradicate the need for central cloud databases (like AWS RDS).
- [ ] **LiteFS & SQLite:** Default to distributed SQLite databases using LiteFS (FUSE-based replication).
- [ ] **Active-Active CRDT Syncing:** Implement Conflict-Free Replicated Data Types (like ElectricSQL) so multiple local environments can write data simultaneously, resolving conflicts automatically when reconnected to the mesh.

## Phase 6: WASI 0.2 MicroVMs & Confidential Computing
**Goal:** Millisecond cold-starts and military-grade isolation.
- [ ] **Firecracker MicroVMs:** Run untrusted code or AI-generated functions in Firecracker for <125ms cold starts.
- [ ] **WASI 0.2 Component Model:** Support WebAssembly execution for edge functions with <1ms latency and strict linear memory isolation.
- [ ] **Confidential Enclaves:** Support AMD SEV-SNP and Intel TDX to encrypt the container's RAM, ensuring not even the host machine owner can steal API keys or data from the running app.

## Phase 7: Stateful WebSocket Relays (Actor-Model)
**Goal:** Solve the Cloudflare Tunnel timeout issue for real-time apps.
- [ ] **Gateway Relay:** Build a persistent edge gateway that holds WebSocket connections open for clients.
- [ ] **Actor-Model Coordination:** If the underlying Cloudflare Tunnel resets (due to the 100-second idle limit), the Gateway holds the client connection alive while the local PaaS instantly reconnects, resulting in zero state loss for real-time multiplayer apps.

## Phase 8: The Vercel-like Dashboard
**Goal:** The GUI for managing the decentralized mesh.
- [ ] Build a Next.js or React frontend.
- [ ] Connect GitHub OAuth.
- [ ] Stream Nixpacks build logs via WebSockets to the UI.
- [ ] Manage Environment Variables, Custom Domains, and scaling limits.
