const router = require('express').Router();
const requireAuth = require('../middleware/auth');
const Host = require('../models/Host');
const Incident = require('../models/Incident');
const Meta = require('../models/Meta');

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const [total, flagged, fromText, highRiskHosts, openCases, hosts, latest, dist, timeline, meta] = await Promise.all([
      Incident.countDocuments(),
      Incident.countDocuments({ flagged: true }),
      Incident.countDocuments({ source: 'HTTP text' }),
      Host.countDocuments({ risk: { $gte: 80 } }),
      Incident.countDocuments({ status: 'Investigating' }),
      Host.find().sort({ risk: -1, nFlagged: -1 }).limit(10).lean(),
      Incident.find({ flagged: true }).sort({ ts: -1 }).limit(10).lean(),
      Incident.aggregate([
        { $match: { flagged: true } },
        { $group: { _id: '$signature', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Incident.aggregate([
        { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$ts' } },
          total: { $sum: 1 },
          flagged: { $sum: { $cond: ['$flagged', 1, 0] } },
        } },
        { $sort: { _id: 1 } },
      ]),
      Meta.findOne().lean(),
    ]);

    // Top 6 signature families of the flagged alerts, the rest grouped as "Other"
    const nFlag = dist.reduce((s, d) => s + d.count, 0) || 1;
    const top = dist.slice(0, 6).map((d) => ({ label: d._id || 'Unknown', count: d.count, percent: Math.round((d.count / nFlag) * 100) }));
    const other = dist.slice(6).reduce((s, d) => s + d.count, 0);
    if (other) top.push({ label: 'Other families', count: other, percent: Math.round((other / nFlag) * 100) });

    res.json({
      kpis: {
        alertsAnalyzed: total,
        flagged,
        highRiskHosts,
        textShare: total ? Math.round((fromText / total) * 100) : 0,
        openCases,
      },
      hosts,
      distribution: top,
      timeline: timeline.map((t) => ({ day: t._id, total: t.total, flagged: t.flagged })),
      incidents: latest,
      meta,
    });
  } catch (e) { next(e); }
});

module.exports = router;
