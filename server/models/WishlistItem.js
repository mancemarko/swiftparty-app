const mongoose = require('mongoose');

const wishlistItemSchema = new mongoose.Schema({
  party: { type: mongoose.Schema.Types.ObjectId, ref: 'Party', required: true, index: true },
  type: { type: String, enum: ['drink', 'food'], required: true },
  name: { type: String, required: true },
  description: { type: String },
  published: { type: Boolean, default: true },
  suggestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Guest' },
}, { timestamps: true });

module.exports = mongoose.model('WishlistItem', wishlistItemSchema);
