const express = require('express');
const Song = require('../models/Song');
const resolveGuest = require('../middleware/resolveGuest');
const requireHost = require('../middleware/requireHost');
const blockIfCancelled = require('../middleware/blockIfCancelled');
const spotifyService = require('../services/spotifyService');

const router = express.Router({ mergeParams: true });

// GET /api/parties/:code/songs/search?q=... — must have joined the party first
router.get('/search', resolveGuest, async (req, res) => {
  try {
    const q = (req.query.q || '').toString().trim();
    if (!q || q.length > 100) {
      return res.status(400).json({ error: 'Search query must be between 1 and 100 characters.' });
    }
    const tracks = await spotifyService.searchTracks(q);
    res.json({ tracks });
  } catch (err) {
    console.error('Spotify search error:', err);
    res.status(502).json({ error: 'Spotify search is unavailable right now. Please try again later.' });
  }
});

// POST /api/parties/:code/songs — submit a track by its Spotify id
router.post('/', resolveGuest, blockIfCancelled, async (req, res) => {
  try {
    const { spotifyTrackId } = req.body;
    if (!spotifyTrackId || typeof spotifyTrackId !== 'string') {
      return res.status(400).json({ error: 'spotifyTrackId is required.' });
    }

    const existing = await Song.findOne({ party: req.party._id, spotifyTrackId });
    if (existing) {
      return res.json({ alreadyAdded: true, song: existing });
    }

    // Re-fetch authoritative metadata server-side rather than trusting client-supplied title/artist.
    const track = await spotifyService.getTrack(spotifyTrackId);

    const song = await Song.create({
      party: req.party._id,
      guest: req.guest._id,
      spotifyTrackId: track.spotifyTrackId,
      title: track.title,
      artist: track.artist,
      albumArt: track.albumArt,
      durationMs: track.durationMs,
    });

    res.status(201).json({ song });
  } catch (err) {
    console.error('Song submit error:', err);
    res.status(502).json({ error: 'Could not add this track right now. Please try again later.' });
  }
});

// GET /api/parties/:code/songs — list submitted songs
router.get('/', async (req, res) => {
  try {
    const songs = await Song.find({ party: req.party._id }).sort({ createdAt: 1 }).populate('guest', 'name');
    res.json({ songs });
  } catch (err) {
    console.error('Error fetching songs:', err);
    res.status(500).json({ error: 'Failed to load songs. Please try again.' });
  }
});

// DELETE /api/parties/:code/songs/:songId — host removes a submission
router.delete('/:songId', requireHost, async (req, res) => {
  try {
    const song = await Song.findOneAndDelete({ _id: req.params.songId, party: req.party._id });
    if (!song) {
      return res.status(404).json({ error: 'Song not found.' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting song:', err);
    res.status(500).json({ error: 'Server error occurred. Please try again.' });
  }
});

module.exports = router;
