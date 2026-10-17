import { z } from "zod";
import { FIXTURE_CATALOG, type FixtureId } from "./catalog";
import { SERVER, BOOTSTRAP, RUNNER } from "../tools/fixture-programs";
import { HEALTH_CHECK, APPLY_PATCH } from "../patch/guest";
import { FixtureConfigSchema, EnvironmentConfigSchema, HealthConfigSchema, ProxyPatchSchema, EnvironmentPatchSchema, HealthPatchSchema, type FixtureConfig, type GeneratedPatch } from "../patch/schemas";
import * as additional from "./programs";

export interface FixtureDefinition {
  id: FixtureId;
  title: string;
  incidentText: string;
  description: string;
  diagnosticContract: string;
  probeTargets: readonly string[];
  files: Record<string, string>;
  healthCheck: string;
  applyPatch: string;
  allowedFiles: readonly string[];
  expectedFailureClass: string;
  expectedFailureStatus: number;
  configSchema: z.ZodType<FixtureConfig>;
  hasConfigFault: (config: FixtureConfig) => boolean;
  patchSchema: z.ZodType<GeneratedPatch>;
  patchConstraints: { path: GeneratedPatch["path"]; description: string };
}

const file = "/workspace/fixture-config.json";
const definitions: Record<FixtureId, FixtureDefinition> = {
  "broken-proxy": {
    ...FIXTURE_CATALOG[0],
    diagnosticContract: 'Synthetic broken-proxy: live backend and proxy. readConfig() returns {proxyPort,backendPort,upstreamPort}. probe("proxy"|"backend"|"configuredUpstream") returns actual loopback HTTP observations. Compare runtime port values and endpoint responses to identify the fault.',
    probeTargets: ["proxy", "backend", "configuredUpstream"],
    files: { [file]: JSON.stringify({ proxyPort: 8080, backendPort: 3000, upstreamPort: 3001 }, null, 2), "/workspace/fixture-server.cjs": SERVER, "/workspace/bootstrap.cjs": BOOTSTRAP, "/workspace/tool-runner.cjs": RUNNER },
    healthCheck: HEALTH_CHECK, applyPatch: APPLY_PATCH, allowedFiles: [file], expectedFailureClass: "HTTP_502", expectedFailureStatus: 502,
    configSchema: FixtureConfigSchema, patchSchema: ProxyPatchSchema,
    hasConfigFault: config => { const parsed = FixtureConfigSchema.parse(config); return parsed.upstreamPort !== parsed.backendPort; },
    patchConstraints: { path: "/upstreamPort", description: "One guarded upstreamPort replacement using observed port values." },
  },
  "missing-environment": additionalDefinition(1, {
    servicePort: 3000, requiredVariable: "AEGIS_DEMO_GREETING", environmentValue: "", expectedValue: "hello-aegis",
  }, {
    environment: true, failureStatus: 500, primary: "request", baseline: "health", patchKey: "environmentValue",
    probes: { request: { path: "/" }, health: { path: "/health" }, metadata: { path: "/metadata" } },
  }, EnvironmentConfigSchema, EnvironmentPatchSchema, "/environmentValue",
  'readConfig() returns servicePort, requiredVariable, environmentValue and expectedValue (all synthetic). The service loads environmentValue into the named process environment variable on start/reload. probe("request") GET /, probe("health") GET /health, probe("metadata") GET /metadata report live observations. Compare request error, runtime presence metadata, and configuration. Only the synthetic environmentValue may be replaced.'),
  "broken-health-check": additionalDefinition(2, {
    servicePort: 3000, healthPath: "/healthz", applicationPath: "/ready",
  }, {
    environment: false, failureStatus: 404, primary: "configuredHealth", baseline: "application", patchKey: "healthPath",
    probes: { configuredHealth: { configPath: "healthPath" }, application: { path: "/" }, readiness: { configPath: "applicationPath" } },
  }, HealthConfigSchema, HealthPatchSchema, "/healthPath",
  'readConfig() returns servicePort, healthPath (configured probe path), applicationPath (readiness endpoint). probe("configuredHealth") uses configured healthPath; probe("application") GET /; probe("readiness") uses applicationPath. Compare actual endpoint responses with configured monitor path. Only healthPath may be replaced with a safe loopback path.'),
};

function additionalDefinition(index: 1 | 2, config: FixtureConfig, contract: { environment: boolean; failureStatus: number; primary: string; baseline: string; patchKey: string; probes: Record<string, { path?: string; configPath?: string }> }, configSchema: z.ZodType<FixtureConfig>, patchSchema: z.ZodType<GeneratedPatch>, path: GeneratedPatch["path"], diagnosticContract: string): FixtureDefinition {
  return {
    ...FIXTURE_CATALOG[index], diagnosticContract, probeTargets: Object.keys(contract.probes),
    files: { [file]: JSON.stringify(config, null, 2), "/workspace/fixture-contract.json": JSON.stringify(contract), "/workspace/fixture-server.cjs": additional.SERVICE, "/workspace/bootstrap.cjs": additional.BOOTSTRAP, "/workspace/tool-runner.cjs": additional.RUNNER },
    healthCheck: additional.HEALTH_CHECK, applyPatch: additional.APPLY_PATCH,
    allowedFiles: [file], expectedFailureClass: `HTTP_${contract.failureStatus}`, expectedFailureStatus: contract.failureStatus,
    configSchema, patchSchema,
    hasConfigFault: config => { const fields = config as unknown as Record<string, unknown>; return fields[contract.patchKey] !== fields[contract.environment ? "expectedValue" : "applicationPath"]; },
    patchConstraints: { path, description: `One guarded ${contract.patchKey} replacement; no other configuration changes.` },
  };
}

export function fixtureDefinition(id: FixtureId = "broken-proxy"): FixtureDefinition {
  const definition = definitions[id];
  if (!definition) throw new Error("Unknown synthetic fixture.");
  return definition;
}
