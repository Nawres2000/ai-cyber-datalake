const router = require('express').Router();
const requireAuth = require('../middleware/auth');
const Host = require('../models/Host');
const Incident = require('../models/Incident');

router.get('/:ip', requireAuth, async (req, res, next) => {
  try {
    const ip = String(req.params.ip).slice(0, 64);
    const host = await Host.findOne({ ip }).lean();
    if (!host) return res.status(404).json({ message: 'Host not found.' });
    const [alerts, signatures, sources, daily] = await Promise.all([
      Incident.find({ src: ip }).sort({ ts: -1 }).limit(50).lean(),
      Incident.aggregate([
        { $match: { src: ip } },
        { $group: { _id: '$signature', count: { $sum: 1 }, flagged: { $sum: { $cond: ['$flagged', 1, 0] } } } },
        { $sort: { count: -1 } }, { $limit: 8 },
      ]),
      Incident.aggregate([{ $match: { src: ip } }, { $group: { _id: '$source', count: { $sum: 1 } } }]),
      Incident.aggregate([
        { $match: { src: ip } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$ts' } }, total: { $sum: 1 },
                    flagged: { $sum: { $cond: ['$flagged', 1, 0] } } } },
        { $sort: { _id: 1 } },
      ]),
    ]);
    res.json({
      host, alerts,
      signatures: signatures.map((s) => ({ signature: s._id, count: s.count, flagged: s.flagged })),
      sources: sources.map((s) => ({ source: s._id, count: s.count })),
      timeline: daily.map((t) => ({ day: t._id, total: t.total, flagged: t.flagged })),
    });
  } catch (e) { next(e); }
});

module.exports = router;
