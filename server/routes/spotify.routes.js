const express = require('express');
const crypto = require('crypto');
const Party = require('../models/Party');
const spotifyService = require('../services/spotifyService');
const oauthState = require('../services/oauthState');

const router = express.Router();

function safeEqual(a, b) {
  const bufA = Buffer.from(a || '', 'utf8');
  const bufB = Buffer.from(b || '', 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// POST /api/spotify/login — real form submit (partyCode + hostToken in the body, not the URL)
router.post('/login', async (req, res) => {
  try {
    if (!spotifyService.isConfigured()) {
      return res.status(503).send('Spotify is not configured on this server yet.');
    }

    const { partyCode, hostToken } = req.body;
    const party = await Party.findOne({ code: partyCode });
    if (!party || !hostToken || !safeEqual(hostToken, party.hostToken)) {
      return res.status(403).send('Invalid host token.');
    }

    const state = oauthState.createState(party._id.toString());
    res.redirect(spotifyService.getAuthorizeUrl(state));
  } catch (err) {
    console.error('Spotify login error:', err);
    res.status(500).send('Server error occurred. Please try again.');
  }
});

// GET /api/spotify/callback — Spotify redirects here after the host approves/denies
router.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;

  const partyId = oauthState.verifyState(state);
  if (!partyId) {
    return res.status(400).send('This Spotify login link is invalid or has expired. Please try connecting again from the dashboard.');
  }

  const party = await Party.findById(partyId);
  if (!party) {
    return res.status(404).send('Party not found.');
  }

  if (error || !code) {
    return res.redirect(`/host-dashboard.html?code=${party.code}&spotifyError=1`);
  }

  try {
    const tokenData = await spotifyService.exchangeCodeForToken(code);
    party.spotify = party.spotify || {};
    party.spotify.accessToken = tokenData.access_token;
    party.spotify.refreshToken = tokenData.refresh_token;
    party.spotify.tokenExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000 - 60000);

    const spotifyUser = await spotifyService.getSpotifyUser(tokenData.access_token);
    party.spotify.spotifyUserId = spotifyUser.id;

    await party.save();

    res.redirect(`/host-dashboard.html?code=${party.code}&spotifyConnected=1`);
  } catch (err) {
    console.error('Spotify callback error:', err);
    res.redirect(`/host-dashboard.html?code=${party.code}&spotifyError=1`);
  }
});

module.exports = router;
