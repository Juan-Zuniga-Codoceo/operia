const jwt = require('jsonwebtoken');
const pool = require('../db-postgres'); // PostgreSQL pool

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  console.log('🔐 Auth Middleware - Headers:', req.headers); // DEBUG
  console.log('🔐 Auth Middleware - AuthHeader:', authHeader); // DEBUG
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    console.log('❌ Auth Middleware - No token found'); // DEBUG
    return res.status(401).json({ error: 'Token de acceso requerido' });
  }

  try {
    // Verificar el token JWT
    const tokenPayload = jwt.verify(token, process.env.JWT_SECRET);

    // El token es válido, extraemos ID y tenant_id del payload
    const userId = tokenPayload.id;
    const tokenTenantId = tokenPayload.tenant_id || tokenPayload.tenantId; // Soporte para ambos formatos

    // Verificar que el tenant del token coincida con el tenant del subdomain
    if (req.tenantId && tokenTenantId !== req.tenantId) {
      return res.status(403).json({
        error: 'Token no válido para esta organización',
        message: 'El token pertenece a otra organización'
      });
    }

    // Buscar al usuario en PostgreSQL
    const result = await pool.query(
      `SELECT id, tenant_id, name, email, office, role, avatar_url, email_notifications
       FROM users 
       WHERE id = $1 AND tenant_id = $2 AND is_active = true`,
      [userId, tokenTenantId]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'El usuario del token ya no existe o está inactivo' });
    }

    const user = result.rows[0];

    // Adjuntar usuario y tenant al request
    req.userId = user.id;
    req.user = user;

    // Si no se había extraído el tenant antes (opcional), lo hacemos ahora
    if (!req.tenantId) {
      req.tenantId = user.tenant_id;
    }

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(403).json({ error: 'Token expirado, por favor inicia sesión nuevamente' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(403).json({ error: 'Token inválido' });
    }
    console.error('Error en authenticateToken:', err);
    return res.status(500).json({ error: 'Error al autenticar' });
  }
};

module.exports = { authenticateToken };