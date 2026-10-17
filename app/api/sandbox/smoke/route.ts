import { NextResponse } from "next/server";
import { createOSFromEnvironment } from "@/lib/sandbox/createos";
import { runSandboxSmokeTest } from "@/lib/sandbox/smoke";
import type { SmokeResult } from "@/lib/sandbox/smoke-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Shared across hot reloads; one local server process, no external job system.
const host = globalThis as typeof globalThis & { __aegisSmoke?: { running: boolean; lastResult: SmokeResult | null } };
const state = host.__aegisSmoke ??= { running: false, lastResult: null };
const headers = { "Cache-Control": "no-store" };

export function GET() {
  return NextResponse.json(state, { headers });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  // Next can canonicalize request.url to an internal hostname. The HTTP Host
  // header retains the host the browser actually requested (including port).
  const publicUrl = new URL(request.url);
  const requestedHost = request.headers.get("host");
  if (requestedHost) publicUrl.host = requestedHost;
  if ((origin && origin !== publicUrl.origin) || request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: "Cross-origin smoke tests are not allowed." }, { status: 403, headers });
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return NextResponse.json({ error: "Send application/json with an empty object. Commands cannot be supplied." }, { status: 415, headers });
  }
  const body = await request.text();
  try {
    if (body.trim() !== "{}") throw new Error("Unexpected input");
  } catch {
    return NextResponse.json({ error: "The smoke test accepts only {}. All commands are fixed on the server." }, { status: 400, headers });
  }
  if (state.running) return NextResponse.json({ error: "A smoke test is already running. Refresh the latest result." }, { status: 409, headers });
  if (state.lastResult && ["FAILED", "UNCONFIRMED"].includes(state.lastResult.cleanup.status)) {
    return NextResponse.json({ error: "The previous sandbox needs cleanup confirmation. Resolve it before restarting the local server." }, { status: 409, headers });
  }

  state.running = true;
  try {
    state.lastResult = await runSandboxSmokeTest(createOSFromEnvironment, process.env.CREATEOS_SANDBOX_SHAPE?.trim() || undefined);
    if (state.lastResult.status === "FAILED") {
      console.error("CreateOS smoke test failed", { id: state.lastResult.id, phase: state.lastResult.phase, error: state.lastResult.error, cleanup: state.lastResult.cleanup });
    }
    return NextResponse.json(state.lastResult, { status: state.lastResult.status === "PASSED" ? 200 : 502, headers });
  } finally {
    state.running = false;
  }
}
