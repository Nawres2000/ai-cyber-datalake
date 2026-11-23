const router = require('express').Router();
const requireAuth = require('../middleware/auth');
const Incident = require('../models/Incident');
const Host = require('../models/Host');

// Live view of the alerts written by the Kafka scoring service (streaming/scorer.py)
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const now = Date.now();
    const lastMin = new Date(now - 60 * 1000);
    const [recent, total, flagged, perMin, flaggedMin, buckets, hosts, last] = await Promise.all([
      Incident.find({ streamed: true }).sort({ ingestedAt: -1, _id: -1 }).limit(25).lean(),
      Incident.countDocuments({ streamed: true }),
      Incident.countDocuments({ streamed: true, flagged: true }),
      Incident.countDocuments({ streamed: true, ingestedAt: { $gte: lastMin } }),
      Incident.countDocuments({ streamed: true, flagged: true, ingestedAt: { $gte: lastMin } }),
      Incident.aggregate([
        { $match: { streamed: true, ingestedAt: { $gte: new Date(now - 3 * 60 * 1000) } } },
        { $project: { flagged: 1, t: { $toLong: '$ingestedAt' } } },
        { $group: { _id: { $subtract: ['$t', { $mod: ['$t', 10000] }] }, total: { $sum: 1 },
                    flagged: { $sum: { $cond: ['$flagged', 1, 0] } } } },
        { $sort: { _id: 1 } },
      ]),
      Host.find().sort({ risk: -1, nFlagged: -1 }).limit(8).lean(),
      Incident.findOne({ streamed: true }).sort({ ingestedAt: -1 }).select('ingestedAt ts').lean(),
    ]);
    const lbl = (ms) => new Date(ms).toISOString().slice(11, 19);
    res.json({
      kpis: { total, flagged, perMinute: perMin, flaggedPerMinute: flaggedMin, perSecond: Math.round((perMin / 60) * 10) / 10 },
      active: !!last && now - new Date(last.ingestedAt).getTime() < 15000,
      lastEventTime: last?.ts || null,
      buckets: buckets.map((b) => ({ day: String(b._id), label: lbl(b._id), total: b.total, flagged: b.flagged })),
      recent,
      hosts,
    });
  } catch (e) { next(e); }
});

module.exports = router;
