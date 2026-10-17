import { NextResponse } from "next/server";
import { APP_VERSION as version } from "@/lib/version";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "aegis-sre",
    version,
    milestone: "real-createos",
    timestamp: new Date().toISOString(),
    capabilities: {
      incidentPreparation: true,
      investigation: false,
      sandboxExecution: true,
      sandboxConfigured: Boolean(process.env.CREATEOS_SANDBOX_API_KEY?.trim()),
      productionMutation: false,
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
