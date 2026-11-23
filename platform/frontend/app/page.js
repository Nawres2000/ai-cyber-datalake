import Link from 'next/link';
import Reveal from '@/components/Reveal';
import LiveFeed from '@/components/LiveFeed';

const features = [
  ['Centralize Suricata logs', 'Alerts, flows and HTTP requests from 8 EVE JSON files (about 193 GB) in a Spark data lake.'],
  ['Read the HTTP request', 'A TF-IDF model reads the URL and user-agent of each alert when the request is visible.'],
  ['Fall back on the flow', 'LightGBM scores alerts without readable HTTP (TLS, SSH) from packet sizes, ports and host history.'],
  ['Explain every score', 'Each alert shows its signature, request and model; each host its factors and activity.'],
];
const flow = ['Suricata EVE JSON', 'Bronze', 'Silver', 'Gold', 'Features + HTTP text', 'Hybrid model (TF-IDF / LightGBM)', 'Host risk score', 'SOC dashboard'];
const headline = 'Thousands of alerts in. A short list of risky hosts out.'.split(' ');

export default function Home() {
  return (
    <>
      <div className="wrap hero">
        <div>
          <h1>{headline.map((w, i) => <span className="w" style={{ '--i': i }} key={i}>{w}&nbsp;</span>)}</h1>
          <p className="lead rise" style={{ '--d': '800ms' }}>SuriLake is a mini-SOC platform that stores Suricata network logs in a Bronze / Silver / Gold data lake, scores every alert with machine learning, and ranks hosts by a risk score you can explain.</p>
          <div className="row rise" style={{ '--d': '1000ms' }}>
            <Link className="btn" href="/signup">Create an account</Link>
            <Link className="btn alt" href="/login">Log in</Link>
          </div>
        </div>
        <div className="lake rise" style={{ '--d': '600ms' }}>
          <h3><span className="live">Live threat feed</span></h3>
          <LiveFeed />
          <div className="pipe"><span>Bronze</span><b /><span>Silver</span><b /><span>Gold</span></div>
        </div>
      </div>

      <section className="wrap band">
        <Reveal><h2>What the platform does</h2></Reveal>
        <div className="grid">
          {features.map(([t, d], i) => (
            <Reveal key={t} delay={i * 90} className="card"><h3>{t}</h3><p>{d}</p></Reveal>
          ))}
        </div>
      </section>

      <section className="wrap band">
        <Reveal>
          <h2>From data to incident</h2>
          <p className="lead">Built on real Suricata logs of a university web server, March 2024 to February 2025. The label is weak: it comes from Suricata's own severity, so the model prioritizes alerts rather than discovering unknown attacks.</p>
        </Reveal>
        <div className="flow">{flow.map((f, i) => <Reveal as="span" key={f} delay={i * 80}>{f}</Reveal>)}</div>
        <Reveal><p className="lead" style={{ marginTop: 24 }}>Stack: PySpark, LightGBM, scikit-learn, PyTorch, MLflow, DVC, Next.js, Express, MongoDB, Git and GitHub.</p></Reveal>
      </section>
    </>
  );
}
