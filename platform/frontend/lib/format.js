export const level = (s) => (s >= 80 ? 'hi' : s >= 50 ? 'md' : 'lo');
export const fmtDate = (d) => (d ? new Date(d).toLocaleString('en-GB', {
  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
}) : '–');
export const fmtDay = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '–');
export const num = (v, digits = 3) => (v === null || v === undefined ? '–' : Number(v).toFixed(digits));
export const short = (s, n = 60) => (!s ? '–' : s.length > n ? `${s.slice(0, n - 1)}…` : s);
