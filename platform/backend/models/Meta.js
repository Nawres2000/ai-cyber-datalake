const mongoose = require('mongoose');

module.exports = mongoose.model('Meta', new mongoose.Schema({
  periodStart: Date,
  periodEnd: Date,
  nAlerts: Number,
  nFlagged: Number,
  nHosts: Number,
  threshold: Number,
  perimeter: String,
  label: String,
  system: String,
  generatedAt: Date,
}));
