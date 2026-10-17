import { NextResponse } from "next/server";
import { z } from "zod";
import { IncidentInputSchema } from "../agent/schemas";
import type { IncidentInput } from "../agent/types";
import { isAllowedRequestOrigin } from "../http/origin";
import { CaptureInputSchema, PaidInvestigationSchema, PaymentLinkSchema } from "./schemas";
import { PaymentError, PaymentService } from "./service";

export const PAYMENT_COOKIE = "aegis-payment-owner";
const headers = { "Cache-Control": "no-store" };
const OwnerSchema = z.string().uuid();
function ownerFromRequest(request: Request): string | null {
  const value = request.headers.get("cookie")?.split(";").map(part => part.trim()).find(part => part.startsWith(`${PAYMENT_COOKIE}=`))?.slice(PAYMENT_COOKIE.length + 1);
  const parsed = OwnerSchema.safeParse(value); return parsed.success ? parsed.data : null;
}

export function createPaymentHandlers(service: PaymentService, configuration: () => { configured: boolean; mode: "test" | "live"; publishableKey?: string }, run: (request: Request, input: IncidentInput) => Promise<Response>) {
  async function handle(request: Request, action: "status" | "create" | "capture" | "cancel" | "investigate") {
    let owner = ownerFromRequest(request);
    const setCookie = action === "create" && !owner;
    if (setCookie) owner = crypto.randomUUID();
    let response: Response;
    try {
      if (!isAllowedRequestOrigin(request)) throw new PaymentError(403, "Cross-origin payment actions are blocked.");
      if (action === "status") {
        const config = configuration();
        return NextResponse.json({ ...config, payment: config.configured ? await service.status(owner) : null }, { headers });
      }
      if (!owner) throw new PaymentError(401, "Start a payment in this browser session first.");
      if (!request.headers.get("content-type")?.startsWith("application/json")) throw new PaymentError(415, "Send JSON payment input.");
      const text = await request.text();
      if (text.length > 6500) throw new PaymentError(400, "Payment input is too large.");
      let data: unknown;
      try { data = JSON.parse(text); } catch { throw new PaymentError(400, "Invalid JSON payment input."); }
      if (action === "investigate") {
        const parsed = PaidInvestigationSchema.parse(data);
        const input = IncidentInputSchema.parse({ incident: parsed.incident, fixture: parsed.fixture });
        response = await service.investigate(owner, parsed.attemptId, input, input => run(request, input));
      } else {
        const config = configuration();
        if (!config.configured) throw new PaymentError(503, "Set matching server-side STRIPE_SECRET_KEY and NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY from the same Stripe account and mode.");
        const value = action === "create" ? await service.create(owner, IncidentInputSchema.parse(data)) : { payment: action === "capture" ? await service.capture(owner, CaptureInputSchema.parse(data)) : await service.cancel(owner, PaymentLinkSchema.parse(data)) };
        response = NextResponse.json({ ...config, ...value }, { headers });
      }
    } catch (error) {
      // Stripe errors can contain request details. Return no raw provider error,
      // payment method, card data, SDK object, or secret key.
      response = NextResponse.json({ error: error instanceof PaymentError ? error.message : error instanceof z.ZodError ? "Payment input failed validation. Verification flags and arbitrary payment data are not accepted." : "Stripe payment operation failed. Refresh status before retrying; no capture is implied." }, { status: error instanceof PaymentError ? error.status : error instanceof z.ZodError ? 400 : 502, headers });
    }
    if (setCookie && owner && response instanceof NextResponse) response.cookies.set(PAYMENT_COOKIE, owner, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/api/payments", maxAge: 24 * 60 * 60 });
    return response;
  }
  return {
    status: (request: Request) => handle(request, "status"), create: (request: Request) => handle(request, "create"),
    capture: (request: Request) => handle(request, "capture"), cancel: (request: Request) => handle(request, "cancel"),
    investigate: (request: Request) => handle(request, "investigate"),
  };
}
