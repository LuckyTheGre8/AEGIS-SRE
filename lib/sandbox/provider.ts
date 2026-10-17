import type { CommandResult } from "../agent/types";

export interface SandboxSession {
  id: string;
  name: string;
  shape: string;
  rootfs: string;
}

export interface SandboxCreateOptions {
  name: string;
  shape?: string;
}

export interface SandboxExecOptions {
  timeoutMs?: number;
}

export interface SandboxProvider {
  authenticate(): Promise<{ userId: string }>;
  create(options: SandboxCreateOptions): Promise<SandboxSession>;
  execute(session: SandboxSession, command: string, args?: string[], options?: SandboxExecOptions): Promise<CommandResult>;
  upload(session: SandboxSession, absolutePath: string, contents: string | Uint8Array): Promise<void>;
  /** Resolves only after destruction is confirmed, including an already-absent VM. */
  destroy(session: SandboxSession): Promise<void>;
}

export interface SafeSandboxError {
  code: string;
  message: string;
  statusCode?: number;
  requestId?: string;
}

export interface CleanupReceipt {
  status: "NOT_REQUIRED" | "DESTROYED" | "FAILED" | "UNCONFIRMED";
  sandboxId?: string;
  error?: SafeSandboxError;
}

export class SandboxError extends Error {
  constructor(public readonly detail: SafeSandboxError) {
    super(detail.message);
    this.name = "SandboxError";
  }
}

/** Carries recovery results when a create request fails after possible allocation. */
export class SandboxProvisionError extends SandboxError {
  constructor(detail: SafeSandboxError, public readonly cleanup: CleanupReceipt, public readonly session: SandboxSession | null) {
    super(detail);
    this.name = "SandboxProvisionError";
  }
}
