const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const ALGORITHM = 'HS256';
const EXPIRES_IN = '7d';

/**
 * Express middleware — validates the Bearer JWT on every request.
 * Attaches decoded payload to req.user on success.
 */
function verifyToken(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, SECRET, { algorithms: [ALGORITHM] });
    req.user = payload; // { sub: userId, role, iat, exp }
    next();
  } catch (err) {
    const msg = err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token';
    return res.status(401).json({ error: msg });
  }
}

/**
 * Issue a signed JWT for a user.
 * Called during login/register — not middleware.
 */
function issueToken(userId, role) {
  return jwt.sign({ sub: userId, role }, SECRET, {
    algorithm: ALGORITHM,
    expiresIn: EXPIRES_IN,
  });
}

/**
 * Role-based guard factory.
 * Usage: router.delete('/:id', verifyToken, requireRole('admin'), handler)
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

module.exports = { verifyToken, issueToken, requireRole };
