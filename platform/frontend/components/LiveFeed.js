'use client';
import { useEffect, useState } from 'react';

const EVENTS = [
  ['WordPress scanner (wlwmanifest.xml)', '138.197.134.93', '192.168.33.9:80', 'hot', 'HTTP text'],
  ['SFTP config exposure (sftp-config.json)', '103.77.106.57', '192.168.33.9:80', 'hot', 'HTTP text'],
  ['Dshield block-listed source', '152.89.198.175', '192.168.33.9:443', 'hot', 'Flow'],
  ['Hidden environment file (.env)', '185.161.248.87', '192.168.33.9:80', 'warn', 'HTTP text'],
  ['Suspicious inbound to MySQL 3306', '80.75.212.75', '192.168.33.9:3306', 'hot', 'Flow'],
  ['Bing web crawler', '40.77.167.10', '192.168.33.9:80', 'low', 'HTTP text'],
]; // illustrative examples of the alert types found in the data

export default function LiveFeed() {
  const [items, setItems] = useState(EVENTS.slice(0, 4).map((e, i) => ({ id: i, e })));
  useEffect(() => {
    let n = 4;
    const t = setInterval(() => {
      setItems((cur) => [{ id: n, e: EVENTS[n % EVENTS.length] }, ...cur].slice(0, 5));
      n++;
    }, 2200);
    return () => clearInterval(t);
  }, []);
  return (
    <ul className="feed" aria-label="Example threat feed">
      {items.map(({ id, e }) => (
        <li key={id} className={e[3]}>
          <i />
          <div><b>{e[0]}</b><span>{e[1]} to {e[2]}</span></div>
          <em>{e[4]}</em>
        </li>
      ))}
    </ul>
  );
}
