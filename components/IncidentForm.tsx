"use client";

import { ArrowUpRight, FlaskConical, RotateCcw, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { IncidentInputSchema } from "@/lib/agent/schemas";
import type { IncidentInput } from "@/lib/agent/types";
import { FIXTURE_CATALOG, fixtureMetadata, type FixtureId } from "@/lib/fixtures/catalog";

export function IncidentForm({ onPrepare, onReset, busy = false, retry = false, busyLabel = "Investigating…" }: {
  onPrepare: (input: IncidentInput) => void; onReset: (clearResult?: boolean) => void; busy?: boolean; retry?: boolean; busyLabel?: string;
}) {
  const [incident, setIncident] = useState("");
  const [fixture, setFixture] = useState<FixtureId>("broken-proxy");
  const selected = fixtureMetadata(fixture);
  const [error, setError] = useState("");

  return <form className="incident-form" onSubmit={(event) => {
    event.preventDefault();
    if (busy) return;
    const parsed = IncidentInputSchema.safeParse({ incident, fixture });
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    setError("");
    onPrepare(parsed.data);
  }}>
    <div className="incident-input">
      <label htmlFor="demo-fixture">Demo incident</label>
      <select id="demo-fixture" value={fixture} disabled={busy} onChange={event => {
        const id = event.target.value as FixtureId; setFixture(id); setIncident(fixtureMetadata(id).incidentText); setError(""); onReset();
      }}>{FIXTURE_CATALOG.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select>
      <p className="form-help">{selected.description}</p>
      <label htmlFor="incident">What needs investigating?</label>
      <textarea id="incident" value={incident} disabled={busy} maxLength={4000} rows={2}
        placeholder="Load a reproducible reference incident…"
        aria-invalid={!!error} aria-describedby={error ? "incident-error" : "incident-help"}
        onChange={(event) => { setIncident(event.target.value); setError(""); onReset(); }} />
      {error && <p className="form-error" id="incident-error" role="alert">{error}</p>}
      <div className="input-context"><span className="mini-dot" /> Demo fixture <code>{selected.id}</code><span className="context-separator" /> Isolated environment</div>
    </div>
    <div className="form-actions">
      <button type="button" disabled={busy} className="button secondary" onClick={() => {
        setIncident(selected.incidentText); setError(""); onReset();
      }}><FlaskConical size={15} />Load demo incident</button>
      <button type="button" disabled={busy} className="icon-button" aria-label="Reset incident" title="Reset incident" onClick={() => {
        setIncident(""); setError(""); onReset(true);
      }}><RotateCcw size={15} /></button>
      <span className="action-spacer" />
      <span id="incident-help" className="form-help">{selected.title}</span>
      <button type="submit" disabled={busy} className="button primary">{busy ? <LoaderCircle size={16} className="spin" /> : <ArrowUpRight size={17} />}{busy ? busyLabel : retry ? "Retry investigation" : "Investigate"}</button>
    </div>
  </form>;
}
