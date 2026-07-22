document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('createForm');
    const nameInput = document.getElementById('partyName');
    const themeInput = document.getElementById('partyTheme');
    const btn = document.getElementById('createBtn');
    const message = document.getElementById('createMessage');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const name = nameInput.value.trim();
        if (name.length < 2) {
            showMessage('Party name must be at least 2 characters.', 'error');
            return;
        }

        btn.disabled = true;
        btn.textContent = 'Creating...';
        showMessage('Creating your party...', 'loading');

        try {
            const result = await apiFetch('/api/parties', {
                method: 'POST',
                body: JSON.stringify({ name, theme: themeInput.value.trim() || undefined }),
            });

            localStorage.setItem(`swiftparty_host_${result.code}`, result.hostToken);
            showMessage('Party created! Redirecting to your dashboard...', 'success');

            window.location.href = `/host-dashboard.html?code=${encodeURIComponent(result.code)}`;
        } catch (err) {
            showMessage(err.message || 'Failed to create party. Please try again.', 'error');
            btn.disabled = false;
            btn.textContent = 'Create Party';
        }
    });

    function showMessage(text, type) {
        message.textContent = text;
        message.className = `message ${type}`;
    }
});
