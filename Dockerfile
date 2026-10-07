FROM golang:1.27-alpine
RUN apk add --no-cache docker-cli git curl
WORKDIR /app
COPY go.mod main.go ./
RUN go build -o paas-engine .
EXPOSE 8080
CMD ["./paas-engine"]
