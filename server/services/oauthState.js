const crypto = require('crypto');

const STATE_TTL_MS = 10 * 60 * 1000;

function getSecret() {
  const secret = process.env.OAUTH_STATE_SECRET;
  if (!secret) {
    throw new Error('OAUTH_STATE_SECRET is not set.');
  }
  return secret;
}

function sign(payload) {
  return crypto.createHmac('sha256', getSecret()).update(payload).digest('hex');
}

// state = base64url(partyId.expiresAt).signature
function createState(partyId) {
  const expiresAt = Date.now() + STATE_TTL_MS;
  const payload = Buffer.from(`${partyId}.${expiresAt}`).toString('base64url');
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

function verifyState(state) {
  if (!state || typeof state !== 'string') return null;
  const parts = state.split('.');
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;

  const expectedSignature = sign(payload);
  const sigBuf = Buffer.from(signature, 'utf8');
  const expectedBuf = Buffer.from(expectedSignature, 'utf8');
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  const decoded = Buffer.from(payload, 'base64url').toString('utf8');
  const [partyId, expiresAtStr] = decoded.split('.');
  const expiresAt = Number(expiresAtStr);
  if (!partyId || !expiresAt || Date.now() > expiresAt) {
    return null;
  }

  return partyId;
}

module.exports = { createState, verifyState };
