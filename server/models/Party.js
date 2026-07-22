const mongoose = require('mongoose');

const partySchema = new mongoose.Schema({
  name: { type: String, required: true },
  theme: { type: String },
  code: { type: String, required: true, unique: true, index: true },
  hostToken: { type: String, required: true, unique: true },
  status: { type: String, enum: ['active', 'cancelled'], default: 'active' },
  spotify: {
    accessToken: { type: String },
    refreshToken: { type: String },
    tokenExpiresAt: { type: Date },
    spotifyUserId: { type: String },
    playlistId: { type: String },
    playlistUrl: { type: String },
  },
}, { timestamps: true });

module.exports = mongoose.model('Party', partySchema);
