// backend/middleware/tenant.middleware.js
const pool = require('../db-postgres');

/**
 * Middleware para extraer el tenant desde el subdomain
 * Ejemplo: acme.operia.app → tenant_id de "acme"
 */
async function extractTenant(req, res, next) {
    try {
        // Obtener el host de la petición
        const host = req.headers.host || req.headers['x-forwarded-host'] || '';

        // Extraer subdomain (primera parte antes del primer punto)
        // Ejemplo: "acme.operia.app" → "acme"
        const parts = host.split('.');

        // Si no hay subdomain o es www/operia, es inválido
        if (parts.length < 2) {
            return res.status(400).json({
                error: 'Subdomain no válido',
                message: 'Debes acceder a través de tu subdomain: tuempresa.operia.app'
            });
        }

        const subdomain = parts[0];

        // Subdomains reservados
        const reserved = ['www', 'api', 'app', 'admin', 'mail', 'ftp', 'operia'];
        if (reserved.includes(subdomain.toLowerCase())) {
            return res.status(400).json({
                error: 'Subdomain reservado',
                message: 'Este subdomain no está disponible'
            });
        }

        // Buscar tenant en la base de datos
        const result = await pool.query(
            'SELECT * FROM tenants WHERE subdomain = $1',
            [subdomain]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'Organización no encontrada',
                message: `No existe una organización con el subdomain "${subdomain}"`,
                subdomain: subdomain
            });
        }

        const tenant = result.rows[0];

        // Verificar estado de suscripción
        if (tenant.subscription_status === 'trial_expired') {
            return res.status(403).json({
                error: 'Trial expirado',
                message: 'Tu período de prueba ha terminado. Por favor, actualiza tu plan.',
                upgrade_url: '/billing/upgrade'
            });
        }

        if (tenant.subscription_status === 'suspended') {
            return res.status(403).json({
                error: 'Cuenta suspendida',
                message: 'Tu cuenta ha sido suspendida. Contacta a soporte.'
            });
        }

        // Adjuntar tenant al request
        req.tenant = tenant;
        req.tenantId = tenant.id;

        next();
    } catch (error) {
        console.error('Error en extractTenant middleware:', error);
        return res.status(500).json({ error: 'Error al verificar organización' });
    }
}

/**
 * Middleware opcional para rutas que NO requieren tenant
 * (ej: signup, landing page, etc.)
 */
function optionalTenant(req, res, next) {
    const host = req.headers.host || req.headers['x-forwarded-host'] || '';
    const parts = host.split('.');

    // Permitir localhost o dominios sin punto (desarrollo)
    if (parts.length < 2 || parts[0] === 'localhost' || host.startsWith('localhost:')) {
        req.tenant = null;
        req.tenantId = null;
        return next();
    }

    const subdomain = parts[0];
    const reserved = ['www', 'api', 'app', 'admin', 'mail', 'ftp', 'operia'];

    if (!reserved.includes(subdomain.toLowerCase())) {
        // Intentar extraer tenant pero no fallar si no existe
        return extractTenant(req, res, next).catch(() => {
            req.tenant = null;
            req.tenantId = null;
            next();
        });
    }

    // No hay tenant, continuar sin él
    req.tenant = null;
    req.tenantId = null;
    next();
}

module.exports = {
    extractTenant,
    optionalTenant
};
