interface OriginEnvironment { APP_ORIGIN?: string; ALLOWED_ORIGIN?: string; NODE_ENV?: string }

function canonicalOrigin(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch { return null; }
}

function isLoopback(origin: string): boolean {
  return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname);
}

export function isAllowedRequestOrigin(request: Request, environment: OriginEnvironment = process.env): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const suppliedOrigin = request.headers.get("origin");
  // Preserve existing non-browser clients; JSON/body validation still applies.
  if (suppliedOrigin === null) return true;
  const origin = canonicalOrigin(suppliedOrigin);
  if (!origin) return false;

  const development = environment.NODE_ENV === "development";
  if (isLoopback(origin) && !development) return false;
  // The configured external origin survives TLS termination and rewritten Host
  // headers. Never infer production trust from Host or X-Forwarded-* headers.
  const configured = [environment.APP_ORIGIN, environment.ALLOWED_ORIGIN].map(canonicalOrigin);
  if (configured.includes(origin)) return true;
  if (!development || !isLoopback(origin)) return false;

  const localUrl = new URL(request.url);
  const requestedHost = request.headers.get("host");
  if (requestedHost) localUrl.host = requestedHost;
  return origin === localUrl.origin;
}
