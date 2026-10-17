import { NextResponse } from "next/server";
import { APP_VERSION as version } from "@/lib/version";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "aegis-sre",
    version,
    milestone: "fresh-sandbox-fix-verification",
    timestamp: new Date().toISOString(),
    capabilities: {
      incidentPreparation: true,
      investigation: true,
      llmConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
      generatedDiagnostics: true,
      patchVerification: true,
      sandboxExecution: true,
      sandboxConfigured: Boolean(process.env.CREATEOS_SANDBOX_API_KEY?.trim()),
      productionMutation: false,
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
