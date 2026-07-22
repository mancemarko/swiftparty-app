document.addEventListener('DOMContentLoaded', () => {
    const code = window.location.pathname.split('/').filter(Boolean).pop();
    const storageKey = `swiftparty_guest_${code}`;

    const notFound = document.getElementById('notFound');
    const endedSection = document.getElementById('endedSection');
    const joinSection = document.getElementById('joinSection');
    const mainSection = document.getElementById('mainSection');

    init();

    async function init() {
        let party;
        try {
            party = await apiFetch(`/api/parties/${code}`);
            document.getElementById('partyTitle').textContent = party.name;
            document.getElementById('partyTheme').textContent = party.theme || '';
        } catch (err) {
            notFound.style.display = 'block';
            return;
        }

        if (party.status === 'cancelled') {
            endedSection.style.display = 'block';
            return;
        }

        const guestToken = localStorage.getItem(storageKey);
        if (guestToken) {
            try {
                const guest = await apiFetch(`/api/parties/${code}/guests/me`, {
                    headers: { 'X-Guest-Token': guestToken },
                });
                showMain(guest.name);
                return;
            } catch (err) {
                localStorage.removeItem(storageKey);
            }
        }

        showJoinForm();
    }

    function showJoinForm() {
        joinSection.style.display = 'block';

        const form = document.getElementById('joinForm');
        const nameInput = document.getElementById('guestName');
        const btn = document.getElementById('joinBtn');
        const message = document.getElementById('joinMessage');

        nameInput.focus();

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = nameInput.value.trim();

            if (!/^[A-Za-z\s]{2,}$/.test(name)) {
                message.textContent = 'Name can only contain letters and spaces, minimum 2 characters.';
                message.className = 'message error';
                return;
            }

            btn.disabled = true;
            message.textContent = 'Joining...';
            message.className = 'message loading';

            try {
                const guest = await apiFetch(`/api/parties/${code}/guests`, {
                    method: 'POST',
                    body: JSON.stringify({ name }),
                });
                localStorage.setItem(storageKey, guest.guestToken);
                joinSection.style.display = 'none';
                showMain(guest.name);
            } catch (err) {
                message.textContent = err.message;
                message.className = 'message error';
            } finally {
                btn.disabled = false;
            }
        });
    }

    function guestHeaders() {
        return { 'X-Guest-Token': localStorage.getItem(storageKey) };
    }

    function showMain(name) {
        mainSection.style.display = 'block';
        document.getElementById('welcomeMessage').textContent = `Welcome, ${name}!`;

        loadWishlist();
        loadSongs();

        document.getElementById('searchForm').addEventListener('submit', searchSongs);
        document.getElementById('suggestForm').addEventListener('submit', suggestItem);
    }

    async function suggestItem(e) {
        e.preventDefault();
        const type = document.getElementById('suggestType').value;
        const name = document.getElementById('suggestName').value.trim();
        const description = document.getElementById('suggestDescription').value.trim();
        const btn = document.getElementById('suggestBtn');
        const message = document.getElementById('suggestMessage');

        if (!name) {
            message.textContent = 'Name is required.';
            message.className = 'message error';
            return;
        }

        btn.disabled = true;
        message.textContent = 'Sending suggestion...';
        message.className = 'message loading';

        try {
            await apiFetch(`/api/parties/${code}/wishlist/suggest`, {
                method: 'POST',
                headers: guestHeaders(),
                body: JSON.stringify({ type, name, description: description || undefined }),
            });
            document.getElementById('suggestForm').reset();
            message.textContent = 'Suggestion sent! The host needs to approve it before it shows up here.';
            message.className = 'message success';
        } catch (err) {
            message.textContent = err.message;
            message.className = 'message error';
        } finally {
            btn.disabled = false;
        }
    }

    async function loadWishlist() {
        const container = document.getElementById('wishlistContainer');
        try {
            const data = await apiFetch(`/api/parties/${code}/wishlist`, { headers: guestHeaders() });
            if (!data.items.length) {
                container.innerHTML = '<p style="text-align:center;color:#ccc;">Nothing published yet — check back soon.</p>';
                return;
            }
            container.innerHTML = data.items.map(item => `
                <div class="list-item">
                    <span>${item.type === 'drink' ? '🍹' : '🍽️'} ${escapeHtml(item.name)}${item.description ? ` <span class="meta">— ${escapeHtml(item.description)}</span>` : ''}</span>
                    <button class="vote-btn ${item.votedByMe ? 'voted' : ''}" data-id="${item._id}">
                        ${item.votedByMe ? '✓ ' : ''}${item.voteCount}
                    </button>
                </div>
            `).join('');

            container.querySelectorAll('button[data-id]').forEach(btn => {
                btn.addEventListener('click', () => vote(btn.dataset.id));
            });
        } catch (err) {
            container.innerHTML = `<p class="message error">${err.message}</p>`;
        }
    }

    async function vote(itemId) {
        try {
            await apiFetch(`/api/parties/${code}/wishlist/${itemId}/vote`, {
                method: 'POST',
                headers: guestHeaders(),
            });
            await loadWishlist();
        } catch (err) {
            alert(err.message);
        }
    }

    async function searchSongs(e) {
        e.preventDefault();
        const q = document.getElementById('searchInput').value.trim();
        const message = document.getElementById('searchMessage');
        const results = document.getElementById('searchResults');

        if (!q) return;

        message.textContent = 'Searching...';
        message.className = 'message loading';
        results.innerHTML = '';

        try {
            const data = await apiFetch(`/api/parties/${code}/songs/search?q=${encodeURIComponent(q)}`, {
                headers: guestHeaders(),
            });
            message.textContent = '';

            if (!data.tracks.length) {
                results.innerHTML = '<p style="text-align:center;color:#ccc;">No results.</p>';
                return;
            }

            results.innerHTML = data.tracks.map(track => `
                <div class="track-result">
                    ${track.albumArt ? `<img src="${track.albumArt}" alt="">` : ''}
                    <div class="track-info">
                        <div class="title">${escapeHtml(track.title)}</div>
                        <div class="artist">${escapeHtml(track.artist)}</div>
                    </div>
                    <button data-track-id="${track.spotifyTrackId}">Add</button>
                </div>
            `).join('');

            results.querySelectorAll('button[data-track-id]').forEach(btn => {
                btn.addEventListener('click', () => addSong(btn.dataset.trackId, btn));
            });
        } catch (err) {
            message.textContent = err.message;
            message.className = 'message error';
        }
    }

    async function addSong(spotifyTrackId, btn) {
        btn.disabled = true;
        btn.textContent = 'Adding...';
        try {
            const result = await apiFetch(`/api/parties/${code}/songs`, {
                method: 'POST',
                headers: guestHeaders(),
                body: JSON.stringify({ spotifyTrackId }),
            });
            btn.textContent = result.alreadyAdded ? 'Already added' : 'Added ✓';
            await loadSongs();
        } catch (err) {
            btn.disabled = false;
            btn.textContent = 'Add';
            alert(err.message);
        }
    }

    async function loadSongs() {
        const container = document.getElementById('songsContainer');
        try {
            const data = await apiFetch(`/api/parties/${code}/songs`);
            if (!data.songs.length) {
                container.innerHTML = '<p style="text-align:center;color:#ccc;">No songs submitted yet — add the first one!</p>';
                return;
            }
            container.innerHTML = data.songs.map(song => `
                <div class="track-result">
                    ${song.albumArt ? `<img src="${song.albumArt}" alt="">` : ''}
                    <div class="track-info">
                        <div class="title">${escapeHtml(song.title)}</div>
                        <div class="artist">${escapeHtml(song.artist)} — added by ${escapeHtml(song.guest?.name || 'unknown')}</div>
                    </div>
                </div>
            `).join('');
        } catch (err) {
            container.innerHTML = `<p class="message error">${err.message}</p>`;
        }
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str ?? '';
        return div.innerHTML;
    }
});
