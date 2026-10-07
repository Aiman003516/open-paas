# Open-PaaS

Open-PaaS is a small, self-hosted app deployment experiment for developers who want to try their own projects on their own machine. It pairs a Go engine with a lightweight dashboard and Docker-based builds.

It is intended for **personal projects and trusted code** running on your own machine.

## What works today

- Submit a public GitHub repository from the dashboard.
- Clone it into an isolated temporary directory and build an image with Nixpacks.
- Run the app in a resource-limited Docker container with a persistent `/data` volume.
- Create a temporary public URL through LocalTunnel.
- View managed app containers and recent container logs in the dashboard.
- Send and receive JSON messages through the engine's SSE relay.

## What is not included

There is no sign-in, private-repository support, durable deployment history, or build-log streaming to the dashboard. Build and tunnel failures are currently reported by the engine process logs. The LocalTunnel address is provided by a third party and is not a permanent custom domain.

## Run it locally

Requirements: Docker with Compose, Git, and an internet connection for image/package downloads.

```bash
git clone https://github.com/Aiman003516/open-paas.git
cd open-paas
cp .env.example .env
printf 'OPEN_PAAS_API_TOKEN=%s\n' "$(openssl rand -hex 32)" > .env
docker compose up --build
```

The dashboard is at [http://localhost:3000](http://localhost:3000). The dashboard and engine ports are published only on loopback by the included Compose file.

To stop the stack:

```bash
docker compose down
```

The Compose setup builds the `open-paas-builder` image before starting the engine. If you run the engine outside Compose, build that image yourself:

```bash
docker build -f Dockerfile.builder -t open-paas-builder .
```

## Safety notes

The engine controls the local Docker daemon. Building an app runs code from that repository, and the builder needs access to the Docker socket to create images. **Only deploy code you trust.** Keep the engine and dashboard bound to loopback; do not publish either port to the internet or an untrusted network.

The engine requires an `OPEN_PAAS_API_TOKEN` Bearer token of at least 32 characters on every endpoint. Store it in the untracked `.env` file; the dashboard's server-side proxy attaches it to engine requests, so it is not exposed to browser JavaScript. CORS restricts browser origins but is not authentication—the token is the API authentication mechanism. Keep `.env` private and generate a unique token for each installation.

The default allowed browser origins are `http://localhost:3000` and `http://127.0.0.1:3000`. Set `CORS_ALLOWED_ORIGINS` and `DASHBOARD_ALLOWED_ORIGINS` if you use a different local dashboard origin.

## API overview

- `GET /health` — engine liveness (Bearer token required)
- `POST /deploy` — start a deployment (`{"repo_url":"https://github.com/owner/repo","subdomain":"optional-name"}`)
- `GET /deployments` — list Open-PaaS-managed app containers
- `GET /logs?container=<managed-container>` — last 100 container log lines
- `POST /restart?container=<managed-container>` — restart a managed app
- `GET /relay` — subscribe to server-sent events
- `POST /publish` — publish a JSON message to relay subscribers

Deployment requests return `202 Accepted` after validation. Builds run asynchronously; the dashboard currently shows container runtime logs, not build output or a durable deployment status.

## Stack

- Engine: Go standard library and Docker CLI
- Dashboard: Next.js, React, Tailwind CSS
- Builder: Nixpacks
- Temporary public URLs: LocalTunnel
