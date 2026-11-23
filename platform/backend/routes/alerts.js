const router = require('express').Router();
const mongoose = require('mongoose');
const requireAuth = require('../middleware/auth');
const Incident = require('../models/Incident');

const STATUSES = ['New', 'Investigating', 'Closed'];
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const IP_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

// GET /api/alerts?page=1&limit=25&minRisk=50&source=HTTP%20text&status=New&flagged=true&q=wp-login&sort=risk
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const filter = {};
    const minRisk = Number(req.query.minRisk);
    if (Number.isFinite(minRisk) && minRisk > 0) filter.risk = { $gte: minRisk };
    if (['HTTP text', 'Flow features'].includes(req.query.source)) filter.source = req.query.source;
    if (STATUSES.includes(req.query.status)) filter.status = req.query.status;
    if (req.query.flagged === 'true') filter.flagged = true;
    if (req.query.flagged === 'false') filter.flagged = false;
    const q = (req.query.q || '').trim().slice(0, 100);
    if (q) {
      if (IP_RE.test(q)) filter.src = q;
      else {
        const re = new RegExp(escapeRe(q), 'i');
        filter.$or = [{ signature: re }, { url: re }, { userAgent: re }];
      }
    }
    const sort = req.query.sort === 'ts' ? { ts: -1 } : { risk: -1, ts: -1 };
    const [items, total] = await Promise.all([
      Incident.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).lean(),
      Incident.countDocuments(filter),
    ]);
    res.json({ items, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
  } catch (e) { next(e); }
});

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid alert id.' });
    const item = await Incident.findById(req.params.id).lean();
    if (!item) return res.status(404).json({ message: 'Alert not found.' });
    res.json({ item });
  } catch (e) { next(e); }
});

// Triage: the analyst changes the status of an alert
router.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid alert id.' });
    if (!STATUSES.includes(req.body.status)) return res.status(400).json({ message: `Status must be one of: ${STATUSES.join(', ')}.` });
    const item = await Incident.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true }).lean();
    if (!item) return res.status(404).json({ message: 'Alert not found.' });
    res.json({ item });
  } catch (e) { next(e); }
});

module.exports = router;
