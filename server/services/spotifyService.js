const SPOTIFY_ACCOUNTS_URL = 'https://accounts.spotify.com';
const SPOTIFY_API_URL = 'https://api.spotify.com/v1';

let appToken = { token: null, expiresAt: 0 };

function isConfigured() {
  return Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
}

function basicAuthHeader() {
  const creds = `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`;
  return `Basic ${Buffer.from(creds).toString('base64')}`;
}

async function getAppToken() {
  if (!isConfigured()) {
    throw new Error('Spotify is not configured. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET.');
  }
  if (appToken.token && appToken.expiresAt > Date.now()) {
    return appToken.token;
  }

  const response = await fetch(`${SPOTIFY_ACCOUNTS_URL}/api/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: basicAuthHeader(),
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    throw new Error(`Failed to obtain Spotify app token (${response.status})`);
  }

  const data = await response.json();
  appToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000 - 60000,
  };
  return appToken.token;
}

function mapTrack(track) {
  return {
    spotifyTrackId: track.id,
    title: track.name,
    artist: (track.artists || []).map(a => a.name).join(', '),
    albumArt: track.album && track.album.images && track.album.images[0] ? track.album.images[0].url : undefined,
    durationMs: track.duration_ms,
  };
}

async function searchTracks(query, limit = 10) {
  const token = await getAppToken();
  const url = `${SPOTIFY_API_URL}/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    throw new Error(`Spotify search failed (${response.status})`);
  }
  const data = await response.json();
  return (data.tracks && data.tracks.items ? data.tracks.items : []).map(mapTrack);
}

async function getTrack(spotifyTrackId) {
  const token = await getAppToken();
  const response = await fetch(`${SPOTIFY_API_URL}/tracks/${encodeURIComponent(spotifyTrackId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Spotify track lookup failed (${response.status})`);
  }
  const track = await response.json();
  return mapTrack(track);
}

// --- Authorization Code flow (host, per-party, user-level) ---

function getAuthorizeUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.SPOTIFY_CLIENT_ID,
    response_type: 'code',
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
    scope: 'playlist-modify-public playlist-modify-private',
    state,
  });
  return `${SPOTIFY_ACCOUNTS_URL}/authorize?${params.toString()}`;
}

async function exchangeCodeForToken(code) {
  const response = await fetch(`${SPOTIFY_ACCOUNTS_URL}/api/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: basicAuthHeader(),
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
    }).toString(),
  });
  if (!response.ok) {
    throw new Error(`Spotify token exchange failed (${response.status})`);
  }
  return response.json(); // { access_token, refresh_token, expires_in, ... }
}

async function refreshUserToken(party) {
  const response = await fetch(`${SPOTIFY_ACCOUNTS_URL}/api/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: basicAuthHeader(),
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: party.spotify.refreshToken,
    }).toString(),
  });
  if (!response.ok) {
    throw new Error(`Spotify token refresh failed (${response.status})`);
  }
  const data = await response.json();
  party.spotify.accessToken = data.access_token;
  party.spotify.tokenExpiresAt = new Date(Date.now() + data.expires_in * 1000 - 60000);
  if (data.refresh_token) {
    party.spotify.refreshToken = data.refresh_token;
  }
  await party.save();
}

async function ensureValidAccessToken(party) {
  if (!party.spotify || !party.spotify.accessToken) {
    throw new Error('This party has not connected a Spotify account yet.');
  }
  if (!party.spotify.tokenExpiresAt || party.spotify.tokenExpiresAt.getTime() <= Date.now()) {
    await refreshUserToken(party);
  }
  return party.spotify.accessToken;
}

async function getSpotifyUser(accessToken) {
  const response = await fetch(`${SPOTIFY_API_URL}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch Spotify profile (${response.status})`);
  }
  return response.json();
}

async function createPlaylist(party) {
  const accessToken = await ensureValidAccessToken(party);
  const response = await fetch(`${SPOTIFY_API_URL}/users/${encodeURIComponent(party.spotify.spotifyUserId)}/playlists`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: `${party.name} — SwiftParty`, public: false }),
  });
  if (!response.ok) {
    throw new Error(`Failed to create Spotify playlist (${response.status})`);
  }
  const playlist = await response.json();
  party.spotify.playlistId = playlist.id;
  party.spotify.playlistUrl = playlist.external_urls && playlist.external_urls.spotify;
  await party.save();
  return playlist;
}

async function addTracksToPlaylist(party, spotifyTrackIds) {
  const accessToken = await ensureValidAccessToken(party);
  const CHUNK_SIZE = 100;
  for (let i = 0; i < spotifyTrackIds.length; i += CHUNK_SIZE) {
    const chunk = spotifyTrackIds.slice(i, i + CHUNK_SIZE);
    const response = await fetch(`${SPOTIFY_API_URL}/playlists/${party.spotify.playlistId}/tracks`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ uris: chunk.map(id => `spotify:track:${id}`) }),
    });
    if (!response.ok) {
      throw new Error(`Failed to add tracks to Spotify playlist (${response.status})`);
    }
  }
}

module.exports = {
  isConfigured,
  searchTracks,
  getTrack,
  getAuthorizeUrl,
  exchangeCodeForToken,
  ensureValidAccessToken,
  getSpotifyUser,
  createPlaylist,
  addTracksToPlaylist,
};
