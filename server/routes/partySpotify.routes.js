const express = require('express');
const Song = require('../models/Song');
const requireHost = require('../middleware/requireHost');
const spotifyService = require('../services/spotifyService');

const router = express.Router({ mergeParams: true });

// POST /api/parties/:code/spotify/sync — idempotent: creates the playlist on first call,
// then adds only songs not yet added on every subsequent call.
router.post('/sync', requireHost, async (req, res) => {
  try {
    const party = req.party;

    if (!party.spotify || !party.spotify.accessToken) {
      return res.status(400).json({ error: 'Connect Spotify for this party before generating a playlist.' });
    }

    if (!party.spotify.playlistId) {
      await spotifyService.createPlaylist(party);
    }

    const pendingSongs = await Song.find({ party: party._id, addedToPlaylist: false });

    if (pendingSongs.length > 0) {
      await spotifyService.addTracksToPlaylist(party, pendingSongs.map(s => s.spotifyTrackId));
      await Song.updateMany(
        { _id: { $in: pendingSongs.map(s => s._id) } },
        { addedToPlaylist: true }
      );
    }

    res.json({ playlistUrl: party.spotify.playlistUrl, addedCount: pendingSongs.length });
  } catch (err) {
    console.error('Spotify sync error:', err);
    res.status(502).json({ error: 'Failed to sync the Spotify playlist. Please try again.' });
  }
});

module.exports = router;
