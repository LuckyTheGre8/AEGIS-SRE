"use client";

import { ArrowUpRight, FlaskConical, RotateCcw } from "lucide-react";
import { useState } from "react";
import { IncidentInputSchema } from "@/lib/agent/schemas";
import type { IncidentInput } from "@/lib/agent/types";
import { DEMO_FIXTURE, DEMO_INCIDENT } from "@/lib/demo/incident";

export function IncidentForm({ onPrepare, onReset, busy = false }: {
  onPrepare: (input: IncidentInput) => void; onReset: () => void; busy?: boolean;
}) {
  const [incident, setIncident] = useState("");
  const [error, setError] = useState("");

  return <form className="incident-form" onSubmit={(event) => {
    event.preventDefault();
    const parsed = IncidentInputSchema.safeParse({ incident, fixture: DEMO_FIXTURE });
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    setError("");
    onPrepare(parsed.data);
  }}>
    <div className="incident-input">
      <label htmlFor="incident">What needs investigating?</label>
      <textarea id="incident" value={incident} disabled={busy} maxLength={4000} rows={2}
        placeholder="Describe the incident. Start with what you’re seeing…"
        aria-invalid={!!error} aria-describedby={error ? "incident-error" : "incident-help"}
        onChange={(event) => { setIncident(event.target.value); setError(""); onReset(); }} />
      {error && <p className="form-error" id="incident-error" role="alert">{error}</p>}
      <div className="input-context"><span className="mini-dot" /> Demo fixture <code>broken-proxy</code><span className="context-separator" /> Isolated environment</div>
    </div>
    <div className="form-actions">
      <button type="button" disabled={busy} className="button secondary" onClick={() => {
        setIncident(DEMO_INCIDENT); setError(""); onReset();
      }}><FlaskConical size={15} />Load demo incident</button>
      <button type="button" disabled={busy} className="icon-button" aria-label="Reset incident" title="Reset incident" onClick={() => {
        setIncident(""); setError(""); onReset();
      }}><RotateCcw size={15} /></button>
      <span className="action-spacer" />
      <span id="incident-help" className="form-help">Isolated baseline investigation</span>
      <button type="submit" disabled={busy} className="button primary">{busy ? "Investigating…" : "Investigate"} <ArrowUpRight size={17} /></button>
    </div>
  </form>;
}
