import { z } from "zod";
import { CommandResultSchema, PatchArtifactSchema } from "../agent/schemas";

export const FixtureConfigSchema = z.strictObject({
  proxyPort: z.number().int().min(1).max(65535),
  backendPort: z.number().int().min(1).max(65535),
  upstreamPort: z.number().int().min(1).max(65535),
});
export const EnvironmentConfigSchema = z.strictObject({
  servicePort: z.literal(3000), requiredVariable: z.literal("AEGIS_DEMO_GREETING"),
  environmentValue: z.string().max(128), expectedValue: z.literal("hello-aegis"),
});
export const HealthConfigSchema = z.strictObject({
  servicePort: z.literal(3000), healthPath: z.string().regex(/^\/[a-zA-Z0-9/-]{0,64}$/), applicationPath: z.literal("/ready"),
});
export const AnyFixtureConfigSchema = z.union([FixtureConfigSchema, EnvironmentConfigSchema, HealthConfigSchema]);
export type FixtureConfig = z.infer<typeof AnyFixtureConfigSchema>;

// A single data change, never executable model output or an arbitrary file path.
export const ProxyPatchSchema = z.strictObject({
  file: z.literal("/workspace/fixture-config.json"),
  operation: z.literal("replace"),
  path: z.literal("/upstreamPort"),
  oldValue: z.number().int().min(1).max(65535),
  value: z.number().int().min(1).max(65535),
  rootCause: z.string().min(1).max(240),
  reason: z.string().min(1).max(240),
  evidenceIds: z.array(z.string().min(1)).min(1).max(10),
  risk: z.literal("SANDBOX_MUTATION"),
});
export const EnvironmentPatchSchema = ProxyPatchSchema.extend({
  path: z.literal("/environmentValue"), oldValue: z.string().max(128), value: z.string().min(1).max(128),
});
export const HealthPatchSchema = ProxyPatchSchema.extend({
  path: z.literal("/healthPath"), oldValue: z.string().regex(/^\/[a-zA-Z0-9/-]{0,64}$/), value: z.string().regex(/^\/[a-zA-Z0-9/-]{0,64}$/),
});
export const GeneratedPatchSchema = z.discriminatedUnion("path", [ProxyPatchSchema, EnvironmentPatchSchema, HealthPatchSchema]);
export type GeneratedPatch = z.infer<typeof GeneratedPatchSchema>;

export const HealthObservationSchema = z.object({
  proxy: z.object({ port: z.number().int(), status: z.number().int().nullable(), body: z.string() }),
  backend: z.object({ port: z.number().int(), status: z.number().int().nullable(), body: z.string() }),
  regression: z.object({ pass: z.boolean(), description: z.string() }),
});

export const PatchValidationSchema = z.object({
  status: z.enum(["PROPOSED", "FAILED_VALIDATION", "VERIFIED"]),
  diagnosisSandboxId: z.string(), validationSandboxId: z.string().nullable(),
  proposal: GeneratedPatchSchema,
  patch: PatchArtifactSchema,
  policy: z.object({ decision: z.enum(["ALLOW", "DENY"]), reason: z.string() }),
  beforeStatus: z.number().int().nullable(), afterStatus: z.number().int().nullable(),
  patchApplied: z.boolean(), regression: z.enum(["NOT_RUN", "PASS", "FAIL"]),
  commands: z.array(z.object({ phase: z.enum(["RECREATE", "BEFORE", "APPLY_RELOAD", "AFTER_REGRESSION"]), command: z.string(), result: CommandResultSchema })),
  cleanup: z.enum(["NOT_REQUIRED", "DESTROYED", "FAILED", "UNCONFIRMED"]),
  error: z.object({ code: z.string(), message: z.string() }).optional(),
});
export type PatchValidation = z.infer<typeof PatchValidationSchema>;
