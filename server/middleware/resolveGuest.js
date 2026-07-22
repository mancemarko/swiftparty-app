const Party = require('../models/Party');
const Guest = require('../models/Guest');

async function resolveGuest(req, res, next) {
  try {
    const party = await Party.findOne({ code: req.params.code });
    if (!party) {
      return res.status(404).json({ error: 'Party not found.' });
    }

    const guestToken = req.get('X-Guest-Token');
    if (!guestToken) {
      return res.status(401).json({ error: 'Missing guest token. Please join the party first.' });
    }

    const guest = await Guest.findOne({ party: party._id, guestToken });
    if (!guest) {
      return res.status(401).json({ error: 'Invalid or expired guest token. Please join the party again.' });
    }

    req.party = party;
    req.guest = guest;
    next();
  } catch (err) {
    console.error('resolveGuest error:', err);
    res.status(500).json({ error: 'Server error occurred. Please try again.' });
  }
}

module.exports = resolveGuest;
