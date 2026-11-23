'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { num } from '@/lib/format';
import useGuard from '@/components/useGuard';

const LIMITS = [
  'Weak label: derived from Suricata rules (severity ≤ 2 or scan). A high score means the model reproduces the rules, not that it finds unknown attacks.',
  'The text model partly re-learns the rules, which match the same URLs. Best evidence of generalization: 0.90 recall on attack families removed from training.',
  'POST bodies are not logged by Suricata: attacks hidden in the body (e.g. PHP tags in POST) stay poorly detected on unseen campaigns.',
  '192.168.33.9 is a reverse proxy: the proxy → backend leg duplicates inbound alerts, so only inbound traffic is used.',
  'Metrics are computed on one test period; the threat mix drifts from day to day, so periodic retraining is needed.',
];

export default function Models() {
  const { user } = useGuard();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { if (user) api('/models').then(setData).catch((e) => setError(e.message)); }, [user]);

  if (!user) return <p className="wrap band">Loading…</p>;
  if (error) return <p className="wrap band err">{error}</p>;
  if (!data) return <p className="wrap band">Loading models…</p>;

  const groups = data.models.reduce((acc, m) => { (acc[m.perimeter] ||= []).push(m); return acc; }, {});
  return (
    <main className="d">
      <div className="top"><div><h2>Models and evaluation</h2>
        <span className="why">AUC-PR is the main metric (a model with no information scores the share of positives). Compare models only within the same perimeter.</span></div></div>

      {Object.entries(groups).map(([perimeter, models]) => (
        <div className="card" style={{ marginTop: 16 }} key={perimeter}>
          <h3>{perimeter}</h3>
          <div className="scroll"><table><thead><tr>
            <th>Model</th><th>Family</th><th>AUC-PR</th><th>95% CI</th><th>Precision</th><th>Recall</th><th>ROC-AUC</th><th>Unseen-family recall</th><th>Role</th>
          </tr></thead>
            <tbody>{[...models].sort((a, b) => (b.aucPr ?? 0) - (a.aucPr ?? 0)).map((m) => (
              <tr key={m._id} title={m.note}>
                <td><b>{m.name}</b><div className="why">{m.note}</div></td>
                <td>{m.family}</td><td><b>{num(m.aucPr)}</b></td>
                <td>{m.ciLow != null ? `[${num(m.ciLow)} ; ${num(m.ciHigh)}]` : '–'}</td>
                <td>{num(m.precision)}</td><td>{num(m.recall)}</td><td>{num(m.rocAuc)}</td>
                <td>{num(m.lofoRecall)}</td><td>{m.role}</td>
              </tr>
            ))}</tbody></table></div>
        </div>
      ))}

      <div className="card" style={{ marginTop: 16 }}><h3>Known limitations</h3>
        <ul className="limits">{LIMITS.map((l) => <li key={l}>{l}</li>)}</ul>
        {data.meta && <p className="why">Label: {data.meta.label}. Decision threshold: {data.meta.threshold}. System: {data.meta.system}.</p>}
      </div>
    </main>
  );
}
