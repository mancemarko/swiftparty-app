const mongoose = require('mongoose');

const voteSchema = new mongoose.Schema({
  party: { type: mongoose.Schema.Types.ObjectId, ref: 'Party', required: true, index: true },
  wishlistItem: { type: mongoose.Schema.Types.ObjectId, ref: 'WishlistItem', required: true },
  guest: { type: mongoose.Schema.Types.ObjectId, ref: 'Guest', required: true },
}, { timestamps: true });

// The actual duplicate-vote guard: one vote per guest per item, enforced at the DB level.
voteSchema.index({ wishlistItem: 1, guest: 1 }, { unique: true });

module.exports = mongoose.model('Vote', voteSchema);
