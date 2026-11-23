const mongoose = require('mongoose');

module.exports = mongoose.model('ModelResult', new mongoose.Schema({
  name: String,
  family: String,
  perimeter: String,
  aucPr: Number,
  ciLow: Number,
  ciHigh: Number,
  precision: Number,
  recall: Number,
  rocAuc: Number,
  lofoRecall: Number,       // recall on attack families removed from training (leave-one-family-out)
  role: String,
  note: String,
}));
