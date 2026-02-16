// backend/middleware/planLimits.js
const pool = require('../db-postgres');

// Definición de límites por plan
const PLAN_LIMITS = {
    starter: {
        users: 10,
        clients: 100,
        storage_mb: 500,
        branding: false,
        api_access: false
    },
    professional: {
        users: 30,
        clients: -1, // ilimitado
        storage_mb: 5000,
        branding: true,
        api_access: false
    },
    business: {
        users: 100,
        clients: -1,
        storage_mb: 50000,
        branding: true,
        api_access: true
    },
    enterprise: {
        users: -1, // ilimitado
        clients: -1,
        storage_mb: -1,
        branding: true,
        api_access: true
    }
};

/**
 * Middleware para verificar límites del plan antes de crear recursos
 * @param {string} resource - Tipo de recurso: 'users', 'clients', 'storage'
 */
function checkPlanLimit(resource) {
    return async (req, res, next) => {
        try {
            if (!req.tenant) {
                return res.status(401).json({ error: 'Tenant no encontrado' });
            }

            const plan = req.tenant.plan || 'starter';
            const limits = PLAN_LIMITS[plan];

            // Verificar según el tipo de recurso
            switch (resource) {
                case 'users': {
                    if (limits.users === -1) {
                        return next(); // Ilimitado
                    }

                    const result = await pool.query(
                        'SELECT COUNT(*) FROM users WHERE tenant_id = $1 AND is_active = true',
                        [req.tenantId]
                    );

                    const currentCount = parseInt(result.rows[0].count);

                    if (currentCount >= limits.users) {
                        return res.status(403).json({
                            error: 'Límite de usuarios alcanzado',
                            message: `Tu plan ${plan} permite ${limits.users} usuarios. Actualmente tienes ${currentCount}.`,
                            current: currentCount,
                            limit: limits.users,
                            upgrade_url: '/billing/upgrade',
                            suggested_plan: plan === 'starter' ? 'professional' : 'business'
                        });
                    }
                    break;
                }

                case 'clients': {
                    if (limits.clients === -1) {
                        return next();
                    }

                    const result = await pool.query(
                        'SELECT COUNT(*) FROM clients WHERE tenant_id = $1',
                        [req.tenantId]
                    );

                    const currentCount = parseInt(result.rows[0].count);

                    if (currentCount >= limits.clients) {
                        return res.status(403).json({
                            error: 'Límite de clientes alcanzado',
                            message: `Tu plan ${plan} permite ${limits.clients} clientes. Actualmente tienes ${currentCount}.`,
                            current: currentCount,
                            limit: limits.clients,
                            upgrade_url: '/billing/upgrade',
                            suggested_plan: 'professional'
                        });
                    }
                    break;
                }

                case 'storage': {
                    if (limits.storage_mb === -1) {
                        return next();
                    }

                    // Calcular almacenamiento usado (suma de file_size en attachments + technical_sheets)
                    const attachmentsResult = await pool.query(`
            SELECT COALESCE(SUM(file_size), 0) as total
            FROM attachments a
            JOIN tasks t ON a.task_id = t.id
            WHERE t.tenant_id = $1
          `, [req.tenantId]);

                    const sheetsResult = await pool.query(`
            SELECT COALESCE(SUM(LENGTH(file_path)), 0) as total
            FROM technical_sheets
            WHERE tenant_id = $1
          `, [req.tenantId]);

                    const totalBytes = parseInt(attachmentsResult.rows[0].total) + parseInt(sheetsResult.rows[0].total);
                    const totalMB = Math.round(totalBytes / 1024 / 1024);

                    if (totalMB >= limits.storage_mb) {
                        return res.status(403).json({
                            error: 'Límite de almacenamiento alcanzado',
                            message: `Tu plan ${plan} permite ${limits.storage_mb} MB. Actualmente estás usando ${totalMB} MB.`,
                            current: totalMB,
                            limit: limits.storage_mb,
                            upgrade_url: '/billing/upgrade',
                            suggested_plan: plan === 'starter' ? 'professional' : 'business'
                        });
                    }

                    // Si la subida actual excedería el límite
                    if (req.file && req.file.size) {
                        const newTotalMB = totalMB + Math.round(req.file.size / 1024 / 1024);
                        if (newTotalMB > limits.storage_mb) {
                            return res.status(403).json({
                                error: 'El archivo es demasiado grande',
                                message: `Subir este archivo excedería tu límite de almacenamiento (${limits.storage_mb} MB).`,
                                upgrade_url: '/billing/upgrade'
                            });
                        }
                    }
                    break;
                }

                case 'branding': {
                    if (!limits.branding) {
                        return res.status(403).json({
                            error: 'Personalización de marca no disponible',
                            message: `La personalización de marca no está disponible en el plan ${plan}.`,
                            upgrade_url: '/billing/upgrade',
                            suggested_plan: 'professional'
                        });
                    }
                    break;
                }

                case 'api': {
                    if (!limits.api_access) {
                        return res.status(403).json({
                            error: 'Acceso a API no disponible',
                            message: `El acceso a API no está disponible en el plan ${plan}.`,
                            upgrade_url: '/billing/upgrade',
                            suggested_plan: 'business'
                        });
                    }
                    break;
                }

                default:
                    console.warn(`Recurso desconocido para checkPlanLimit: ${resource}`);
            }

            next();
        } catch (error) {
            console.error('Error en checkPlanLimit:', error);
            return res.status(500).json({ error: 'Error al verificar límites del plan' });
        }
    };
}

/**
 * Obtener información de uso actual del tenant
 */
async function getUsageStats(req, res) {
    try {
        const { tenantId, tenant } = req;
        const limits = PLAN_LIMITS[tenant.plan];

        const [usersResult, clientsResult, storageResult] = await Promise.all([
            pool.query('SELECT COUNT(*) FROM users WHERE tenant_id = $1 AND is_active = true', [tenantId]),
            pool.query('SELECT COUNT(*) FROM clients WHERE tenant_id = $1', [tenantId]),
            pool.query(`
        SELECT COALESCE(SUM(file_size), 0) as total
        FROM attachments a
        JOIN tasks t ON a.task_id = t.id
        WHERE t.tenant_id = $1
      `, [tenantId])
        ]);

        const usage = {
            plan: tenant.plan,
            users: {
                current: parseInt(usersResult.rows[0].count),
                limit: limits.users,
                percentage: limits.users === -1 ? 0 : Math.round((parseInt(usersResult.rows[0].count) / limits.users) * 100)
            },
            clients: {
                current: parseInt(clientsResult.rows[0].count),
                limit: limits.clients,
                percentage: limits.clients === -1 ? 0 : Math.round((parseInt(clientsResult.rows[0].count) / limits.clients) * 100)
            },
            storage: {
                current_mb: Math.round(parseInt(storageResult.rows[0].total) / 1024 / 1024),
                limit_mb: limits.storage_mb,
                percentage: limits.storage_mb === -1 ? 0 : Math.round((parseInt(storageResult.rows[0].total) / 1024 / 1024 / limits.storage_mb) * 100)
            },
            features: {
                branding: limits.branding,
                api_access: limits.api_access
            }
        };

        res.json(usage);
    } catch (error) {
        console.error('Error en getUsageStats:', error);
        res.status(500).json({ error: 'Error al obtener estadísticas de uso' });
    }
}

module.exports = {
    checkPlanLimit,
    getUsageStats,
    PLAN_LIMITS
};
