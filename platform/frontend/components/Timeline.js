'use client';

// Daily alerts: full bar = all alerts, coloured part = alerts flagged by the model
export default function Timeline({ data }) {
  if (!data?.length) return <p className="why">No data.</p>;
  const max = Math.max(...data.map((d) => d.total), 1);
  const W = 720, H = 160, gap = 4;
  const bw = Math.max(2, (W - gap * (data.length - 1)) / data.length);
  return (
    <div className="timeline">
      <svg viewBox={`0 0 ${W} ${H + 22}`} role="img" aria-label="Alerts per day, flagged alerts highlighted">
        {data.map((d, i) => {
          const x = i * (bw + gap);
          const ht = (d.total / max) * H;
          const hf = (d.flagged / max) * H;
          return (
            <g key={d.day}>
              <title>{`${d.day}: ${d.total} alerts, ${d.flagged} flagged`}</title>
              <rect x={x} y={H - ht} width={bw} height={ht} rx="3" className="t-all" />
              <rect x={x} y={H - hf} width={bw} height={hf} rx="3" className="t-flag" />
              {(i === 0 || i === data.length - 1 || i % Math.ceil(data.length / 6) === 0) && (
                <text x={x + bw / 2} y={H + 16} textAnchor="middle" className="t-lbl">{d.day.slice(5)}</text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="legend"><span><i className="t-all" /> all alerts</span><span><i className="t-flag" /> flagged by the model</span></div>
    </div>
  );
}
