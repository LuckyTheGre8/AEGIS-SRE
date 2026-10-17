"use client";

import { Activity, ArrowDown, ArrowUpRight, Box, Check, ChevronRight, CircleHelp, FileText, Fingerprint, GitBranch, LoaderCircle, LockKeyhole, Radio, RefreshCw, Shield, Sparkles } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { IncidentInput, InvestigationEvent } from "@/lib/agent/types";
import { APP_VERSION as version } from "@/lib/version";
import { IncidentForm } from "./IncidentForm";
import { InvestigationTimeline } from "./InvestigationTimeline";
import { SandboxExecution } from "./SandboxExecution";
import { EvidencePanel } from "./EvidencePanel";
import { ValidationResult } from "./ValidationResult";
import { InvestigationClient } from "@/lib/client/investigation-client";
import { DemoOutcome } from "./DemoOutcome";
import { Infrastructure } from "./Infrastructure";

type Health = "checking" | "healthy" | "unavailable";

async function fetchApplicationHealth(signal: AbortSignal): Promise<Health> {
  try {
    const response = await fetch("/api/health", { cache: "no-store", signal });
    const data: unknown = await response.json();
    return response.ok && typeof data === "object" && data !== null && "status" in data && data.status === "ok" ? "healthy" : "unavailable";
  } catch {
    return "unavailable";
  }
}

export function InvestigationWorkspace() {
  const [health, setHealth] = useState<Health>("checking");
  const [event, setEvent] = useState<InvestigationEvent | null>(null);
  const [client] = useState(() => new InvestigationClient());
  const view = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getServerSnapshot);
  const investigation = view.result;
  const busy = view.phase !== "idle";
  const investigating = view.phase === "running" || view.phase === "recovering";
  const elapsed = `${Math.floor(view.elapsedSeconds / 60)}:${String(view.elapsedSeconds % 60).padStart(2, "0")}`;
  useEffect(() => { client.start(); return () => client.stop(); }, [client]);
  const [showAbout, setShowAbout] = useState(false);
  const aboutRef = useRef<HTMLDialogElement>(null);
  const healthController = useRef<AbortController | null>(null);

  function checkHealth() {
    healthController.current?.abort();
    const controller = new AbortController();
    healthController.current = controller;
    const timer = setTimeout(() => controller.abort(), 8000);
    void fetchApplicationHealth(controller.signal).then((status) => {
      if (healthController.current === controller) setHealth(status);
    }).finally(() => clearTimeout(timer));
  }

  useEffect(() => {
    void checkHealth();
    return () => {
      healthController.current?.abort();
      healthController.current = null;
    };
  }, []);

  useEffect(() => {
    if (showAbout) aboutRef.current?.showModal();
    else aboutRef.current?.close();
  }, [showAbout]);

  function prepare(input: IncidentInput) {
    if (client.getSnapshot().phase !== "idle") return;
    setEvent({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), state: "RECEIVED", type: "incident_prepared", title: "Incident submitted", summary: "Input validated locally. Waiting for real server observations." });
    void client.submit(input);
  }
  function reset(clearResult = false) {
    if (client.getSnapshot().phase !== "idle") return;
    client.clear(clearResult); setEvent(null);
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <a href="#workspace" className="brand" aria-label="Aegis SRE workspace"><span className="brand-symbol"><Shield size={21} strokeWidth={1.7} /><span /></span><span>AEGIS<span className="brand-sre">SRE</span></span></a>
      <div className="workspace-label">WORKSPACE <span>01</span></div>
      <nav aria-label="Workspace"><a href="#workspace" className="nav-item active" aria-label="Investigation"><Activity size={17} /><span>Investigation</span><span className="nav-indicator" /></a><button className="nav-item" aria-label="Project notes" onClick={() => setShowAbout(true)}><FileText size={17} /><span>Project notes</span><ArrowUpRight size={13} /></button></nav>
      <div className="sidebar-section"><span className="eyebrow">THE AEGIS LOOP</span><div className="loop-item"><span>01</span>Observe</div><ArrowDown className="loop-arrow" size={11} /><div className="loop-item"><span>02</span>Generate & diagnose</div><ArrowDown className="loop-arrow" size={11} /><div className="loop-item"><span>03</span>Verify the fix</div></div>
      <div className="sidebar-bottom"><div className="boundary-card"><LockKeyhole size={16} /><h3>Evidence, then action.</h3><p>Isolated execution.<br />Human approval boundary.</p></div><button className="sidebar-help" onClick={() => setShowAbout(true)}><CircleHelp size={15} />About this build<ArrowUpRight size={13} /></button><div className="sidebar-version"><span className="mini-dot" />BOUNDED INVESTIGATION<span>v{version}</span></div></div>
    </aside>

    <div className="main-shell" id="workspace">
      <header className="topbar"><div className="breadcrumbs"><span>Workspace</span><ChevronRight size={12} /><strong>Investigation</strong></div><div className="topbar-right"><span className="environment-badge"><Box size={12} />CONTROL PLANE</span><span className="avatar">AG</span></div></header>
      <main>
        <div className="page-heading"><div><div className="eyebrow page-eyebrow"><span className="mini-dot" />HTTP 502 REFERENCE INCIDENT</div><h1>From incident to evidence<span>.</span></h1><p>This prototype demonstrates the full Aegis workflow on a reproducible HTTP 502 incident.</p></div><button className={`health-status ${health}`} onClick={() => { setHealth("checking"); void checkHealth(); }} disabled={health === "checking"} title="Refresh application health">{health === "checking" ? <LoaderCircle size={13} className="spin" /> : <span className="mini-dot" />}{health === "healthy" ? "App healthy" : health === "checking" ? "Checking app" : "App unavailable"}<RefreshCw size={11} /></button></div>

        <section className="foundation-banner" aria-label="Build milestone"><span className="banner-icon"><Sparkles size={16} /></span><div><strong>Observe. Generate. Execute. Verify.</strong><span> AI can be wrong safely. Real evidence, a fresh validation environment, and a human approval boundary.</span></div><span className="milestone-tag">v{version}</span></section>

        <section className="panel incident-panel" aria-label="Incident input"><div className="panel-heading"><h2><Radio size={16} />Incident context</h2><button className="icon-button" aria-label="Check status" title="Check backend status" onClick={() => void client.refresh()}><RefreshCw size={14} /></button><span className={`incident-state ${investigation ? "prepared" : ""}`}>{busy ? <LoaderCircle size={12} className="spin" /> : view.error ? <CircleHelp size={12} /> : investigation ? <Check size={11} /> : <span className="mini-dot muted" />}{view.phase === "checking" ? "CHECKING STATUS" : investigating ? "INVESTIGATION RUNNING" : view.error ? "NEEDS ATTENTION" : investigation?.state ?? "AWAITING INPUT"}</span></div><IncidentForm busy={busy} retry={!!view.error} busyLabel={view.phase === "checking" ? "Checking status…" : "Investigating…"} onPrepare={prepare} onReset={reset} /></section>
        {busy && <section className="running-banner" role="status" aria-live="polite" aria-busy="true">
          <LoaderCircle size={24} className="spin" /><div><strong>{view.phase === "checking" ? "Checking latest investigation status" : view.phase === "recovering" ? "Reconnecting to the investigation" : "Investigation running"}</strong><p>{view.phase === "checking" ? "Checking the backend before enabling another run." : "Gemini and CreateOS are investigating in an isolated environment."}</p>{investigating && <progress aria-label="Waiting for actual investigation output" />}{investigation && <small>Previous result {investigation.id.slice(0,8)} remains visible until this request completes.</small>}</div>{investigating && <span className="elapsed-time">{elapsed}<small>{view.reconnected ? "since reconnect" : "elapsed"}</small></span>}
        </section>}
        {view.error && <section className="request-error" role="alert"><strong>Investigation needs attention</strong><p>{view.error}</p><button className="button secondary" onClick={() => void client.refresh()}>Check status</button>{view.lastAttempt?.outcome === "FAILED" && <p>Latest attempt {view.lastAttempt.id.slice(0,8)} · diagnosis cleanup {view.lastAttempt.cleanup} · validation cleanup {view.lastAttempt.validation?.cleanup ?? "not required"}</p>}</section>}
        {investigation && <DemoOutcome result={investigation} previous={busy || (!!view.error && investigation.outcome !== "FAILED") || (!!view.lastAttempt && view.lastAttempt.id !== investigation.id)} />}
        <div className="workspace-divider"><span>INVESTIGATION WORKSPACE</span><span><LockKeyhole size={11} />SANDBOXED BY DESIGN</span></div>
        <div className="workspace-grid"><InvestigationTimeline event={event} result={investigation} busy={investigating} /><SandboxExecution investigation={investigation} investigating={busy} /><EvidencePanel result={investigation} /><ValidationResult result={investigation} /></div>
        <Infrastructure />
        <div className="workspace-status" role="status" aria-live="polite"><span><span className={`mini-dot ${event ? "" : "muted"}`} />{investigating ? "Investigation running · waiting for actual evidence and cleanup." : view.error ? "Latest request needs attention · see the error above · production untouched." : investigation ? `${investigation.outcome} · synthetic fixture only · production action NOT EXECUTED` : "Load an incident to begin a bounded Gemini and CreateOS investigation."}</span><span className="session-id"><Fingerprint size={13} />{investigation ? investigation.id.slice(0, 8) : event ? `LOCAL · ${event.id.slice(0, 8)}` : "NO INCIDENT RUN"}</span></div>
        <footer><span>AEGIS SRE <span className="footer-separator">/</span> Evidence-driven reliability.</span><div><span>Powered by</span><span className="partner-createos"><Box size={12} />CreateOS</span><span className="footer-plus">+</span><span className="partner-stripe">stripe<span> PROJECTS</span></span></div></footer>
      </main>
    </div>
    <dialog ref={aboutRef} className="about-dialog" aria-labelledby="about-title" onCancel={() => setShowAbout(false)} onClose={() => setShowAbout(false)}><div className="eyebrow">PROJECT NOTES · v{version}</div><h2 id="about-title">Recommendations meet evidence.</h2><p>Gemini proposes hypotheses and one schema-validated action per turn. Gemini generates a diagnostic program at runtime. Source validation and deterministic policy gate execution inside a disposable CreateOS sandbox.</p><p>The run allows at most three model turns, three generated tools, two tool retries, one diagnosis sandbox, and one fresh validation sandbox. Commands have a 20-second limit. Real outputs become evidence; cleanup is confirmed before completion. Confidence values are model estimates. The prototype supports one complete reference incident.</p><div className="about-status"><GitBranch size={15} />A working vertical slice, designed for additional incident and repository adapters.</div><p>A reproducible broken-proxy fixture is installed in the sandbox. The model proposes one minimal config change; VERIFIED requires fresh 502 → 200 evidence, regression PASS, and cleanup. Credentials remain on the server; production mutation stays disabled.</p><button className="button primary" onClick={() => setShowAbout(false)}>Back to workspace <ArrowUpRight size={15} /></button></dialog>
  </div>;
}
