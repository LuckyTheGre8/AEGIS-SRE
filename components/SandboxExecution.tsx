"use client";

import { Braces, Code2, Copy, Terminal, Check } from "lucide-react";
import { useState } from "react";
import { Panel } from "./Panel";

export function SandboxExecution() {
  const [tab, setTab] = useState<"output" | "source">("output");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const output = "# Aegis SRE · v0.1 foundation\n# No sandbox provisioned.\n# Command output will appear after real execution is connected.";
  const source = "# No diagnostic tool generated.\n# Model-generated source and policy review will appear here\n# when tool generation is implemented.";

  return <Panel title="Sandbox execution" icon={<Terminal size={16} />} className="execution-panel" aside={<span className="subtle-tag">CREATEOS</span>}>
    <div className="execution-toolbar"><div className="tabs" role="tablist" aria-label="Execution details">
      <button id="output-tab" role="tab" aria-selected={tab === "output"} aria-controls="execution-content" className={tab === "output" ? "selected" : ""} onClick={() => setTab("output")}><Terminal size={13} />Output</button>
      <button id="source-tab" role="tab" aria-selected={tab === "source"} aria-controls="execution-content" className={tab === "source" ? "selected" : ""} onClick={() => setTab("source")}><Code2 size={13} />Generated source</button>
    </div><button className="icon-button" aria-label="Copy panel text" title="Copy panel text" onClick={async () => {
      try { await navigator.clipboard.writeText(tab === "output" ? output : source); setCopied(true); setCopyError(""); setTimeout(() => setCopied(false), 1800); }
      catch { setCopyError("Clipboard unavailable in this browser."); }
    }}>{copied ? <Check size={14} /> : <Copy size={14} />}</button></div>
    <div className="terminal-body" id="execution-content" role="tabpanel" aria-labelledby={`${tab}-tab`} tabIndex={0}>
      <div className="terminal-location"><span className="terminal-dots"><i /><i /><i /></span><span>{tab === "output" ? "aegis / sandbox" : "aegis / generated-tools"}</span><span className="terminal-language">{tab === "output" ? "TERMINAL" : "SOURCE"}</span></div>
      <pre>{tab === "output" ? output : source}</pre>
      <div className="terminal-awaiting"><span>›</span><span className="cursor" /><span className="awaiting-label">{tab === "output" ? "Awaiting sandbox connection" : "Awaiting generated diagnostic"}</span></div>
      {copyError && <p className="form-error" role="status">{copyError}</p>}
    </div>
    <div className="execution-footer"><span><span className="mini-dot muted" /> No active sandbox</span><span>EXIT <b>—</b><span className="context-separator" />DURATION <b>—</b></span></div>
    <div className="execution-boundary"><Braces size={13} /> Real stdout, stderr, and exit codes only.</div>
  </Panel>;
}
