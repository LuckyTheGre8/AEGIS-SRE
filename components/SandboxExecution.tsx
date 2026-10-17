"use client";

import { Braces, Code2, Copy, Terminal, Check, LoaderCircle, Play, RefreshCw } from "lucide-react";
import { useState } from "react";
import { SmokeResultSchema, SmokeStatusSchema, type SmokeResult } from "@/lib/sandbox/smoke-types";
import { Panel } from "./Panel";
import type { InvestigationResult } from "@/lib/investigation/result";

function formatOutput(result: SmokeResult | null) {
  if (!result) return "# No smoke test run yet.\n# Run the three fixed commands in a real CreateOS sandbox.\n# No incident diagnosis or AI is involved.";
  const lines = [
    `RUN ${result.id}`,
    `WHOAMI ${result.authenticated ? `verified (${result.userId})` : "not verified"}`,
    `SANDBOX ${result.sandbox?.id ?? "not returned"}`,
    `NAME ${result.sandboxName}`,
    ...(result.sandbox ? [`PROFILE ${result.sandbox.shape} · ${result.sandbox.rootfs}`] : []),
    "",
  ];
  for (const command of result.commands) {
    lines.push(`$ ${command.command} ${command.args.join(" ")}`, "STDOUT:", command.stdout || "(empty)", "STDERR:", command.stderr || "(empty)", `EXIT ${command.exitCode} · ${command.durationMs} ms`, "");
  }
  if (result.error) lines.push(`ERROR [${result.error.code}] ${result.error.message}`);
  lines.push(`CLEANUP ${result.cleanup.status}`);
  if (result.cleanup.error) lines.push(result.cleanup.error.message);
  lines.push(`RESULT ${result.status} · ${result.durationMs} ms total`, `COMPLETED ${result.completedAt}`);
  return lines.join("\n");
}

export function SandboxExecution({ investigation, investigating = false }: { investigation?: InvestigationResult | null; investigating?: boolean }) {
  const [tab, setTab] = useState<"output" | "source">("output");
  const [result, setResult] = useState<SmokeResult | null>(null);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const output = investigation ? [
    `INVESTIGATION ${investigation.id}`,
    `MODEL ${investigation.model?.provider ?? "unconfigured"} / ${investigation.model?.model ?? "—"}`,
    `SANDBOX ${investigation.sandboxId ?? "not created"}`,
    ...investigation.evidence.map((evidence) => `\n${evidence.id} · ${evidence.source}\n${evidence.raw ?? evidence.summary}`),
    `\nCLEANUP ${investigation.cleanup}`,
    `OUTCOME ${investigation.outcome} · production NOT EXECUTED`,
  ].join("\n") : formatOutput(result);
  const source = "# No diagnostic tool generated.\n# v0.3 uses only fixed read-only diagnostics.\n# Model-generated programs are a later milestone.";

  async function runSmokeTest() {
    setRunning(true);
    setNotice("");
    setResult(null);
    setTab("output");
    try {
      const response = await fetch("/api/sandbox/smoke", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
      });
      const parsed = SmokeResultSchema.safeParse(await response.json());
      if (!parsed.success) {
        setNotice(response.status === 409 ? "A run is active or cleanup needs attention. Refresh the latest result." : `Smoke request failed (HTTP ${response.status}). No execution result was received.`);
        return;
      }
      setResult(parsed.data);
    } catch {
      setNotice("The request was interrupted. Cleanup continues on the server; refresh the latest result before retrying.");
    } finally { setRunning(false); }
  }

  async function refreshResult() {
    setNotice("");
    try {
      const response = await fetch("/api/sandbox/smoke", { cache: "no-store" });
      const parsed = SmokeStatusSchema.safeParse(await response.json());
      if (!response.ok || !parsed.success) { setNotice("Could not read the latest smoke-test status."); return; }
      setRunning(parsed.data.running);
      setResult(parsed.data.lastResult);
      setNotice(parsed.data.running ? "The server is still running the smoke test. Refresh again shortly." : "");
    } catch { setNotice("Could not reach the smoke-test status endpoint."); }
  }

  const cleanupBlocked = result && ["FAILED", "UNCONFIRMED"].includes(result.cleanup.status);
  return <Panel title="Sandbox execution" icon={<Terminal size={16} />} className="execution-panel" aside={<span className="subtle-tag">CREATEOS</span>}>
    <div className="smoke-controls">
      <button className="button primary" disabled={running || !!cleanupBlocked || investigating || !!investigation} onClick={() => void runSmokeTest()}>
        {running ? <LoaderCircle size={13} className="spin" /> : <Play size={13} />}
        {running ? "Running real smoke test…" : "Run CreateOS smoke test"}
      </button>
      <button className="icon-button" disabled={!!investigation || investigating} aria-label="Refresh smoke-test result" title="Refresh smoke-test result" onClick={() => void refreshResult()}><RefreshCw size={14} /></button>
      <span>{investigation ? "Investigation output · reset the incident to use the standalone smoke test" : "whoami → create → execute → destroy"}</span>
    </div>
    <div className="execution-toolbar"><div className="tabs" role="tablist" aria-label="Execution details">
      <button id="output-tab" role="tab" aria-selected={tab === "output"} aria-controls="execution-content" className={tab === "output" ? "selected" : ""} onClick={() => setTab("output")}><Terminal size={13} />Output</button>
      <button id="source-tab" role="tab" aria-selected={tab === "source"} aria-controls="execution-content" className={tab === "source" ? "selected" : ""} onClick={() => setTab("source")}><Code2 size={13} />Generated source</button>
    </div><button className="icon-button" aria-label="Copy panel text" title="Copy panel text" onClick={async () => {
      try { await navigator.clipboard.writeText(tab === "output" ? output : source); setCopied(true); setCopyError(""); setTimeout(() => setCopied(false), 1800); }
      catch { setCopyError("Clipboard unavailable in this browser."); }
    }}>{copied ? <Check size={14} /> : <Copy size={14} />}</button></div>
    <div className="terminal-body smoke-terminal" id="execution-content" role="tabpanel" aria-labelledby={`${tab}-tab`} tabIndex={0}>
      <div className="terminal-location"><span className="terminal-dots"><i /><i /><i /></span><span>{tab === "output" ? "aegis / sandbox" : "aegis / generated-tools"}</span><span className="terminal-language">{tab === "output" ? "TERMINAL" : "SOURCE"}</span></div>
      <pre>{tab === "output" ? output : source}</pre>
      {running && <div className="terminal-awaiting"><LoaderCircle size={13} className="spin" /><span className="awaiting-label">Waiting for real execution and cleanup confirmation…</span></div>}
      {notice && <p className="form-error" role="status">{notice}</p>}
      {copyError && <p className="form-error" role="status">{copyError}</p>}
    </div>
    <div className="execution-footer" role="status" aria-live="polite"><span><span className={`mini-dot ${investigation?.cleanup === "DESTROYED" || result?.status === "PASSED" ? "" : "muted"}`} />{investigating ? "Investigation running" : investigation ? `${investigation.state} · cleanup ${investigation.cleanup}` : running ? "Smoke test running" : result ? `${result.status} · cleanup ${result.cleanup.status}` : "No smoke test run"}</span><span>{investigation ? `${investigation.evidence.length} OBSERVATIONS` : result ? `${result.commands.length}/3 COMMANDS · ${result.durationMs} ms` : "3 FIXED COMMANDS"}</span></div>
    <div className="execution-boundary"><Braces size={13} />Real stdout, stderr, exit codes and guest execution durations.</div>
  </Panel>;
}
