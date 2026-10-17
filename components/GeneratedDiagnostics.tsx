import { Code2, Terminal } from "lucide-react";
import type { InvestigationResult } from "@/lib/investigation/result";
import { Panel } from "./Panel";

function readableStdout(stdout: string) {
  if (!stdout) return "(empty)";
  try { return JSON.stringify(JSON.parse(stdout), null, 2); } catch { return stdout; }
}

export function GeneratedDiagnostics({ result }: { result: InvestigationResult }) {
  return <Panel title="AI-generated diagnostic" icon={<Code2 size={16} />} className="diagnostic-panel" aside={<span className="subtle-tag">CREATEOS</span>}>
    <div className="diagnostic-content">
      <p className="result-provenance">Diagnosis sandbox: {result.sandboxId ?? "not created"}<br />Cleanup: {result.cleanup} · Run {result.id.slice(0,8)}</p>
      {result.tools.length === 0 && <p>No diagnostic program was generated in this run.</p>}
      {result.tools.map((record,index) => <article className="generated-diagnostic" key={index}>
        <div className="diagnostic-heading"><h3>{record.tool?.name ?? "Rejected tool response"}</h3><span className="subtle-tag">Policy: {record.decision}</span></div>
        <p>{record.tool?.purpose ?? record.error}</p>
        <p className="risk-label">{record.tool?.risk ?? "UNCLASSIFIED"} · {record.execution ? "Executed in CreateOS" : "Not executed"}</p>
        <p className="result-provenance">{record.reason}<br />{record.checks.join(" · ")}</p>
        {record.sha256 && <p className="source-hash">SHA-256: {record.sha256}</p>}
        {record.tool && <details className="evidence-item" open><summary>Generated source · {record.tool.language}</summary><pre className="generated-source">{record.tool.source}</pre></details>}
        {record.execution && <>
          <div className="execution-measurement"><Terminal size={13} /><strong>Exit code: {record.execution.exitCode}</strong><span>Duration: {record.execution.durationMs} ms</span></div>
          <details className="evidence-item" open><summary>stdout · JSON formatted for readability</summary><pre>{readableStdout(record.execution.stdout)}</pre></details>
          <details className="evidence-item"><summary>stderr · {record.execution.stderr ? "captured" : "empty"}</summary><pre>{record.execution.stderr || "(empty)"}</pre></details>
        </>}
        {record.error && <p className="form-error">{record.error}</p>}
      </article>)}
    </div>
  </Panel>;
}
