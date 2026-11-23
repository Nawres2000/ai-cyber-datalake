'use client';
import { Suspense, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { level, fmtDate, short } from '@/lib/format';
import useGuard from '@/components/useGuard';

const STATUSES = ['New', 'Investigating', 'Closed'];

function AlertsView() {
  const { user } = useGuard();
  const params = useSearchParams();
  const [f, setF] = useState({
    q: params.get('q') || '', minRisk: params.get('minRisk') || '', source: params.get('source') || '',
    status: params.get('status') || '', flagged: params.get('flagged') || '', sort: params.get('sort') || 'risk',
  });
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    const qs = new URLSearchParams({ page: String(page), limit: '25' });
    Object.entries(f).forEach(([k, v]) => { if (v) qs.set(k, v); });
    api(`/alerts?${qs}`).then((d) => { setData(d); setError(''); }).catch((e) => setError(e.message));
  }, [f, page]);

  useEffect(() => { if (user) load(); }, [user, load]);

  const set = (k) => (e) => { setPage(1); setF({ ...f, [k]: e.target.value }); };
  async function changeStatus(id, status) {
    try {
      await api(`/alerts/${id}`, { method: 'PATCH', body: { status } });
      setData((d) => ({ ...d, items: d.items.map((i) => (i._id === id ? { ...i, status } : i)) }));
    } catch (e) { setError(e.message); }
  }

  if (!user) return <p className="wrap band">Loading…</p>;
  return (
    <main className="d">
      <div className="top"><div><h2>Alert triage</h2>
        <span className="why">Every alert scored by the hybrid model. Change the status as you investigate.</span></div></div>

      <div className="card filters">
        <div><label htmlFor="q">Search</label>
          <input id="q" placeholder="IP, signature, URL or user-agent" value={f.q} onChange={set('q')} /></div>
        <div><label htmlFor="minRisk">Minimum risk</label>
          <select id="minRisk" value={f.minRisk} onChange={set('minRisk')}>
            <option value="">Any</option><option value="50">50+</option><option value="80">80+</option><option value="95">95+</option>
          </select></div>
        <div><label htmlFor="source">Scored from</label>
          <select id="source" value={f.source} onChange={set('source')}>
            <option value="">Any</option><option>HTTP text</option><option>Flow features</option>
          </select></div>
        <div><label htmlFor="flagged">Model decision</label>
          <select id="flagged" value={f.flagged} onChange={set('flagged')}>
            <option value="">Any</option><option value="true">Flagged</option><option value="false">Not flagged</option>
          </select></div>
        <div><label htmlFor="status">Status</label>
          <select id="status" value={f.status} onChange={set('status')}>
            <option value="">Any</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select></div>
        <div><label htmlFor="sort">Sort by</label>
          <select id="sort" value={f.sort} onChange={set('sort')}>
            <option value="risk">Highest risk</option><option value="ts">Most recent</option>
          </select></div>
      </div>

      {error && <p className="err">{error}</p>}
      {!data ? <p className="why">Loading…</p> : (
        <div className="card" style={{ marginTop: 16 }}>
          <p className="why">{data.total.toLocaleString('en-US')} alerts match</p>
          <div className="scroll"><table><thead><tr>
            <th>Time (UTC)</th><th>Source</th><th>Port</th><th>Risk</th><th>Signature</th><th>Request</th>
            <th>Scored by</th><th>Weak label</th><th>Status</th>
          </tr></thead>
            <tbody>{data.items.map((i) => (
              <tr key={i._id}>
                <td>{fmtDate(i.ts)}</td>
                <td><Link href={`/hosts/${i.src}`}>{i.src}</Link></td>
                <td>{i.port ?? '–'}</td>
                <td><span className={`score ${level(i.risk)}`}>{Math.round(i.risk)}</span></td>
                <td className="why" title={i.signature}>{short(i.signature, 42)}</td>
                <td className="mono" title={[i.url, i.userAgent].filter(Boolean).join('\n')}>
                  {i.url ? short(`${i.method || ''} ${i.url}`, 36) : '–'}</td>
                <td><span className={`tag ${i.source === 'HTTP text' ? 'txt' : 'flw'}`}>{i.source}</span></td>
                <td>{i.label === 1 ? 'suspicious' : 'benign'}</td>
                <td>
                  <select className="mini" aria-label={`Status of alert ${i._id}`} value={i.status || 'New'}
                    onChange={(e) => changeStatus(i._id, e.target.value)}>
                    {STATUSES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </td>
              </tr>
            ))}</tbody></table></div>
          <div className="pager">
            <button className="btn alt" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Previous</button>
            <span className="why">Page {data.page} / {data.pages}</span>
            <button className="btn alt" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Next →</button>
          </div>
        </div>
      )}
    </main>
  );
}

export default function Alerts() {
  return <Suspense fallback={<p className="wrap band">Loading…</p>}><AlertsView /></Suspense>;
}
