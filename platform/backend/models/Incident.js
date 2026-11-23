const mongoose = require('mongoose');

// One document per alert scored by the ML pipeline (see ml/import_results.py)
const incidentSchema = new mongoose.Schema({
  flowId: Number,
  ts: { type: Date, index: true },
  src: { type: String, index: true },
  dst: String,
  port: Number,
  proto: String,
  appProto: String,
  signature: String,          // most severe Suricata signature of the flow (analysis only, never a model feature)
  label: Number,              // weak label v1 (1 = suspicious according to Suricata severity / scan category)
  proba: Number,              // final probability of the hybrid system
  pFlow: Number,              // LightGBM on flow features
  pText: Number,              // TF-IDF on the HTTP request text (null when no readable request)
  risk: { type: Number, min: 0, max: 100 },
  source: { type: String, enum: ['HTTP text', 'Flow features'] },
  detectedBy: String,
  flagged: Boolean,           // proba >= decision threshold
  method: String,
  url: String,
  userAgent: String,
  httpStatus: Number,
  status: { type: String, enum: ['New', 'Investigating', 'Closed'], default: 'New' },
}, { timestamps: true });

module.exports = mongoose.model('Incident', incidentSchema);
