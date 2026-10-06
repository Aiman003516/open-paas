#!/usr/bin/env node
const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");

const ENGINE_URL = process.env.ENGINE_URL || "http://localhost:8080";

const server = new Server(
  {
    name: "open-paas-agentic-devops",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list_containers",
        description: "List all deployed application containers and their current status.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_container_logs",
        description: "Read the console logs of a specific container to diagnose crashes or errors.",
        inputSchema: {
          type: "object",
          properties: {
            containerName: {
              type: "string",
              description: "The name of the container (e.g. 'my-app-xxxx')",
            },
          },
          required: ["containerName"],
        },
      },
      {
        name: "restart_container",
        description: "Restart a specific container to heal it after an error or crash.",
        inputSchema: {
          type: "object",
          properties: {
            containerName: {
              type: "string",
              description: "The name of the container to restart",
            },
          },
          required: ["containerName"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "list_containers") {
      const response = await fetch(`${ENGINE_URL}/deployments`);
      const data = await response.json();
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }

    if (name === "get_container_logs") {
      const { containerName } = args;
      const response = await fetch(`${ENGINE_URL}/logs?container=${containerName}`);
      const text = await response.text();
      return {
        content: [{ type: "text", text: text }],
      };
    }

    if (name === "restart_container") {
      const { containerName } = args;
      const response = await fetch(`${ENGINE_URL}/restart?container=${containerName}`, {
        method: "POST",
      });
      const text = await response.text();
      return {
        content: [{ type: "text", text: text }],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error calling tool ${name}: ${error.message}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Open-PaaS MCP Server running on stdio");
}

main().catch(console.error);
