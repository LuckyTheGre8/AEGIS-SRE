import { POST as investigate } from "../../app/api/investigate/route";
import { createPaymentHandlers } from "./http";
import { PaymentService, newPaymentStore, type PaymentStore } from "./service";
import { paymentConfiguration, stripeFromEnvironment } from "./stripe";

const host = globalThis as typeof globalThis & { __aegisPaymentStore?: PaymentStore };
const service = new PaymentService(stripeFromEnvironment, host.__aegisPaymentStore ??= newPaymentStore());
export const paymentHandlers = createPaymentHandlers(service, paymentConfiguration, (request, input) => investigate(new Request(new URL("/api/investigate", request.url), { method: "POST", headers: request.headers, body: JSON.stringify(input) })));
