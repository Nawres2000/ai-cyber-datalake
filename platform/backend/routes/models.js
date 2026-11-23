const router = require('express').Router();
const requireAuth = require('../middleware/auth');
const ModelResult = require('../models/ModelResult');
const Meta = require('../models/Meta');

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const [models, meta] = await Promise.all([ModelResult.find().lean(), Meta.findOne().lean()]);
    res.json({ models, meta });
  } catch (e) { next(e); }
});

module.exports = router;
