const crypto = require('crypto');
const Party = require('../models/Party');

function safeEqual(a, b) {
  const bufA = Buffer.from(a || '', 'utf8');
  const bufB = Buffer.from(b || '', 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

async function requireHost(req, res, next) {
  try {
    const party = await Party.findOne({ code: req.params.code });
    if (!party) {
      return res.status(404).json({ error: 'Party not found.' });
    }

    const hostToken = req.get('X-Host-Token');
    if (!hostToken) {
      return res.status(401).json({ error: 'Missing host token.' });
    }
    if (!safeEqual(hostToken, party.hostToken)) {
      return res.status(403).json({ error: 'Invalid host token.' });
    }

    req.party = party;
    next();
  } catch (err) {
    console.error('requireHost error:', err);
    res.status(500).json({ error: 'Server error occurred. Please try again.' });
  }
}

module.exports = requireHost;
