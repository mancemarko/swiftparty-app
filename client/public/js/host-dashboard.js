document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');

    if (!code) {
        document.body.innerHTML = '<h1>No party code provided.</h1><p class="center"><a href="index.html" class="back-btn">← Back</a></p>';
        return;
    }

    let hostToken = localStorage.getItem(`swiftparty_host_${code}`);

    const tokenPrompt = document.getElementById('tokenPrompt');
    const dashboardContent = document.getElementById('dashboardContent');

    if (!hostToken) {
        tokenPrompt.style.display = 'block';
        document.getElementById('hostTokenSubmit').addEventListener('click', () => {
            const value = document.getElementById('hostTokenInput').value.trim();
            if (!value) return;
            localStorage.setItem(`swiftparty_host_${code}`, value);
            hostToken = value;
            tokenPrompt.style.display = 'none';
            init();
        });
        return;
    }

    init();

    function authHeaders() {
        return { 'X-Host-Token': hostToken };
    }

    async function init() {
        dashboardContent.style.display = 'block';

        document.getElementById('spotifyPartyCode').value = code;
        document.getElementById('spotifyHostToken').value = hostToken;

        if (params.get('spotifyConnected')) {
            showSpotifyStatus('Spotify connected!', 'success');
        } else if (params.get('spotifyError')) {
            showSpotifyStatus('Spotify connection failed. Please try again.', 'error');
        }

        await loadDashboard();

        document.getElementById('copyBtn').addEventListener('click', copyShareLink);
        document.getElementById('wishlistForm').addEventListener('submit', addWishlistItem);
        document.getElementById('syncBtn').addEventListener('click', syncPlaylist);
        document.getElementById('cancelPartyBtn').addEventListener('click', cancelParty);
    }

    async function loadDashboard() {
        try {
            const data = await apiFetch(`/api/parties/${code}/dashboard`, { headers: authHeaders() });

            document.getElementById('partyTitle').textContent = data.name;
            document.getElementById('partyTheme').textContent = data.theme || '';
            document.getElementById('shareUrl').value = data.shareUrl;
            renderStatus(data.status);

            renderGuests(data.guests);
            renderWishlist(data.wishlist);
            renderSongs(data.songs);
            renderSpotify(data.spotify);
        } catch (err) {
            if (err.status === 403 || err.status === 401) {
                localStorage.removeItem(`swiftparty_host_${code}`);
                tokenPrompt.style.display = 'block';
                dashboardContent.style.display = 'none';
            } else {
                document.body.insertAdjacentHTML('afterbegin', `<p class="message error">${err.message}</p>`);
            }
        }
    }

    function renderStatus(status) {
        const badge = document.getElementById('statusBadge');
        const cancelBtn = document.getElementById('cancelPartyBtn');
        if (status === 'cancelled') {
            badge.textContent = '⏹ Party ended';
            cancelBtn.style.display = 'none';
        } else {
            badge.textContent = '🟢 Live';
            cancelBtn.style.display = 'inline-block';
        }
    }

    async function cancelParty() {
        if (!confirm('End this party? Guests will no longer be able to join, vote, or add songs.')) {
            return;
        }
        try {
            await apiFetch(`/api/parties/${code}/cancel`, { method: 'POST', headers: authHeaders() });
            await loadDashboard();
        } catch (err) {
            alert(err.message);
        }
    }

    function copyShareLink() {
        const input = document.getElementById('shareUrl');
        input.select();
        navigator.clipboard?.writeText(input.value);
    }

    function renderGuests(guests) {
        const container = document.getElementById('guestsContainer');
        if (!guests.length) {
            container.innerHTML = '<p style="text-align:center;color:#ccc;">No guests have joined yet.</p>';
            return;
        }
        container.innerHTML = guests.map(g => `
            <div class="list-item">
                <span>${escapeHtml(g.name)}</span>
                <span class="meta">${new Date(g.createdAt).toLocaleDateString()}</span>
            </div>
        `).join('');
    }

    function renderWishlist(items) {
        const container = document.getElementById('wishlistContainer');
        const suggestions = items.filter(item => item.suggestedBy && !item.published);
        const regular = items.filter(item => !(item.suggestedBy && !item.published));

        const suggestionsHtml = suggestions.length ? `
            <h3 style="color:beige;">Pending Suggestions</h3>
            ${suggestions.map(item => `
                <div class="list-item">
                    <span>${item.type === 'drink' ? '🍹' : '🍽️'} ${escapeHtml(item.name)}${item.description ? ` <span class="meta">— ${escapeHtml(item.description)}</span>` : ''} <span class="meta">— suggested by ${escapeHtml(item.suggestedBy?.name || 'a guest')}</span></span>
                    <span>
                        <button data-action="approve-item" data-id="${item._id}">Approve</button>
                        <button class="danger" data-action="delete-item" data-id="${item._id}">Reject</button>
                    </span>
                </div>
            `).join('')}
        ` : '';

        const regularHtml = regular.length ? regular.map(item => `
            <div class="list-item">
                <span>${item.type === 'drink' ? '🍹' : '🍽️'} ${escapeHtml(item.name)}${item.description ? ` <span class="meta">— ${escapeHtml(item.description)}</span>` : ''} <span class="meta">— ${item.voteCount || 0} vote${item.voteCount === 1 ? '' : 's'}</span></span>
                <span>
                    <button class="secondary" data-action="toggle-publish" data-id="${item._id}" data-published="${item.published}">
                        ${item.published ? 'Unpublish' : 'Publish'}
                    </button>
                    <button class="danger" data-action="delete-item" data-id="${item._id}">Delete</button>
                </span>
            </div>
        `).join('') : '<p style="text-align:center;color:#ccc;">No wishlist items yet.</p>';

        container.innerHTML = suggestionsHtml + regularHtml;

        container.querySelectorAll('[data-action="toggle-publish"]').forEach(btn => {
            btn.addEventListener('click', () => togglePublish(btn.dataset.id, btn.dataset.published === 'true'));
        });
        container.querySelectorAll('[data-action="approve-item"]').forEach(btn => {
            btn.addEventListener('click', () => togglePublish(btn.dataset.id, false));
        });
        container.querySelectorAll('[data-action="delete-item"]').forEach(btn => {
            btn.addEventListener('click', () => deleteWishlistItem(btn.dataset.id));
        });
    }

    function renderSongs(songs) {
        const container = document.getElementById('songsContainer');
        if (!songs.length) {
            container.innerHTML = '<p style="text-align:center;color:#ccc;">No songs submitted yet.</p>';
            return;
        }
        container.innerHTML = songs.map(song => `
            <div class="track-result">
                ${song.albumArt ? `<img src="${song.albumArt}" alt="">` : ''}
                <div class="track-info">
                    <div class="title">${escapeHtml(song.title)}</div>
                    <div class="artist">${escapeHtml(song.artist)} — submitted by ${escapeHtml(song.guest?.name || 'unknown')}</div>
                </div>
                <button class="danger" data-id="${song._id}">Remove</button>
            </div>
        `).join('');

        container.querySelectorAll('button[data-id]').forEach(btn => {
            btn.addEventListener('click', () => deleteSong(btn.dataset.id));
        });
    }

    function renderSpotify(spotify) {
        const disconnected = document.getElementById('spotifyDisconnected');
        const connected = document.getElementById('spotifyConnected');
        const playlistLink = document.getElementById('playlistLink');

        if (spotify.connected) {
            disconnected.style.display = 'none';
            connected.style.display = 'block';
            if (spotify.playlistUrl) {
                playlistLink.href = spotify.playlistUrl;
                playlistLink.style.display = 'inline-block';
            }
        } else {
            disconnected.style.display = 'block';
            connected.style.display = 'none';
        }
    }

    async function addWishlistItem(e) {
        e.preventDefault();
        const type = document.getElementById('itemType').value;
        const name = document.getElementById('itemName').value.trim();
        const description = document.getElementById('itemDescription').value.trim();
        const message = document.getElementById('wishlistMessage');

        if (!name) {
            message.textContent = 'Name is required.';
            message.className = 'message error';
            return;
        }

        try {
            await apiFetch(`/api/parties/${code}/wishlist`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ type, name, description: description || undefined }),
            });
            document.getElementById('wishlistForm').reset();
            message.textContent = 'Added!';
            message.className = 'message success';
            await loadDashboard();
        } catch (err) {
            message.textContent = err.message;
            message.className = 'message error';
        }
    }

    async function togglePublish(itemId, currentlyPublished) {
        try {
            await apiFetch(`/api/parties/${code}/wishlist/${itemId}`, {
                method: 'PATCH',
                headers: authHeaders(),
                body: JSON.stringify({ published: !currentlyPublished }),
            });
            await loadDashboard();
        } catch (err) {
            alert(err.message);
        }
    }

    async function deleteWishlistItem(itemId) {
        try {
            await apiFetch(`/api/parties/${code}/wishlist/${itemId}`, { method: 'DELETE', headers: authHeaders() });
            await loadDashboard();
        } catch (err) {
            alert(err.message);
        }
    }

    async function deleteSong(songId) {
        try {
            await apiFetch(`/api/parties/${code}/songs/${songId}`, { method: 'DELETE', headers: authHeaders() });
            await loadDashboard();
        } catch (err) {
            alert(err.message);
        }
    }

    async function syncPlaylist() {
        const btn = document.getElementById('syncBtn');
        const message = document.getElementById('syncMessage');
        btn.disabled = true;
        message.textContent = 'Syncing...';
        message.className = 'message loading';

        try {
            const result = await apiFetch(`/api/parties/${code}/spotify/sync`, { method: 'POST', headers: authHeaders() });
            message.textContent = `Added ${result.addedCount} song(s) to the playlist.`;
            message.className = 'message success';
            await loadDashboard();
        } catch (err) {
            message.textContent = err.message;
            message.className = 'message error';
        } finally {
            btn.disabled = false;
        }
    }

    function showSpotifyStatus(text, type) {
        const el = document.getElementById('spotifyStatusMessage');
        el.textContent = text;
        el.className = `message ${type}`;
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str ?? '';
        return div.innerHTML;
    }
});
