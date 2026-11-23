// DEMO data only. For the real results of the ML pipeline, run: python ../ml/import_results.py --data <folder>
require('dotenv').config();
const path = require('path');
const mongoose = require('mongoose');
const Host = require('./models/Host');
const Incident = require('./models/Incident');
const ModelResult = require('./models/ModelResult');
const Meta = require('./models/Meta');

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const SIGS = [
  ['GPL WEB_SERVER 403 Forbidden', 1, 'GET /assets/'],
  ['ET SCAN WordPress Scanner Performing Multiple Requests to Windows Live Writer XML', 1, 'GET /wp-includes/wlwmanifest.xml'],
  ['ET SCAN SFTP/FTP Password Exposure via sftp-config.json', 1, 'GET /sftp-config.json'],
  ['ET INFO Request to Hidden Environment File - Inbound', 0, 'GET /.env'],
  ['ET INFO User-Agent (python-requests) Inbound to Webserver', 0, 'GET /'],
  ['ET SCAN Bing Webcrawler User-Agent (BingBot)', 0, 'GET /page/detail'],
];
const IPS = ['165.232.175.249', '185.191.126.213', '80.75.212.75', '152.89.198.175', '138.197.134.93', '103.77.106.57'];

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  await Promise.all([Host.deleteMany({}), Incident.deleteMany({}), ModelResult.deleteMany({}), Meta.deleteMany({})]);
  const now = Date.now();
  const incidents = Array.from({ length: 300 }, () => {
    const [signature, label, url] = pick(SIGS);
    const text = Math.random() < 0.6;
    const proba = label ? 0.6 + Math.random() * 0.4 : Math.random() * 0.4;
    return {
      ts: new Date(now - Math.random() * 14 * 864e5), src: pick(IPS), dst: '192.168.33.9', port: text ? 80 : pick([443, 22]),
      signature, label, proba, risk: Math.round(proba * 1000) / 10, flagged: proba >= 0.5,
      source: text ? 'HTTP text' : 'Flow features', detectedBy: text ? 'TF-IDF (HTTP text)' : 'LightGBM (flow)',
      method: text ? 'GET' : null, url: text ? url.split(' ')[1] : null, userAgent: text ? 'Mozilla/5.0' : null,
    };
  });
  await Incident.insertMany(incidents);
  const hosts = IPS.map((ip) => {
    const mine = incidents.filter((i) => i.src === ip);
    const nFlagged = mine.filter((i) => i.flagged).length;
    const risk = Math.round((0.4 * mine.reduce((s, i) => s + i.risk, 0) / mine.length + 0.3 * 100 * nFlagged / mine.length
      + 0.3 * 100 * Math.min(1, Math.log10(nFlagged + 1) / 3)) * 10) / 10;
    return { ip, risk, nAlerts: mine.length, nFlagged, status: risk >= 85 ? 'Investigate' : risk >= 60 ? 'Review' : 'Monitor',
             factors: `${nFlagged}/${mine.length} alerts flagged (demo data)` };
  });
  await Host.insertMany(hosts);
  await ModelResult.insertMany(require(path.join(__dirname, '..', 'ml', 'model_results.json')));
  await Meta.create({ nAlerts: incidents.length, perimeter: 'DEMO data (not real results)', threshold: 0.5,
                      periodStart: new Date(now - 14 * 864e5), periodEnd: new Date(now), generatedAt: new Date() });
  console.log('Seeded DEMO data:', hosts.length, 'hosts and', incidents.length, 'alerts');
  process.exit(0);
})();
