FROM golang:1.21-alpine

RUN apk add --no-cache docker-cli git curl bash
# Install Wasmtime
RUN touch ~/.bashrc && curl https://wasmtime.dev/install.sh -sSf | bash
ENV PATH="/root/.wasmtime/bin:$PATH"

WORKDIR /app
COPY main.go .
RUN go build -o paas-engine main.go

EXPOSE 8080
CMD ["./paas-engine"]
