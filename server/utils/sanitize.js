const NAME_PATTERN = /^[A-Za-z\s]{2,}$/;

function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  return input.replace(/[<>]/g, '').trim();
}

function isValidName(name) {
  return NAME_PATTERN.test(name);
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { sanitizeInput, isValidName, escapeRegex, NAME_PATTERN };
