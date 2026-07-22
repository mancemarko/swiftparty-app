const express = require('express');
const WishlistItem = require('../models/WishlistItem');
const Vote = require('../models/Vote');
const Guest = require('../models/Guest');
const requireHost = require('../middleware/requireHost');
const resolveGuest = require('../middleware/resolveGuest');
const blockIfCancelled = require('../middleware/blockIfCancelled');
const { sanitizeInput } = require('../utils/sanitize');

const router = express.Router({ mergeParams: true });

// GET /api/parties/:code/wishlist — public (published-only) or full list for a valid host
router.get('/', async (req, res) => {
  try {
    const party = req.party;
    const isHost = req.get('X-Host-Token') === party.hostToken && Boolean(party.hostToken);
    const filter = { party: party._id, ...(isHost ? {} : { published: true }) };

    const query = WishlistItem.find(filter).sort({ createdAt: -1 });
    if (isHost) {
      query.populate('suggestedBy', 'name');
    }
    const items = await query;

    const voteCounts = await Vote.aggregate([
      { $match: { party: party._id } },
      { $group: { _id: '$wishlistItem', count: { $sum: 1 } } },
    ]);
    const countByItem = new Map(voteCounts.map(v => [String(v._id), v.count]));

    let votedByGuest = new Set();
    const guestToken = req.get('X-Guest-Token');
    if (guestToken) {
      const guest = await Guest.findOne({ party: party._id, guestToken });
      if (guest) {
        const myVotes = await Vote.find({ party: party._id, guest: guest._id });
        votedByGuest = new Set(myVotes.map(v => String(v.wishlistItem)));
      }
    }

    const result = items.map(item => ({
      _id: item._id,
      type: item.type,
      name: item.name,
      description: item.description,
      published: item.published,
      suggestedBy: isHost && item.suggestedBy ? item.suggestedBy.name : undefined,
      voteCount: countByItem.get(String(item._id)) || 0,
      votedByMe: votedByGuest.has(String(item._id)),
    }));

    res.json({ items: result });
  } catch (err) {
    console.error('Error fetching wishlist:', err);
    res.status(500).json({ error: 'Failed to load wishlist. Please try again.' });
  }
});

// POST /api/parties/:code/wishlist — host adds an item
router.post('/', requireHost, async (req, res) => {
  try {
    const { type, name, description } = req.body;

    if (!['drink', 'food'].includes(type)) {
      return res.status(400).json({ error: 'Type must be "drink" or "food".' });
    }

    const sanitizedName = sanitizeInput(name);
    if (!sanitizedName || sanitizedName.length > 60) {
      return res.status(400).json({ error: 'Name is required and must be at most 60 characters.' });
    }

    const sanitizedDescription = description ? sanitizeInput(description).slice(0, 200) : undefined;

    const item = await WishlistItem.create({
      party: req.party._id,
      type,
      name: sanitizedName,
      description: sanitizedDescription,
    });

    res.status(201).json({ item });
  } catch (err) {
    console.error('Error creating wishlist item:', err);
    res.status(500).json({ error: 'Server error occurred. Please try again.' });
  }
});

// POST /api/parties/:code/wishlist/suggest — guest suggests an item, pending host approval
router.post('/suggest', resolveGuest, blockIfCancelled, async (req, res) => {
  try {
    const { type, name, description } = req.body;

    if (!['drink', 'food'].includes(type)) {
      return res.status(400).json({ error: 'Type must be "drink" or "food".' });
    }

    const sanitizedName = sanitizeInput(name);
    if (!sanitizedName || sanitizedName.length > 60) {
      return res.status(400).json({ error: 'Name is required and must be at most 60 characters.' });
    }

    const sanitizedDescription = description ? sanitizeInput(description).slice(0, 200) : undefined;

    const item = await WishlistItem.create({
      party: req.party._id,
      type,
      name: sanitizedName,
      description: sanitizedDescription,
      published: false,
      suggestedBy: req.guest._id,
    });

    res.status(201).json({ item });
  } catch (err) {
    console.error('Error creating wishlist suggestion:', err);
    res.status(500).json({ error: 'Server error occurred. Please try again.' });
  }
});

// PATCH /api/parties/:code/wishlist/:itemId — host edits/publishes an item
router.patch('/:itemId', requireHost, async (req, res) => {
  try {
    const { published, name, description } = req.body;
    const update = {};

    if (typeof published === 'boolean') update.published = published;
    if (typeof name === 'string') {
      const sanitizedName = sanitizeInput(name);
      if (!sanitizedName || sanitizedName.length > 60) {
        return res.status(400).json({ error: 'Name must be 1-60 characters.' });
      }
      update.name = sanitizedName;
    }
    if (typeof description === 'string') {
      update.description = sanitizeInput(description).slice(0, 200);
    }

    const item = await WishlistItem.findOneAndUpdate(
      { _id: req.params.itemId, party: req.party._id },
      update,
      { new: true }
    );

    if (!item) {
      return res.status(404).json({ error: 'Wishlist item not found.' });
    }

    res.json({ item });
  } catch (err) {
    console.error('Error updating wishlist item:', err);
    res.status(500).json({ error: 'Server error occurred. Please try again.' });
  }
});

// DELETE /api/parties/:code/wishlist/:itemId — host removes an item
router.delete('/:itemId', requireHost, async (req, res) => {
  try {
    const item = await WishlistItem.findOneAndDelete({ _id: req.params.itemId, party: req.party._id });
    if (!item) {
      return res.status(404).json({ error: 'Wishlist item not found.' });
    }
    await Vote.deleteMany({ wishlistItem: item._id });
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting wishlist item:', err);
    res.status(500).json({ error: 'Server error occurred. Please try again.' });
  }
});

// POST /api/parties/:code/wishlist/:itemId/vote — guest toggles their vote
router.post('/:itemId/vote', resolveGuest, blockIfCancelled, async (req, res) => {
  try {
    const item = await WishlistItem.findOne({ _id: req.params.itemId, party: req.party._id });
    if (!item) {
      return res.status(404).json({ error: 'Wishlist item not found.' });
    }

    const existingVote = await Vote.findOneAndDelete({ wishlistItem: item._id, guest: req.guest._id });

    let voted;
    if (existingVote) {
      voted = false;
    } else {
      try {
        await Vote.create({ party: req.party._id, wishlistItem: item._id, guest: req.guest._id });
        voted = true;
      } catch (err) {
        if (err.code === 11000) {
          // Lost a race with a concurrent duplicate request; the vote already exists.
          voted = true;
        } else {
          throw err;
        }
      }
    }

    const voteCount = await Vote.countDocuments({ wishlistItem: item._id });
    res.json({ voted, voteCount });
  } catch (err) {
    console.error('Error toggling vote:', err);
    res.status(500).json({ error: 'Server error occurred. Please try again.' });
  }
});

module.exports = router;
