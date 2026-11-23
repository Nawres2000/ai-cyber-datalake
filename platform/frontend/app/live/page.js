'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { level, fmtDate, short } from '@/lib/format';
import useGuard from '@/components/useGuard';
import Timeline from '@/components/Timeline';

export default function Live() {
  const { user } = useGuard();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api('/live').then((d) => { setData(d); setError(''); }).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!user) return;
    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [user, load]);

  if (!user) return <p className="wrap band">Loading…</p>;
  if (error) return <p className="wrap band err">{error}</p>;
  if (!data) return <p className="wrap band">Connecting to the stream…</p>;

  const { kpis, active, lastEventTime, buckets, recent, hosts } = data;
  return (
    <main className="d">
      <div className="top">
        <div>
          <h2>Live stream</h2>
          <span className={`why ${active ? 'live' : ''}`}>
            {active ? `Receiving alerts from Kafka · event time ${fmtDate(lastEventTime)}`
                    : 'Stream idle. Start Kafka, the scorer and the producer (see streaming/README.md).'}
          </span>
        </div>
      </div>

      <div className="kpis">
        <div className="card kpi"><b>{kpis.perSecond}</b><span>Alerts per second (last minute)</span></div>
        <div className="card kpi"><b>{kpis.flaggedPerMinute}</b><span>Flagged in the last minute</span></div>
        <div className="card kpi"><b>{kpis.total.toLocaleString('en-US')}</b><span>Alerts scored by the stream</span></div>
        <div className="card kpi"><b>{kpis.total ? Math.round((kpis.flagged / kpis.total) * 100) : 0}%</b><span>Flagged share</span></div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Throughput (10-second windows, last 3 minutes)</h3>
        <Timeline data={buckets} />
      </div>

      <div className="two">
        <div className="card"><h3>Incoming alerts</h3>
          <div className="scroll"><table><thead><tr>
            <th>Scored at</th><th>Source</th><th>Risk</th><th>Signature</th><th>Request</th><th>Model</th>
          </tr></thead>
            <tbody>{recent.map((i) => (
              <tr key={i._id}>
                <td>{new Date(i.ingestedAt).toLocaleTimeString('en-GB')}</td>
                <td><Link href={`/hosts/${i.src}`}>{i.src}</Link></td>
                <td><span className={`score ${level(i.risk)}`}>{Math.round(i.risk)}</span></td>
                <td className="why" title={i.signature}>{short(i.signature, 34)}</td>
                <td className="mono" title={i.url || ''}>{i.url ? short(`${i.method || ''} ${i.url}`, 28) : '–'}</td>
                <td><span className={`tag ${i.source === 'HTTP text' ? 'txt' : 'flw'}`}>{i.source === 'HTTP text' ? 'Text' : 'Flow'}</span></td>
              </tr>
            ))}</tbody></table></div>
        </div>
        <div className="card"><h3>Host ranking (updated live)</h3>
          <div className="scroll"><table style={{ minWidth: 0 }}><thead><tr><th>Host</th><th>Risk</th><th>Flagged</th></tr></thead>
            <tbody>{hosts.map((h) => (
              <tr key={h._id}>
                <td><Link href={`/hosts/${h.ip}`}>{h.ip}</Link></td>
                <td><span className={`score ${level(h.risk)}`}>{Math.round(h.risk)}</span></td>
                <td>{h.nFlagged ?? 0}/{h.nAlerts ?? 0}</td>
              </tr>
            ))}</tbody></table></div>
        </div>
      </div>
    </main>
  );
}
