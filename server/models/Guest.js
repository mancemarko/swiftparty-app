const mongoose = require('mongoose');

const guestSchema = new mongoose.Schema({
  party: { type: mongoose.Schema.Types.ObjectId, ref: 'Party', required: true, index: true },
  name: { type: String, required: true },
  guestToken: { type: String, required: true, unique: true, index: true },
}, { timestamps: true });

guestSchema.index({ party: 1, name: 1 });

module.exports = mongoose.model('Guest', guestSchema);
