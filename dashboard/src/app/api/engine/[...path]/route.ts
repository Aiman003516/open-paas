type RouteParams = {
  params: Promise<{ path: string[] }>;
};

const FORWARDED_PATHS = new Set(["health", "deploy", "deployments", "logs"]);

async function forward(request: Request, context: RouteParams): Promise<Response> {
  const token = process.env.OPEN_PAAS_API_TOKEN?.trim();
  if (!token) {
    return Response.json({ error: "The dashboard is missing its engine API token." }, { status: 503 });
  }

  const { path } = await context.params;
  const endpoint = path.join("/");
  if (!FORWARDED_PATHS.has(endpoint)) {
    return Response.json({ error: "Unknown engine endpoint." }, { status: 404 });
  }

  const allowedOrigins = (process.env.DASHBOARD_ALLOWED_ORIGINS || "http://localhost:3000,http://127.0.0.1:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const origin = request.headers.get("origin");
  if (origin && !allowedOrigins.includes(origin)) {
    return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  }

  const engineBase = (process.env.OPEN_PAAS_ENGINE_URL || "http://localhost:8080").replace(/\/+$/, "");
  const target = new URL(`${engineBase}/${endpoint}`);
  target.search = new URL(request.url).search;

  const headers = new Headers({ Authorization: `Bearer ${token}` });
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const responseHeaders = new Headers();
    const upstreamContentType = upstream.headers.get("content-type");
    if (upstreamContentType) responseHeaders.set("Content-Type", upstreamContentType);
    responseHeaders.set("Cache-Control", "no-store");
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch {
    return Response.json({ error: "Could not reach the Open-PaaS engine." }, { status: 502 });
  }
}

export async function GET(request: Request, context: RouteParams) {
  return forward(request, context);
}

export async function POST(request: Request, context: RouteParams) {
  return forward(request, context);
}
