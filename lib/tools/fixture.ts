import type { SandboxProvider, SandboxSession } from "../sandbox/provider";
import { fixtureDefinition } from "../fixtures/registry";
export { RUNNER } from "./fixture-programs";
import { AgentError } from "../agent/provider";

export const FIXTURE_DESCRIPTION = `Synthetic broken-proxy: live backend and proxy with an upstream configuration fault. readConfig() returns {proxyPort,backendPort,upstreamPort}. probe("proxy"|"backend"|"configuredUpstream") returns actual loopback HTTP {port,status,body,error}. Inspect values at runtime; no production system is involved.`;

export async function installFixture(provider: SandboxProvider, session: SandboxSession, fixture = fixtureDefinition()) {
  const mkdir = await provider.execute(session, "mkdir", ["-p", "/workspace"], { timeoutMs: 20_000 });
  if (mkdir.exitCode !== 0) throw new AgentError("FIXTURE_SETUP", "Could not create the fixture directory.");
  for (const [path, source] of Object.entries(fixture.files)) await provider.upload(session, path, source);
  const output = await provider.execute(session, "node", ["/workspace/bootstrap.cjs"], { timeoutMs: 20_000 });
  if (output.exitCode !== 0) throw new AgentError("FIXTURE_SETUP", "Synthetic fixture did not start successfully.");
  try {
    const data = JSON.parse(output.stdout);
    if (data.proxy.status !== fixture.expectedFailureStatus || data.backend.status !== 200) throw new Error("Not reproduced");
  } catch { throw new AgentError("FIXTURE_SETUP", "Fixture did not demonstrate its expected failure and healthy baseline."); }
  return output;
}
