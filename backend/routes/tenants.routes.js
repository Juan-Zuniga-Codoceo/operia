const express = require('express');
const router = express.Router();
const pool = require('../db-postgres');
const { authenticateToken } = require('../middleware/auth');

/**
 * DELETE /api/tenants/current
 * Elimina la organización actual y todos sus datos.
 * Requiere ser administrador del tenant.
 */
router.delete('/current', authenticateToken, async (req, res) => {
    const client = await pool.connect();

    try {
        // 1. Verificar que el usuario es admin
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'No tienes permisos para realizar esta acción.' });
        }

        const tenantId = req.user.tenant_id;
        // Confirmación adicional: el body debe incluir el subdomain
        const { confirmation_subdomain } = req.body;

        // 2. Obtener datos del tenant para verificar subdomain
        const tenantResult = await client.query('SELECT * FROM tenants WHERE id = $1', [tenantId]);

        if (tenantResult.rows.length === 0) {
            return res.status(404).json({ error: 'Organización no encontrada.' });
        }

        const tenant = tenantResult.rows[0];

        if (confirmation_subdomain !== tenant.subdomain) {
            return res.status(400).json({ error: 'El subdominio de confirmación no coincide.' });
        }

        await client.query('BEGIN');

        // 3. Eliminar datos en cascada (mismo orden que el script)

        // Adjuntos
        await client.query('DELETE FROM attachments WHERE tenant_id = $1', [tenantId]);

        // Tareas (Los comentarios se borran si hay ON DELETE CASCADE, si no, habría que borrarlos antes)
        // Asumimos que comments tiene FK a tasks. Si comments tuviera tenant_id, lo borraríamos aquí.
        // Por seguridad, borramos comentarios asociados a tareas de este tenant si no tienen cascade
        // Pero en el script anterior asumimos que tasks borra lo suyo.
        // Si hay tablas intermedias, borrarlas.

        await client.query('DELETE FROM tasks WHERE tenant_id = $1', [tenantId]);
        await client.query('DELETE FROM labels WHERE tenant_id = $1', [tenantId]);
        // await client.query('DELETE FROM user_invitations WHERE tenant_id = $1', [tenantId]); // Si existiera
        await client.query('DELETE FROM users WHERE tenant_id = $1', [tenantId]);
        await client.query('DELETE FROM sender_config WHERE tenant_id = $1', [tenantId]);
        await client.query('DELETE FROM notifications WHERE tenant_id = $1', [tenantId]);

        // Finalmente, el tenant
        await client.query('DELETE FROM tenants WHERE id = $1', [tenantId]);

        await client.query('COMMIT');

        res.json({ success: true, message: 'Organización eliminada exitosamente.' });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error al eliminar tenant:', error);
        res.status(500).json({ error: 'Error interno al eliminar la organización.' });
    } finally {
        client.release();
    }
});

module.exports = router;
