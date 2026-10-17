import { z } from "zod";
import { IncidentInputSchema } from "../agent/schemas";

export const PAYMENT_STATES = ["NOT_STARTED", "AUTHORIZING", "AUTHORIZED", "AWAITING_VERIFICATION", "READY_TO_CAPTURE", "CAPTURED", "RELEASED", "FAILED"] as const;
export const PaymentViewSchema = z.object({
  attemptId: z.string().uuid(), input: IncidentInputSchema,
  investigationId: z.string().nullable(), paymentIntentId: z.string().nullable(),
  amount: z.literal(500), currency: z.literal("usd"), testMode: z.boolean(),
  stripeStatus: z.string(), stage: z.enum(PAYMENT_STATES), started: z.boolean(),
  history: z.array(z.enum(PAYMENT_STATES)),
  verification: z.object({ outcome: z.string(), status: z.string(), before: z.number().nullable(), after: z.number().nullable(), regression: z.string(), diagnosisSandboxId: z.string().nullable(), validationSandboxId: z.string().nullable(), cleanup: z.string() }).nullable(),
  warning: z.string().optional(),
});
export type PaymentView = z.infer<typeof PaymentViewSchema>;
export const PaymentResponseSchema = z.object({ configured: z.boolean(), mode: z.enum(["test", "live"]), publishableKey: z.string().optional(), payment: PaymentViewSchema.nullable(), clientSecret: z.string().optional() });
export type PaymentResponse = z.infer<typeof PaymentResponseSchema>;
export const PaymentLinkSchema = z.strictObject({ attemptId: z.string().uuid(), paymentIntentId: z.string().regex(/^pi_[a-zA-Z0-9_]+$/) });
export const CaptureInputSchema = PaymentLinkSchema.extend({ investigationId: z.string().uuid(), approved: z.literal(true) });
export const PaidInvestigationSchema = IncidentInputSchema.extend({ attemptId: z.string().uuid() });

export function paymentMessage(payment: PaymentView | null): string {
  if (!payment) return "Authorize $5 in Stripe test mode before the next investigation.";
  switch (payment.stage) {
    case "CAPTURED": return "Payment captured for verified remediation.";
    case "READY_TO_CAPTURE": return "Fix independently verified. Payment is authorized; capture requires your approval.";
    case "AUTHORIZED": case "AWAITING_VERIFICATION": return "Payment authorized — awaiting verified remediation.";
    case "RELEASED": return payment.history.includes("AUTHORIZED") ? "Authorization released. Payment was not captured." : "PaymentIntent canceled before authorization. No payment was captured.";
    case "FAILED": return "Remediation not verified — payment not captured.";
    default: return "Complete Stripe authorization. This does not capture payment.";
  }
}
