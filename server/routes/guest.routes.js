const express = require('express');
const crypto = require('crypto');
const Guest = require('../models/Guest');
const blockIfCancelled = require('../middleware/blockIfCancelled');
const { sanitizeInput, isValidName, escapeRegex } = require('../utils/sanitize');

const router = express.Router({ mergeParams: true });

// POST /api/parties/:code/guests — join a party
router.post('/', blockIfCancelled, async (req, res) => {
  try {
    const { name } = req.body;
    const sanitizedName = sanitizeInput(name);

    if (!sanitizedName || !isValidName(sanitizedName)) {
      return res.status(400).json({ error: 'Invalid name format. Use only letters and spaces, minimum 2 characters.' });
    }

    const party = req.party; // attached by requireParty below via param preload — see note
    const existingGuest = await Guest.findOne({
      party: party._id,
      name: { $regex: new RegExp(`^${escapeRegex(sanitizedName)}$`, 'i') },
    });

    if (existingGuest) {
      return res.status(409).json({ error: 'A guest with this name has already joined this party.' });
    }

    const guestToken = crypto.randomBytes(16).toString('hex');
    const guest = await Guest.create({ party: party._id, name: sanitizedName, guestToken });

    res.json({ success: true, guestId: guest._id, guestToken, name: guest.name });
  } catch (err) {
    console.error('Guest creation error:', err);
    res.status(500).json({ error: 'Server error occurred. Please try again.' });
  }
});

// GET /api/parties/:code/guests — list guests for a party
router.get('/', async (req, res) => {
  try {
    const guests = await Guest.find({ party: req.party._id }).sort({ createdAt: -1 });
    res.json({ guests, count: guests.length });
  } catch (err) {
    console.error('Error fetching guests:', err);
    res.status(500).json({ error: 'Failed to load guest list. Please try again.' });
  }
});

// GET /api/parties/:code/guests/me — validate a stored guest token
router.get('/me', async (req, res) => {
  try {
    const guestToken = req.get('X-Guest-Token');
    if (!guestToken) {
      return res.status(401).json({ error: 'Missing guest token.' });
    }
    const guest = await Guest.findOne({ party: req.party._id, guestToken });
    if (!guest) {
      return res.status(404).json({ error: 'Guest not found.' });
    }
    res.json({ guestId: guest._id, name: guest.name });
  } catch (err) {
    console.error('Error resolving guest:', err);
    res.status(500).json({ error: 'Server error occurred. Please try again.' });
  }
});

module.exports = router;
