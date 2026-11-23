'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { level, fmtDate, fmtDay, short } from '@/lib/format';
import useGuard from '@/components/useGuard';
import CountUp from '@/components/CountUp';
import Timeline from '@/components/Timeline';

export default function Dashboard() {
  const { user } = useGuard();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [grown, setGrown] = useState(false);

  const load = useCallback(() => {
    api('/dashboard').then((d) => { setData(d); setError(''); }).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!user) return;
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [user, load]);

  useEffect(() => { if (data) { const t = setTimeout(() => setGrown(true), 80); return () => clearTimeout(t); } }, [data]);

  if (!user) return <p className="wrap band">Loading…</p>;
  if (error) return <p className="wrap band err">{error} Check that the API is running and the results are imported.</p>;
  if (!data) return <p className="wrap band">Loading your SOC overview…</p>;

  const { kpis, hosts, distribution, timeline, incidents, meta } = data;
  const cards = [
    ['Alerts analyzed', kpis.alertsAnalyzed, ''],
    ['Flagged as suspicious', kpis.flagged, ''],
    ['Hosts at high risk (≥ 80)', kpis.highRiskHosts, ''],
    ['Scored from HTTP text', kpis.textShare, '%'],
  ];

  return (
    <main className="d">
      <div className="top">
        <div>
          <h2>Welcome, {user.name.split(' ')[0]}. Here is your SOC overview.</h2>
          <span className="why live">
            {meta ? `${fmtDay(meta.periodStart)} → ${fmtDay(meta.periodEnd)} · ${meta.perimeter}` : 'No metadata'}
          </span>
        </div>
        <div className="row" style={{ marginTop: 0 }}>
          <Link className="btn alt" href="/alerts">Triage alerts</Link>
          <button className="btn alt" onClick={load}>Refresh</button>
        </div>
      </div>

      <div className="kpis">{cards.map(([l, v, unit]) => (
        <div className="card kpi" key={l}><b><CountUp to={Number(v) || 0} />{unit}</b><span>{l}</span></div>
      ))}</div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Alerts per day</h3>
        <Timeline data={timeline} />
      </div>

      <div className="two">
        <div className="card"><h3>Hosts to handle first</h3>
          <div className="scroll"><table><thead><tr><th>Host</th><th>Risk</th><th>Main factors</th><th>Status</th></tr></thead>
            <tbody>{hosts.map((h) => (
              <tr key={h._id}>
                <td><Link href={`/hosts/${h.ip}`}>{h.ip}</Link></td>
                <td><span className={`score ${level(h.risk)}`}>{Math.round(h.risk)}</span></td>
                <td className="why">{h.factors}</td>
                <td>{h.status}</td>
              </tr>
            ))}</tbody></table></div>
        </div>
        <div className="card"><h3>What the model flags</h3>
          <p className="why">Signature families among the {kpis.flagged.toLocaleString('en-US')} flagged alerts</p>
          {distribution.map((d) => (
            <div className="bar" key={d.label}>
              <div><span title={d.label}>{short(d.label, 46)}</span><b>{d.percent}%</b></div>
              <i style={{ width: grown ? `${Math.max(d.percent, 2)}%` : '0%' }} />
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="top" style={{ marginBottom: 6 }}>
          <h3>Latest flagged alerts</h3><Link href="/alerts?flagged=true&sort=ts">See all →</Link>
        </div>
        <div className="scroll"><table><thead><tr>
          <th>Time (UTC)</th><th>Source</th><th>Risk</th><th>Signature</th><th>Request</th><th>Scored by</th>
        </tr></thead>
          <tbody>{incidents.map((i) => (
            <tr key={i._id}>
              <td>{fmtDate(i.ts)}</td>
              <td><Link href={`/hosts/${i.src}`}>{i.src}</Link></td>
              <td><span className={`score ${level(i.risk)}`}>{Math.round(i.risk)}</span></td>
              <td className="why" title={i.signature}>{short(i.signature, 48)}</td>
              <td className="mono" title={i.url || ''}>{i.url ? short(`${i.method || ''} ${i.url}`, 40) : '–'}</td>
              <td><span className={`tag ${i.source === 'HTTP text' ? 'txt' : 'flw'}`}>{i.detectedBy}</span></td>
            </tr>
          ))}</tbody></table></div>
      </div>
    </main>
  );
}
