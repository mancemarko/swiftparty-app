const express = require('express');
const crypto = require('crypto');
const Party = require('../models/Party');
const Guest = require('../models/Guest');
const WishlistItem = require('../models/WishlistItem');
const Song = require('../models/Song');
const Vote = require('../models/Vote');
const requireHost = require('../middleware/requireHost');
const { sanitizeInput } = require('../utils/sanitize');
const { generateUniquePartyCode } = require('../utils/partyCode');

const guestRoutes = require('./guest.routes');
const wishlistRoutes = require('./wishlist.routes');
const songRoutes = require('./song.routes');
const partySpotifyRoutes = require('./partySpotify.routes');

const router = express.Router();

// Loads the party for any route/sub-router under /:code and attaches it to req.party.
router.param('code', async (req, res, next, code) => {
  try {
    const party = await Party.findOne({ code });
    if (!party) {
      return res.status(404).json({ error: 'Party not found.' });
    }
    req.party = party;
    next();
  } catch (err) {
    console.error('Error loading party:', err);
    res.status(500).json({ error: 'Server error occurred. Please try again.' });
  }
});

// POST /api/parties — create a new party
router.post('/', async (req, res) => {
  try {
    const { name, theme } = req.body;
    const sanitizedName = sanitizeInput(name);

    if (!sanitizedName || sanitizedName.length < 2 || sanitizedName.length > 60) {
      return res.status(400).json({ error: 'Party name must be between 2 and 60 characters.' });
    }

    const sanitizedTheme = theme ? sanitizeInput(theme).slice(0, 60) : undefined;

    const code = await generateUniquePartyCode();
    const hostToken = crypto.randomBytes(32).toString('hex');

    const party = await Party.create({ name: sanitizedName, theme: sanitizedTheme, code, hostToken });

    res.json({
      success: true,
      code: party.code,
      hostToken,
      name: party.name,
      theme: party.theme,
      shareUrl: `${req.protocol}://${req.get('host')}/p/${party.code}`,
    });
  } catch (err) {
    console.error('Party creation error:', err);
    res.status(500).json({ error: 'Server error occurred. Please try again.' });
  }
});

// GET /api/parties/:code — public summary, never returns tokens
router.get('/:code', (req, res) => {
  const { name, theme, code, status } = req.party;
  res.json({ name, theme, code, status: status || 'active' });
});

// GET /api/parties/:code/dashboard — full host view
router.get('/:code/dashboard', requireHost, async (req, res) => {
  try {
    const party = req.party;
    const [guests, wishlistItems, songs, voteCounts] = await Promise.all([
      Guest.find({ party: party._id }).sort({ createdAt: -1 }),
      WishlistItem.find({ party: party._id }).sort({ createdAt: -1 }).populate('suggestedBy', 'name'),
      Song.find({ party: party._id }).sort({ createdAt: 1 }).populate('guest', 'name'),
      Vote.aggregate([
        { $match: { party: party._id } },
        { $group: { _id: '$wishlistItem', count: { $sum: 1 } } },
      ]),
    ]);

    const countByItem = new Map(voteCounts.map(v => [String(v._id), v.count]));
    const wishlist = wishlistItems.map(item => ({
      ...item.toObject(),
      voteCount: countByItem.get(String(item._id)) || 0,
    }));

    res.json({
      name: party.name,
      theme: party.theme,
      code: party.code,
      status: party.status || 'active',
      shareUrl: `${req.protocol}://${req.get('host')}/p/${party.code}`,
      guests,
      wishlist,
      songs,
      spotify: {
        connected: Boolean(party.spotify && party.spotify.accessToken),
        playlistUrl: party.spotify ? party.spotify.playlistUrl : undefined,
      },
    });
  } catch (err) {
    console.error('Error loading dashboard:', err);
    res.status(500).json({ error: 'Failed to load dashboard. Please try again.' });
  }
});

// POST /api/parties/:code/cancel — host ends the party
router.post('/:code/cancel', requireHost, async (req, res) => {
  try {
    req.party.status = 'cancelled';
    await req.party.save();
    res.json({ success: true, status: 'cancelled' });
  } catch (err) {
    console.error('Error cancelling party:', err);
    res.status(500).json({ error: 'Server error occurred. Please try again.' });
  }
});

router.use('/:code/guests', guestRoutes);
router.use('/:code/wishlist', wishlistRoutes);
router.use('/:code/songs', songRoutes);
router.use('/:code/spotify', partySpotifyRoutes);

module.exports = router;
