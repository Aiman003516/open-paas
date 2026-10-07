# Open-PaaS — direction and current shape

## Product direction

Open-PaaS is a personal, self-hosted place to experiment with deploying small projects. A developer runs it on their own machine, brings a public GitHub repository, and uses Docker to build and run the app. The product should stay approachable: a focused dashboard, clear status, and useful feedback without hosted-platform assumptions.

## Current implementation

- Go HTTP engine with health, deployment, container list, logs, restart, and SSE relay endpoints.
- Next.js dashboard for submitting public GitHub repository URLs, seeing managed containers, and viewing recent app logs.
- Bearer-token authentication on engine endpoints, with a same-origin dashboard proxy keeping the token server-side.
- Nixpacks build through a locally built builder image.
- Docker app containers with resource limits and persistent `/data` volumes.
- Optional temporary LocalTunnel URL.
- Isolated temporary clone directories for concurrent builds.

The app is an early personal-use project. It has no interactive user sign-in, private repository support, deployment database, durable build history, or dashboard build-log stream. The engine API token protects requests but is not a multi-user identity system. It should remain on a trusted local machine until safer build isolation is in place.

## Practical next steps

1. Add a deployment/job record with explicit queued, building, running, and failed states.
2. Stream build progress and errors into the dashboard.
3. Add a straightforward way to open a running app's public URL and restart or remove it.
4. Document supported project types, app port expectations, and how persistent data is mounted.
5. Before connecting from outside the local machine, design access controls and a build isolation model that does not expose the host Docker socket to untrusted build code.

## Keep the scope clear

Container execution, network exposure, and Docker-socket access are not a security boundary for hostile source code. Feature descriptions should reflect verified behavior rather than roadmap ideas.
