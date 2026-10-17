import { NextResponse } from "next/server";
import { IncidentInputSchema } from "@/lib/agent/schemas";
import { llmFromEnvironment } from "@/lib/agent/gemini";
import { investigate } from "@/lib/agent/orchestrator";
import { createOSFromEnvironment } from "@/lib/sandbox/createos";
import type { InvestigationResult } from "@/lib/investigation/result";
import { isAllowedRequestOrigin } from "@/lib/http/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const host = globalThis as typeof globalThis & { __aegisInvestigation?: { running: boolean; lastResult: InvestigationResult | null } };
const state = host.__aegisInvestigation ??= { running: false, lastResult: null };
const headers = { "Cache-Control": "no-store" };

export function GET() { return NextResponse.json(state, { headers }); }

export async function POST(request: Request) {
  if (!isAllowedRequestOrigin(request)) return NextResponse.json({ error: "Cross-origin investigations are blocked." }, { status: 403, headers });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({ error: "Send a JSON incident and fixture identifier." }, { status: 415, headers });
  let input: unknown;
  try {
    const text = await request.text();
    if (text.length > 6000) throw new Error("Input too large");
    input = JSON.parse(text);
  } catch { return NextResponse.json({ error: "Invalid or oversized JSON input." }, { status: 400, headers }); }
  const parsed = IncidentInputSchema.safeParse(input);
  if (!parsed.success) return NextResponse.json({ error: "Incident input failed validation; shell commands are not accepted." }, { status: 400, headers });
  if (state.running) return NextResponse.json({ error: "An investigation is already running." }, { status: 409, headers });
  if (state.lastResult && (["FAILED", "UNCONFIRMED"].includes(state.lastResult.cleanup) || (state.lastResult.validation && ["FAILED", "UNCONFIRMED"].includes(state.lastResult.validation.cleanup)))) return NextResponse.json({ error: "Confirm previous diagnosis and validation sandbox cleanup before restarting the server." }, { status: 409, headers });
  state.running = true;
  try {
    state.lastResult = await investigate(parsed.data, llmFromEnvironment, createOSFromEnvironment);
    return NextResponse.json(state.lastResult, { status: state.lastResult.outcome === "FAILED" ? 502 : 200, headers });
  } finally { state.running = false; }
}
