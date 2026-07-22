const crypto = require('crypto');
const Party = require('../models/Party');

// Ambiguity-reduced alphabet: no 0/O or 1/I.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const MAX_ATTEMPTS = 5;

function randomCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[crypto.randomInt(ALPHABET.length)];
  }
  return code;
}

async function generateUniquePartyCode() {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const code = randomCode();
    const existing = await Party.findOne({ code });
    if (!existing) return code;
  }
  throw new Error('Failed to generate a unique party code, please try again.');
}

module.exports = { generateUniquePartyCode };
