FROM ubuntu:22.04

# Install basic dependencies
RUN apt-get update && apt-get install -y curl npm git docker.io

# Install Nixpacks CLI globally
RUN mkdir -p ~/.docker/cli-plugins/ && \
    curl -sLo ~/.docker/cli-plugins/docker-buildx https://github.com/docker/buildx/releases/download/v0.12.1/buildx-v0.12.1.linux-amd64 && \
    chmod +x ~/.docker/cli-plugins/docker-buildx
RUN curl -sSL https://nixpacks.com/install.sh | bash

# Expose docker socket capability and set entrypoint
ENTRYPOINT ["nixpacks"]
