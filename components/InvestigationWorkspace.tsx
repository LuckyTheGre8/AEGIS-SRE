"use client";

import { Activity, ArrowDown, ArrowUpRight, Box, Check, ChevronRight, CircleHelp, FileText, Fingerprint, GitBranch, LoaderCircle, LockKeyhole, Radio, RefreshCw, Shield, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { IncidentInput, InvestigationEvent } from "@/lib/agent/types";
import { APP_VERSION as version } from "@/lib/version";
import { IncidentForm } from "./IncidentForm";
import { InvestigationTimeline } from "./InvestigationTimeline";
import { SandboxExecution } from "./SandboxExecution";
import { EvidencePanel } from "./EvidencePanel";
import { ValidationResult } from "./ValidationResult";
import { InvestigationResultSchema, type InvestigationResult } from "@/lib/investigation/result";

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
  const [investigation, setInvestigation] = useState<InvestigationResult | null>(null);
  const [investigating, setInvestigating] = useState(false);
  const [investigationError, setInvestigationError] = useState("");
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

  async function prepare(input: IncidentInput) {
    setInvestigating(true);
    setInvestigation(null);
    setInvestigationError("");
    setEvent({
      id: crypto.randomUUID(), timestamp: new Date().toISOString(), state: "RECEIVED",
      type: "incident_prepared", title: "Incident prepared",
      summary: "Input validated. Bounded investigation requested.",
      metadata: { incident: input.incident, fixture: input.fixture, execution: false },
    });
    try {
      const response = await fetch("/api/investigate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      const parsed = InvestigationResultSchema.safeParse(await response.json());
      if (parsed.success) setInvestigation(parsed.data);
      else setInvestigationError(`Investigation request failed (HTTP ${response.status}). Refresh the latest result before retrying.`);
    } catch { setInvestigationError("Request interrupted. Cleanup continues on the server. Refresh the latest result before retrying."); }
    finally { setInvestigating(false); }
  }

  async function refreshInvestigation() {
    try {
      const response = await fetch("/api/investigate", { cache: "no-store" });
      const data = await response.json();
      const parsed = InvestigationResultSchema.safeParse(data.lastResult);
      if (parsed.success) { setInvestigation(parsed.data); setInvestigationError(""); }
      setInvestigating(data.running === true);
    } catch { setInvestigationError("Could not retrieve the latest investigation result."); }
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
      <header className="topbar"><div className="breadcrumbs"><span>Workspace</span><ChevronRight size={12} /><strong>Investigation</strong></div><div className="topbar-right"><span className="environment-badge"><Box size={12} />LOCAL ENVIRONMENT</span><span className="avatar">AG</span></div></header>
      <main>
        <div className="page-heading"><div><div className="eyebrow page-eyebrow"><span className="mini-dot" />INCIDENT RESPONSE, REIMAGINED</div><h1>From incident to evidence<span>.</span></h1><p>Investigate in isolation. Build the tools you need. Verify every fix.</p></div><button className={`health-status ${health}`} onClick={() => { setHealth("checking"); void checkHealth(); }} disabled={health === "checking"} title="Refresh application health">{health === "checking" ? <LoaderCircle size={13} className="spin" /> : <span className="mini-dot" />}{health === "healthy" ? "App healthy" : health === "checking" ? "Checking app" : "App unavailable"}<RefreshCw size={11} /></button></div>

        <section className="foundation-banner" aria-label="Build milestone"><span className="banner-icon"><Sparkles size={16} /></span><div><strong>Generated diagnostics. Fresh-sandbox fix verification.</strong><span> Observe 502 → generate a tool and patch → prove 200 plus regression in a new CreateOS sandbox.</span></div><span className="milestone-tag">v{version}</span></section>

        <section className="panel incident-panel" aria-label="Incident input"><div className="panel-heading"><h2><Radio size={16} />Incident context</h2><button className="icon-button" aria-label="Refresh investigation result" onClick={() => void refreshInvestigation()}><RefreshCw size={14} /></button><span className={`incident-state ${event ? "prepared" : ""}`}>{event ? <Check size={11} /> : <span className="mini-dot muted" />}{investigating ? "INVESTIGATING" : investigation?.state ?? (event ? "RECEIVED" : "AWAITING INPUT")}</span></div><IncidentForm busy={investigating} onPrepare={(input) => void prepare(input)} onReset={() => { setEvent(null); setInvestigation(null); setInvestigationError(""); }} />{investigationError && <p className="form-error" role="alert">{investigationError}</p>}</section>
        <div className="workspace-divider"><span>INVESTIGATION WORKSPACE</span><span><LockKeyhole size={11} />SANDBOXED BY DESIGN</span></div>
        <div className="workspace-grid"><InvestigationTimeline event={event} result={investigation} busy={investigating} /><SandboxExecution investigation={investigation} investigating={investigating} /><EvidencePanel result={investigation} /><ValidationResult result={investigation} /></div>
        <div className="workspace-status" role="status" aria-live="polite"><span><span className={`mini-dot ${event ? "" : "muted"}`} />{investigating ? "Bounded investigation running; wait for observations and cleanup." : investigation ? `${investigation.outcome} · synthetic fixture only · production action NOT EXECUTED` : "Load an incident to begin a bounded Gemini and CreateOS investigation."}</span><span className="session-id"><Fingerprint size={13} />{investigation ? investigation.id.slice(0, 8) : event ? `LOCAL · ${event.id.slice(0, 8)}` : "NO INCIDENT RUN"}</span></div>
        <footer><span>AEGIS SRE <span className="footer-separator">/</span> Evidence-driven reliability.</span><div><span>Powered by</span><span className="partner-createos"><Box size={12} />CreateOS</span><span className="footer-plus">+</span><span className="partner-stripe">stripe<span> PROJECTS</span></span></div></footer>
      </main>
    </div>
    <dialog ref={aboutRef} className="about-dialog" aria-labelledby="about-title" onCancel={() => setShowAbout(false)} onClose={() => setShowAbout(false)}><div className="eyebrow">PROJECT NOTES · v{version}</div><h2 id="about-title">Recommendations meet evidence.</h2><p>Gemini proposes hypotheses and one schema-validated action per turn. Gemini generates a diagnostic program at runtime. Source validation and deterministic policy gate execution inside a disposable CreateOS sandbox.</p><p>The run allows at most three model turns, three generated tools, two tool retries, one diagnosis sandbox, and one fresh validation sandbox. Commands have a 20-second limit. Real outputs become evidence; cleanup is confirmed before completion. Confidence values are model estimates.</p><div className="about-status"><GitBranch size={15} />Synthetic fixture evidence cannot confirm a production root cause.</div><p>A reproducible broken-proxy fixture is installed in the sandbox. The model proposes one minimal config change; VERIFIED requires fresh 502 → 200 evidence, regression PASS, and cleanup. Credentials remain on the server; production mutation stays disabled.</p><button className="button primary" onClick={() => setShowAbout(false)}>Back to workspace <ArrowUpRight size={15} /></button></dialog>
  </div>;
}
