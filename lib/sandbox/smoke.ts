import { performance } from "node:perf_hooks";
import { safeSandboxError } from "./createos";
import { SandboxError, SandboxProvisionError, type SandboxProvider, type SandboxSession } from "./provider";
import { SmokeResultSchema, type SmokeResult } from "./smoke-types";

export const SMOKE_COMMANDS = [
  { command: "uname", args: ["-a"] },
  { command: "python3", args: ["--version"] },
  { command: "node", args: ["--version"] },
] as const;

/** Fixed smoke test, deliberately independent of the incident/agent workflow. */
export async function runSandboxSmokeTest(providerFactory: () => SandboxProvider, shape?: string): Promise<SmokeResult> {
  const started = performance.now();
  const result: SmokeResult = {
    id: crypto.randomUUID(), provider: "createos", status: "FAILED", phase: "AUTHENTICATION",
    startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 0,
    // The live control plane limits sandbox names to 22 characters.
    sandboxName: `aegis-smoke-${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`, authenticated: false,
    sandbox: null, commands: [], cleanup: { status: "NOT_REQUIRED" },
  };
  let provider: SandboxProvider | undefined;
  let session: SandboxSession | undefined;
  try {
    provider = providerFactory();
    const identity = await provider.authenticate();
    result.authenticated = true;
    result.userId = identity.userId;
    result.phase = "PROVISIONING";
    session = await provider.create({ name: result.sandboxName, ...(shape ? { shape } : {}) });
    result.sandbox = session;
    result.cleanup = { status: "UNCONFIRMED", sandboxId: session.id };
    result.phase = "EXECUTION";
    for (const { command, args } of SMOKE_COMMANDS) {
      const output = await provider.execute(session, command, [...args], { timeoutMs: 20_000 });
      result.commands.push({ command, args: [...args], ...output });
    }
    if (result.commands.some((command) => command.exitCode !== 0)) {
      throw new SandboxError({ code: "COMMAND_NONZERO", message: "One or more smoke commands exited nonzero. Inspect the captured stdout and stderr." });
    }
    result.status = "PASSED";
  } catch (error) {
    result.error = safeSandboxError(error);
    if (error instanceof SandboxProvisionError) {
      result.cleanup = error.cleanup;
      result.sandbox = error.session;
    }
  } finally {
    // Do not tie cleanup to the browser's abort signal; it must run on disconnect.
    if (provider && session) {
      if (!result.error) result.phase = "CLEANUP";
      try {
        await provider.destroy(session);
        result.cleanup = { status: "DESTROYED", sandboxId: session.id };
      } catch (error) {
        result.status = "FAILED";
        result.cleanup = { status: "FAILED", sandboxId: session.id, error: safeSandboxError(error) };
      }
    }
    result.completedAt = new Date().toISOString();
    result.durationMs = Math.round(performance.now() - started);
  }
  return SmokeResultSchema.parse(result);
}
