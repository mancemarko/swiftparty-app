// Requires req.party to already be set (by router.param('code', ...), requireHost, or resolveGuest).
function blockIfCancelled(req, res, next) {
  if (req.party.status === 'cancelled') {
    return res.status(410).json({ error: 'This party has ended.' });
  }
  next();
}

module.exports = blockIfCancelled;
