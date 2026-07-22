const mongoose = require('mongoose');

const songSchema = new mongoose.Schema({
  party: { type: mongoose.Schema.Types.ObjectId, ref: 'Party', required: true, index: true },
  guest: { type: mongoose.Schema.Types.ObjectId, ref: 'Guest', required: true },
  spotifyTrackId: { type: String, required: true },
  title: { type: String, required: true },
  artist: { type: String, required: true },
  albumArt: { type: String },
  durationMs: { type: Number },
  addedToPlaylist: { type: Boolean, default: false },
}, { timestamps: true });

songSchema.index({ party: 1, spotifyTrackId: 1 });

module.exports = mongoose.model('Song', songSchema);
