const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-this';

function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorised' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.is_active === false) return res.status(403).json({ error: 'Account disabled' });
    req.admin = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireSuperAdmin(req, res, next) {
  requireAdmin(req, res, () => {
    if (req.admin.role !== 'super_admin') {
      return res.status(403).json({ error: 'Super admin access required' });
    }
    next();
  });
}

// Non-blocking check: returns true if the request carries a valid, active
// admin token, false otherwise. Lets a public route selectively expose extra
// fields to admin callers without splitting into two separate endpoints.
function isAdmin(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    return decoded.is_active !== false;
  } catch {
    return false;
  }
}

module.exports = { requireAdmin, requireSuperAdmin, isAdmin, JWT_SECRET };
