import {
  createClient, CreateosSandboxApiError, CreateosSandboxConnectionError,
  CreateosSandboxNotFoundError, CreateosSandboxTimeoutError,
  type CreateosSandboxClient, type Sandbox,
} from "@nodeops-createos/sandbox";
import { CommandResultSchema } from "../agent/schemas";
import {
  SandboxError, SandboxProvisionError,
  type CleanupReceipt, type SafeSandboxError, type SandboxCreateOptions,
  type SandboxExecOptions, type SandboxProvider, type SandboxSession,
} from "./provider";

const REQUEST_TIMEOUT_MS = 10_000;

/** Never expose an SDK response, error body, auth header, or raw error message. */
export function safeSandboxError(error: unknown): SafeSandboxError {
  if (error instanceof SandboxError) return error.detail;
  if (error instanceof CreateosSandboxApiError) {
    const messages: Record<number, string> = {
      400: "CreateOS rejected the sandbox configuration.",
      401: "CreateOS rejected the API key. Check the key and its issued endpoint.",
      402: "CreateOS requires additional account credits.",
      403: "CreateOS denied access. Check account permissions and quota.",
      404: "The CreateOS resource was not found.",
      409: "CreateOS rejected the resource's current state.",
      422: "CreateOS rejected the sandbox configuration.",
      429: "CreateOS rate limit reached. Wait before retrying.",
    };
    return {
      code: `CREATEOS_HTTP_${error.statusCode}`,
      message: messages[error.statusCode] ?? "The CreateOS control plane could not complete the request.",
      statusCode: error.statusCode,
      ...(error.requestId ? { requestId: error.requestId } : {}),
    };
  }
  if (error instanceof CreateosSandboxTimeoutError) return { code: "CREATEOS_TIMEOUT", message: "CreateOS exceeded the request deadline." };
  if (error instanceof CreateosSandboxConnectionError) return { code: "CREATEOS_CONNECTION", message: "Cannot reach the configured CreateOS control plane." };
  return { code: "SANDBOX_ERROR", message: "Sandbox operation failed. Check the server's safe diagnostic log." };
}

export function createOSFromEnvironment(): CreateOSSandboxProvider {
  const apiKey = process.env.CREATEOS_SANDBOX_API_KEY?.trim();
  if (!apiKey) throw new SandboxError({ code: "MISSING_CONFIGURATION", message: "Set CREATEOS_SANDBOX_API_KEY on the server before running the smoke test." });
  const baseUrl = process.env.CREATEOS_SANDBOX_BASE_URL?.trim() || "https://api.sb.createos.sh";
  let url: URL;
  try { url = new URL(baseUrl); }
  catch { throw new SandboxError({ code: "INVALID_CONFIGURATION", message: "CREATEOS_SANDBOX_BASE_URL must be a valid HTTPS URL." }); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new SandboxError({ code: "INVALID_CONFIGURATION", message: "Use the issued HTTPS CreateOS endpoint without credentials, query strings, or fragments." });
  }
  return new CreateOSSandboxProvider(createClient({ apiKey, baseUrl, timeoutMs: REQUEST_TIMEOUT_MS, retry: false }));
}

export class CreateOSSandboxProvider implements SandboxProvider {
  private readonly sessions = new Map<string, Sandbox>();

  constructor(private readonly client: CreateosSandboxClient) {}

  async authenticate() {
    const identity = await this.client.whoami({ timeoutMs: REQUEST_TIMEOUT_MS });
    if (!identity.user_id) throw new SandboxError({ code: "INVALID_IDENTITY", message: "CreateOS did not return an authenticated user ID." });
    return { userId: identity.user_id };
  }

  async create(options: SandboxCreateOptions): Promise<SandboxSession> {
    const [shapes, images] = await Promise.all([
      this.client.listShapes({ timeoutMs: REQUEST_TIMEOUT_MS }),
      this.client.listRootfs({ timeoutMs: REQUEST_TIMEOUT_MS }),
    ]);
    const shape = options.shape
      ? shapes.find((entry) => entry.id === options.shape)
      : shapes.find((entry) => entry.id === "s-2vcpu-4gb")
        ?? shapes.filter((entry) => entry.mem_mib >= 1024 && entry.vcpu >= 1)
          .sort((a, b) => a.mem_mib - b.mem_mib || a.vcpu - b.vcpu)[0];
    if (!shape) throw new SandboxError({ code: "UNAVAILABLE_SHAPE", message: "The requested sandbox shape is unavailable in the live catalog." });
    if (!images.rootfs.includes("devbox:1")) throw new SandboxError({ code: "UNAVAILABLE_ROOTFS", message: "The live CreateOS catalog does not offer devbox:1." });

    try {
      // Current SDK creates synchronously. Disable POST retries to avoid duplicate VMs.
      const sandbox = await this.client.createSandbox({
        name: options.name, shape: shape.id, rootfs: "devbox:1", disk_mib: 10_240,
        ingress_enabled: false, auto_pause_after_seconds: 300,
      }, { timeoutMs: 60_000, retry: false });
      return this.remember(sandbox, { name: options.name, shape: shape.id, rootfs: "devbox:1" });
    } catch (error) {
      // A lost create response can still leave an allocated VM. Recover only this
      // run's unique name, never any pre-existing user sandbox.
      const definitiveRejection = error instanceof CreateosSandboxApiError
        && [400, 401, 402, 403, 404, 409, 422, 429].includes(error.statusCode);
      let cleanup: CleanupReceipt = { status: definitiveRejection ? "NOT_REQUIRED" : "UNCONFIRMED" };
      let session: SandboxSession | null = null;
      if (!definitiveRejection) {
        try {
          const boxes = await this.client.listSandboxes({ timeoutMs: REQUEST_TIMEOUT_MS, retry: false });
          const box = boxes.find((entry) => entry.name === options.name);
          if (box) {
            session = this.remember(box, { name: options.name, shape: shape.id, rootfs: "devbox:1" });
            cleanup = { status: "FAILED", sandboxId: box.id };
            await this.destroy(session);
            cleanup = { status: "DESTROYED", sandboxId: box.id };
          }
        } catch (recoveryError) {
          cleanup.error = safeSandboxError(recoveryError);
        }
      }
      throw new SandboxProvisionError(safeSandboxError(error), cleanup, session);
    }
  }

  private remember(sandbox: Sandbox, details: Omit<SandboxSession, "id">): SandboxSession {
    this.sessions.set(sandbox.id, sandbox);
    return { id: sandbox.id, ...details };
  }

  private handle(session: SandboxSession): Sandbox {
    const handle = this.sessions.get(session.id);
    if (!handle) throw new SandboxError({ code: "UNKNOWN_SESSION", message: "This provider does not own that sandbox session." });
    return handle;
  }

  async execute(session: SandboxSession, command: string, args: string[] = [], options: SandboxExecOptions = {}) {
    const timeoutMs = Math.min(Math.max(options.timeoutMs ?? 20_000, 1), 20_000);
    const response = await this.handle(session).runCommand(command, args, { timeoutMs, retry: false });
    if (response.result.error) throw new SandboxError({ code: "COMMAND_START_FAILED", message: "The CreateOS guest agent could not start the command." });
    return CommandResultSchema.parse({
      stdout: response.result.stdout,
      stderr: response.result.stderr,
      exitCode: response.result.exit_code,
      durationMs: response.exec_ms,
    });
  }

  async upload(session: SandboxSession, absolutePath: string, contents: string | Uint8Array) {
    if (!absolutePath.startsWith("/") || absolutePath.split("/").includes("..")) {
      throw new SandboxError({ code: "INVALID_GUEST_PATH", message: "File upload requires an absolute guest path without traversal." });
    }
    const body = typeof contents === "string" ? contents : new Uint8Array(contents).buffer;
    await this.handle(session).files.upload(absolutePath, body, { timeoutMs: 20_000, retry: false });
  }

  async destroy(session: SandboxSession): Promise<void> {
    const sandbox = this.handle(session);
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await sandbox.destroy({ timeoutMs: REQUEST_TIMEOUT_MS, retry: false });
        await sandbox.waitUntilDestroyed({ timeoutMs: 20_000, request: { timeoutMs: 5_000, retry: false } });
        this.sessions.delete(session.id);
        return;
      } catch (error) {
        if (error instanceof CreateosSandboxNotFoundError) {
          this.sessions.delete(session.id);
          return;
        }
        lastError = error;
      }
    }
    throw new SandboxError({ ...safeSandboxError(lastError), code: "CLEANUP_FAILED", message: `Could not confirm destruction of sandbox ${session.id}. Manual cleanup is required.` });
  }
}
