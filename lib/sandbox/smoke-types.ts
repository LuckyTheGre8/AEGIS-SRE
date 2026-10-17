import { z } from "zod";
import { CommandResultSchema } from "../agent/schemas";

const ErrorSchema = z.object({ code: z.string(), message: z.string(), statusCode: z.number().optional(), requestId: z.string().optional() });
export const SmokeResultSchema = z.object({
  id: z.string(),
  provider: z.literal("createos"),
  status: z.enum(["PASSED", "FAILED"]),
  phase: z.enum(["AUTHENTICATION", "PROVISIONING", "EXECUTION", "CLEANUP"]),
  startedAt: z.iso.datetime(),
  completedAt: z.iso.datetime(),
  durationMs: z.number().nonnegative(),
  authenticated: z.boolean(),
  userId: z.string().optional(),
  sandboxName: z.string(),
  sandbox: z.object({ id: z.string(), name: z.string(), shape: z.string(), rootfs: z.string() }).nullable(),
  commands: z.array(CommandResultSchema.extend({ command: z.string(), args: z.array(z.string()) })),
  cleanup: z.object({
    status: z.enum(["NOT_REQUIRED", "DESTROYED", "FAILED", "UNCONFIRMED"]),
    sandboxId: z.string().optional(), error: ErrorSchema.optional(),
  }),
  error: ErrorSchema.optional(),
});

export type SmokeResult = z.infer<typeof SmokeResultSchema>;

export const SmokeStatusSchema = z.object({ running: z.boolean(), lastResult: SmokeResultSchema.nullable() });
