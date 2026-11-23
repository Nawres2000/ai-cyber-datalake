const mongoose = require('mongoose');

module.exports = mongoose.model('Host', new mongoose.Schema({
  ip: { type: String, required: true, unique: true },
  risk: { type: Number, min: 0, max: 100, required: true },
  status: { type: String, enum: ['Investigate', 'Review', 'Monitor'], default: 'Monitor' },
  factors: String,
  nAlerts: Number,
  nFlagged: Number,
  flagRate: Number,
  riskMean: Number,
  riskMax: Number,
  nPorts: Number,
  httpShare: Number,
  topSignatures: [{ signature: String, count: Number, _id: false }],
  firstSeen: Date,
  lastSeen: Date,
}));
