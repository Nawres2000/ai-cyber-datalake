'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { level, fmtDate, fmtDay, short } from '@/lib/format';
import useGuard from '@/components/useGuard';
import Timeline from '@/components/Timeline';

export default function HostDetail() {
  const { user } = useGuard();
  const { ip } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user || !ip) return;
    api(`/hosts/${encodeURIComponent(ip)}`).then(setData).catch((e) => setError(e.message));
  }, [user, ip]);

  if (!user) return <p className="wrap band">Loading…</p>;
  if (error) return <p className="wrap band err">{error}</p>;
  if (!data) return <p className="wrap band">Loading host…</p>;
  const { host, alerts, signatures, sources, timeline } = data;

  return (
    <main className="d">
      <div className="top">
        <div><h2>Host {host.ip}</h2>
          <span className="why">Seen {fmtDay(host.firstSeen)} → {fmtDay(host.lastSeen)} · {host.factors}</span></div>
        <Link className="btn alt" href={`/alerts?q=${host.ip}`}>All its alerts</Link>
      </div>

      <div className="kpis">
        <div className="card kpi"><b><span className={`score ${level(host.risk)}`}>{Math.round(host.risk)}</span></b><span>Host risk · {host.status}</span></div>
        <div className="card kpi"><b>{host.nAlerts ?? '–'}</b><span>Alerts</span></div>
        <div className="card kpi"><b>{host.flagRate ?? '–'}%</b><span>Flagged by the model</span></div>
        <div className="card kpi"><b>{host.nPorts ?? '–'}</b><span>Distinct destination ports</span></div>
      </div>

      <div className="card" style={{ marginTop: 16 }}><h3>Activity per day</h3><Timeline data={timeline} /></div>

      <div className="two">
        <div className="card"><h3>Signatures</h3>
          <div className="scroll"><table><thead><tr><th>Signature</th><th>Alerts</th><th>Flagged</th></tr></thead>
            <tbody>{signatures.map((s) => (
              <tr key={s.signature}><td className="why">{s.signature}</td><td>{s.count}</td><td>{s.flagged}</td></tr>
            ))}</tbody></table></div>
        </div>
        <div className="card"><h3>How it was scored</h3>
          {sources.map((s) => <p key={s.source} className="why">{s.source}: <b>{s.count}</b> alerts</p>)}
          <p className="why">Host risk = 0.4 × mean alert risk + 0.3 × share of flagged alerts + 0.3 × volume of flagged alerts (log scale, 1,000 = max). These weights are a design choice, not learned.</p>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}><h3>Latest alerts (50)</h3>
        <div className="scroll"><table><thead><tr><th>Time (UTC)</th><th>Port</th><th>Risk</th><th>Signature</th><th>Request</th><th>User-agent</th></tr></thead>
          <tbody>{alerts.map((i) => (
            <tr key={i._id}>
              <td>{fmtDate(i.ts)}</td><td>{i.port ?? '–'}</td>
              <td><span className={`score ${level(i.risk)}`}>{Math.round(i.risk)}</span></td>
              <td className="why" title={i.signature}>{short(i.signature, 40)}</td>
              <td className="mono" title={i.url || ''}>{i.url ? short(`${i.method || ''} ${i.url}`, 36) : '–'}</td>
              <td className="mono" title={i.userAgent || ''}>{short(i.userAgent, 30)}</td>
            </tr>
          ))}</tbody></table></div>
      </div>
    </main>
  );
}
