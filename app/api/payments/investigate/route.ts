import { paymentHandlers } from "@/lib/payments/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const POST = paymentHandlers.investigate;
