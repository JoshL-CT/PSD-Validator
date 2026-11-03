"use client";

import { useMemo, useRef, useState } from "react";
import { upload as uploadToBlob } from "@vercel/blob/client";
import type { FixResult, Issue, JobRecord, Severity } from "@/lib/types";

const ORDER: Severity[] = ["error", "warning", "info"];
const LABEL: Record<Severity, string> = { error: "Fix first", warning: "Should fix", info: "For review" };
const mb = (n: number) => (n / 1024 / 1024).toFixed(1) + " MB";

export default function Home() {
  const [job, setJob] = useState<JobRecord | null>(null);
  const [result, setResult] = useState<FixResult | null>(null);
  const [busy, setBusy] = useState<"" | "upload" | "fix">("");
  const [error, setError] = useState("");
  const [over, setOver] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [names, setNames] = useState<Record<string, string>>({});
  const input = useRef<HTMLInputElement>(null);

  const issues = useMemo(() => job?.analysis.issues ?? [], [job]);
  const fixable = (i: Issue) => i.fix.kind !== "none";
  const grouped = useMemo(
    () => ORDER.map((s) => ({ s, items: issues.filter((i) => i.severity === s) })).filter((g) => g.items.length),
    [issues],
  );
  const step = result ? 5 : job ? 3 : 1;

  async function upload(file: File) {
    setError("");
    setResult(null);
    setBusy("upload");
    try {
      let res: Response;
      if (process.env.NEXT_PUBLIC_DIRECT_UPLOAD) {
        // Hosted: send the file straight to private Blob storage, then check it.
        const id = crypto.randomUUID();
        await uploadToBlob(`jobs/${id}/original.psd`, file, {
          access: "private",
          handleUploadUrl: "/api/upload",
          multipart: file.size > 50 * 1024 * 1024,
        });
        res = await fetch(`/api/jobs/${id}/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: file.name }),
        });
      } else {
        const form = new FormData();
        form.append("file", file);
        res = await fetch("/api/upload", { method: "POST", body: form });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const rec = data as JobRecord;
      setJob(rec);
      const initial: Record<string, string> = {};
      rec.analysis.issues.forEach((i) => {
        if (i.fix.suggestedName) initial[i.id] = i.fix.suggestedName;
      });
      setNames(initial);
      // Pre select fixes that need no input from the user
      setPicked(new Set(rec.analysis.issues.filter((i) => fixable(i) && !i.fix.needsInput).map((i) => i.id)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy("");
    }
  }

  async function runFixes() {
    if (!job) return;
    setError("");
    setBusy("fix");
    try {
      const fixes = [...picked].map((issueId) => ({ issueId, newName: names[issueId] }));
      const res = await fetch(`/api/jobs/${job.id}/fix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fix failed.");
    } finally {
      setBusy("");
    }
  }

  function reset() {
    setJob(null);
    setResult(null);
    setPicked(new Set());
    setError("");
    if (input.current) input.current.value = "";
  }

  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const count = (s: Severity) => issues.filter((i) => i.severity === s).length;
  const labels = ["Upload", "Validate", "Review callouts", "Apply fixes", "Download"];

  return (
    <>
      <header className="top">
        <div className="top-inner">
          <span className="mark">NFL</span>
          <div>
            <h1>PSD Validator</h1>
            <p>Check a template against the PSD best practices, fix it, and download the clean file.</p>
          </div>
        </div>
      </header>

      <main className="wrap">
        <ol className="steps">
          {labels.map((l, i) => (
            <li key={l} className={i + 1 === step ? "on" : i + 1 < step ? "done" : ""}>
              {l}
            </li>
          ))}
        </ol>

        {error && <div className="error-box">{error}</div>}

        {!job && (
          <section className="panel">
            <div className="panel-head"><h2>Upload your PSD</h2></div>
            <div className="panel-body">
              <div
                className={`drop ${over ? "over" : ""}`}
                onClick={() => input.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setOver(true); }}
                onDragLeave={() => setOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setOver(false);
                  const f = e.dataTransfer.files[0];
                  if (f) upload(f);
                }}
              >
                <strong>{busy === "upload" ? "Checking your file" : "Drop a PSD here"}</strong>
                <p>or click to choose a file. Your original is never changed.</p>
                <input
                  ref={input}
                  type="file"
                  accept=".psd"
                  hidden
                  onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
                />
              </div>
            </div>
          </section>
        )}

        {job && (
          <section className="panel">
            <div className="panel-head">
              <h2>{job.fileName}</h2>
              <button className="btn ghost" onClick={reset}>Start over</button>
            </div>
            <div className="panel-body">
              <div className="tiles">
                <div className="tile"><div className="n">{job.analysis.layerCount}</div><div className="l">Layers</div></div>
                <div className="tile"><div className="n">{mb(job.analysis.fileSize)}</div><div className="l">File size</div></div>
                <div className="tile err"><div className="n">{count("error")}</div><div className="l">Fix first</div></div>
                <div className="tile"><div className="n">{count("warning")}</div><div className="l">Should fix</div></div>
                <div className="tile"><div className="n">{count("info")}</div><div className="l">For review</div></div>
              </div>
            </div>
          </section>
        )}

        {job && !result && issues.length === 0 && (
          <section className="panel">
            <div className="panel-head"><h2>No issues found</h2></div>
            <div className="panel-body">This file already meets the checks. Nothing to fix.</div>
          </section>
        )}

        {job && !result && grouped.map(({ s, items }) => (
          <section className="panel" key={s}>
            <div className="panel-head">
              <h2>{LABEL[s]}</h2>
              <span>{items.length} found</span>
            </div>
            {items.map((i) => (
              <div className={`issue ${i.severity}`} key={i.id}>
                <input
                  type="checkbox"
                  aria-label={`Apply fix for ${i.title}`}
                  checked={picked.has(i.id)}
                  disabled={!fixable(i)}
                  onChange={() => toggle(i.id)}
                />
                <div>
                  <h3><span className={`badge ${i.severity}`}>{i.severity}</span>{i.title}</h3>
                  <p>{i.detail}</p>
                  {i.layerPath && <span className="layer">{i.layerName || "(unnamed)"}</span>}
                  <div className="fix">
                    <strong>{fixable(i) ? "Proposed fix. " : "Needs a person. "}</strong>
                    {i.fix.description}
                    {i.fix.kind === "rename" && (
                      <div>
                        <input
                          type="text"
                          placeholder="New layer name"
                          value={names[i.id] ?? ""}
                          onChange={(e) => {
                            setNames({ ...names, [i.id]: e.target.value });
                            if (e.target.value.trim()) setPicked((p) => new Set(p).add(i.id));
                          }}
                        />
                      </div>
                    )}
                  </div>
                  <div className="ref">Guide section {i.guideRef}</div>
                </div>
              </div>
            ))}
          </section>
        ))}

        {job && !result && issues.some(fixable) && (
          <div className="row">
            <button className="btn" disabled={!picked.size || busy === "fix"} onClick={runFixes}>
              {busy === "fix" ? "Applying fixes" : `Apply ${picked.size} selected fixes`}
            </button>
            <span className="note">Edits run on a copy. Your original upload stays as it was.</span>
          </div>
        )}

        {result && job && (
          <>
            <section className="panel">
              <div className="panel-head">
                <h2>Change log</h2>
                <span>{result.engine}</span>
              </div>
              <div className="panel-body">
                <table className="log">
                  <thead><tr><th>Layer</th><th>What changed</th><th>Result</th></tr></thead>
                  <tbody>
                    {result.log.map((l) => (
                      <tr key={l.issueId}>
                        <td>{l.layerName || "(unnamed)"}</td>
                        <td>{l.action}{l.detail ? ` (${l.detail})` : ""}</td>
                        <td className={`st-${l.status}`}>{l.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="panel">
              <div className="panel-head"><h2>Before and after</h2></div>
              <div className="panel-body">
                <div className="tiles">
                  <div className="tile"><div className="n">{job.analysis.layerCount} → {result.after.layerCount}</div><div className="l">Layers</div></div>
                  <div className="tile"><div className="n">{mb(job.analysis.fileSize)} → {mb(result.after.fileSize)}</div><div className="l">File size</div></div>
                  <div className="tile"><div className="n">{job.analysis.issues.length} → {result.after.issues.length}</div><div className="l">Callouts</div></div>
                </div>
                {result.after.issues.length > 0 && (
                  <p className="note">
                    {result.after.issues.length} callouts remain. Start over and upload the optimized file to see them, or fix them by hand in Photoshop.
                  </p>
                )}
              </div>
            </section>

            <div className="row">
              <a className="btn" href={`/api/jobs/${job.id}/download`}>Download updated PSD</a>
              <button className="btn" style={{ background: "var(--navy)" }} onClick={reset}>Check another file</button>
            </div>
          </>
        )}
      </main>
    </>
  );
}
