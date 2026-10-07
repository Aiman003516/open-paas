import { forwardEngineRequest } from "./proxy-core.mjs";

type RouteParams = {
  params: Promise<{ path: string[] }>;
};

async function forward(request: Request, context: RouteParams) {
  const { path } = await context.params;
  return forwardEngineRequest(request, path.join("/"));
}

export async function GET(request: Request, context: RouteParams) {
  return forward(request, context);
}

export async function POST(request: Request, context: RouteParams) {
  return forward(request, context);
}
