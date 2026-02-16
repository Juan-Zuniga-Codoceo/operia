// backend/routes/admin.routes-postgres.js
// PostgreSQL version with multi-tenancy
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');
const pool = require('../db-postgres');
const { authenticateToken } = require('../middleware/auth');

const jsonParser = express.json();

// Middleware para verificar que el usuario sea administrador
const isAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ error: 'Acceso denegado. Se requiere rol de administrador.' });
    }
};

// Todas las rutas requieren autenticación y rol de admin
router.use(authenticateToken, isAdmin);

// ======================================================
// ===       RUTAS DE ADMINISTRACIÓN DE USUARIOS      ===
// ======================================================

// 👤 OBTENER TODOS LOS USUARIOS (ACTIVOS E INACTIVOS) - SOLO PARA ADMINS
router.get('/users', async (req, res) => {
    try {
        const { tenantId } = req;

        const result = await pool.query(
            `SELECT id, name, email, office, role, is_active, created_at 
             FROM users 
             WHERE tenant_id = $1 
             ORDER BY name`,
            [tenantId]
        );

        res.json(result.rows || []);
    } catch (err) {
        console.error('❌ Error al obtener usuarios:', err);
        res.status(500).json({ error: 'Error al obtener la lista de usuarios.' });
    }
});

// 👤 CREAR UN NUEVO USUARIO (por un admin)
router.post('/users', jsonParser, [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('name').trim().notEmpty(),
    body('role').isIn(['user', 'admin'])
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: 'Datos inválidos', details: errors.array() });
        }

        const { name, email, password, office, role } = req.body;
        const { tenantId } = req;

        // Check if email already exists in this tenant
        const existingUser = await pool.query(
            'SELECT id FROM users WHERE tenant_id = $1 AND email = $2',
            [tenantId, email]
        );

        if (existingUser.rows.length > 0) {
            return res.status(409).json({ error: 'El correo ya está registrado en esta organización' });
        }

        // Check plan limits
        const tenantResult = await pool.query(
            'SELECT max_users FROM tenants WHERE id = $1',
            [tenantId]
        );

        const maxUsers = tenantResult.rows[0].max_users;

        const userCountResult = await pool.query(
            'SELECT COUNT(*) as count FROM users WHERE tenant_id = $1',
            [tenantId]
        );

        const currentUserCount = parseInt(userCountResult.rows[0].count);

        if (currentUserCount >= maxUsers) {
            return res.status(400).json({
                error: 'Límite de usuarios alcanzado',
                message: `Tu plan permite un máximo de ${maxUsers} usuarios. Actualiza tu plan para agregar más.`
            });
        }

        // Create user
        const hashedPassword = await bcrypt.hash(password, 12);

        const result = await pool.query(
            `INSERT INTO users (tenant_id, name, email, password, office, role, is_active) 
             VALUES ($1, $2, $3, $4, $5, $6, true) 
             RETURNING id`,
            [tenantId, name, email, hashedPassword, office || '', role]
        );

        res.status(201).json({
            success: true,
            userId: result.rows[0].id,
            message: 'Usuario creado correctamente.'
        });
    } catch (err) {
        console.error('❌ Error al crear usuario:', err);

        if (err.constraint === 'users_tenant_id_email_key') {
            return res.status(409).json({ error: 'El correo ya está registrado' });
        }

        res.status(500).json({ error: 'Error al crear el usuario' });
    }
});

// ✏️ EDITAR UN USUARIO (por un admin)
router.put('/users/:id', jsonParser, [
    body('name').trim().notEmpty(),
    body('email').isEmail().normalizeEmail(),
    body('role').isIn(['user', 'admin'])
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: 'Datos de usuario inválidos', details: errors.array() });
        }

        const { name, email, office, role } = req.body;
        const userId = req.params.id;
        const { tenantId } = req;

        // Check if email is already used by another user in this tenant
        const existingUser = await pool.query(
            'SELECT id FROM users WHERE tenant_id = $1 AND email = $2 AND id != $3',
            [tenantId, email, userId]
        );

        if (existingUser.rows.length > 0) {
            return res.status(409).json({ error: 'El correo ya pertenece a otro usuario.' });
        }

        // Update user
        const result = await pool.query(
            `UPDATE users 
             SET name = $1, email = $2, office = $3, role = $4 
             WHERE id = $5 AND tenant_id = $6`,
            [name, email, office || '', role, userId, tenantId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado.' });
        }

        res.status(200).json({ success: true, message: 'Usuario actualizado correctamente.' });
    } catch (err) {
        console.error('❌ Error al actualizar usuario:', err);

        if (err.constraint === 'users_tenant_id_email_key') {
            return res.status(409).json({ error: 'El correo ya pertenece a otro usuario.' });
        }

        res.status(500).json({ error: 'Error al actualizar el usuario.' });
    }
});

// 🗑️ ELIMINAR UN USUARIO (por un admin)
router.delete('/users/:id', async (req, res) => {
    const client = await pool.connect();

    try {
        const userIdToDelete = req.params.id;
        const { userId, tenantId } = req;

        // Evitar que un admin se elimine a sí mismo
        if (parseInt(userIdToDelete, 10) === userId) {
            return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta de administrador.' });
        }

        await client.query('BEGIN');

        // Verify user belongs to tenant
        const userCheck = await client.query(
            'SELECT id FROM users WHERE id = $1 AND tenant_id = $2',
            [userIdToDelete, tenantId]
        );

        if (userCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Usuario no encontrado.' });
        }

        // 1. Reasignar tareas creadas por el usuario al admin que lo elimina
        await client.query(
            'UPDATE tasks SET created_by = $1 WHERE created_by = $2 AND tenant_id = $3',
            [userId, userIdToDelete, tenantId]
        );

        // 2. Eliminar asignaciones de tareas
        await client.query(
            `DELETE FROM task_assignments 
             WHERE user_id = $1 
             AND task_id IN (SELECT id FROM tasks WHERE tenant_id = $2)`,
            [userIdToDelete, tenantId]
        );

        // 3. Actualizar responsible_user_id en tareas
        await client.query(
            'UPDATE tasks SET responsible_user_id = NULL WHERE responsible_user_id = $1 AND tenant_id = $2',
            [userIdToDelete, tenantId]
        );

        // 4. Eliminar notificaciones del usuario
        await client.query(
            'DELETE FROM notifications WHERE usuario_id = $1 AND tenant_id = $2',
            [userIdToDelete, tenantId]
        );

        // 5. Finalmente, eliminar al usuario
        const deleteResult = await client.query(
            'DELETE FROM users WHERE id = $1 AND tenant_id = $2',
            [userIdToDelete, tenantId]
        );

        if (deleteResult.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Usuario no encontrado.' });
        }

        await client.query('COMMIT');

        res.status(200).json({
            success: true,
            message: 'Usuario eliminado y sus tareas han sido reasignadas.'
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Error al eliminar usuario:', err);
        res.status(500).json({ error: 'Error al eliminar el usuario.' });
    } finally {
        client.release();
    }
});

// ⚡ TOGGLE (ACTIVAR/DESACTIVAR) ESTADO DE UN USUARIO
router.put('/users/:id/status', jsonParser, [
    body('is_active').isBoolean()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: 'Valor de estado inválido. Debe ser true o false.' });
        }

        const userIdToToggle = req.params.id;
        const { is_active } = req.body;
        const { userId, tenantId } = req;

        // Evitar que un admin se desactive a sí mismo
        if (parseInt(userIdToToggle, 10) === userId) {
            return res.status(400).json({ error: 'No puedes desactivar tu propia cuenta de administrador.' });
        }

        const result = await pool.query(
            'UPDATE users SET is_active = $1 WHERE id = $2 AND tenant_id = $3',
            [is_active, userIdToToggle, tenantId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado.' });
        }

        const message = is_active ? 'Usuario activado correctamente.' : 'Usuario desactivado correctamente.';
        res.status(200).json({ success: true, message });
    } catch (err) {
        console.error('❌ Error al cambiar estado del usuario:', err);
        res.status(500).json({ error: 'Error al cambiar el estado del usuario.' });
    }
});

module.exports = router;
