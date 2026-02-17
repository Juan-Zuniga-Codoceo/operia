// backend/routes/users.routes-postgres.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const path = require('path');
const multer = require('multer');
const { body, validationResult } = require('express-validator');
const pool = require('../db-postgres');
const { authenticateToken } = require('../middleware/auth');
const { checkPlanLimit } = require('../middleware/planLimits');

const jsonParser = express.json({ limit: '10mb' });

// --- Configuración de Multer para AVATAR ---
const uploadsDir = process.env.RENDER_UPLOADS_PATH || path.join(__dirname, '..', '..', 'uploads');
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const originalName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        cb(null, uniqueSuffix + '-' + originalName);
    }
});

const avatarFileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Solo se permiten imágenes para el avatar'), false);
    }
};

const uploadAvatar = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: avatarFileFilter
});

// ======================================================
// ===       DEFINICIÓN DE RUTAS DE USUARIOS          ===
// ======================================================

// 👥 OBTENER LISTA DE USUARIOS (filtrado por tenant)
router.get('/users', authenticateToken, async (req, res) => {
    try {
        const { tenantId } = req;

        const result = await pool.query(
            `SELECT id, tenant_id, name, email, office, role, avatar_url, email_notifications 
       FROM users 
       WHERE tenant_id = $1 AND is_active = true 
       ORDER BY name`,
            [tenantId]
        );

        res.json(result.rows || []);
    } catch (err) {
        console.error('❌ Error al obtener usuarios:', err);
        res.status(500).json({ error: 'Error al obtener usuarios' });
    }
});

// ✏️ ACTUALIZAR PERFIL DEL USUARIO
router.put('/user/profile', jsonParser, authenticateToken, [
    body('name').trim().notEmpty().isLength({ min: 2 }),
    body('phone').optional().trim()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: 'Datos inválidos', details: errors.array() });
        }

        const { name, phone } = req.body;
        const { userId, tenantId } = req;

        const result = await pool.query(
            'UPDATE users SET name = $1, phone = $2 WHERE id = $3 AND tenant_id = $4',
            [name, phone || '', userId, tenantId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        res.status(200).json({ success: true, message: 'Perfil actualizado correctamente.' });
    } catch (err) {
        console.error('❌ Error al actualizar perfil:', err);
        res.status(500).json({ error: 'No se pudo actualizar el perfil.' });
    }
});

// ⚙️ ACTUALIZAR PREFERENCIAS DEL USUARIO
router.put('/user/preferences', jsonParser, authenticateToken, async (req, res) => {
    try {
        const { email_notifications } = req.body;
        const { userId, tenantId } = req;

        if (email_notifications === undefined || ![0, 1, true, false].includes(email_notifications)) {
            return res.status(400).json({ error: 'Valor inválido para email_notifications' });
        }

        const result = await pool.query(
            'UPDATE users SET email_notifications = $1 WHERE id = $2 AND tenant_id = $3',
            [!!email_notifications, userId, tenantId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        res.status(200).json({ success: true, message: 'Preferencias actualizadas.' });
    } catch (err) {
        console.error('❌ Error al actualizar preferencias:', err);
        res.status(500).json({ error: 'No se pudieron actualizar las preferencias.' });
    }
});

// 🔐 CAMBIAR CONTRASEÑA DEL USUARIO AUTENTICADO
router.put('/user/password', jsonParser, authenticateToken, [
    body('currentPassword').isLength({ min: 1 }),
    body('newPassword').isLength({ min: 6 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: 'Datos inválidos' });
        }

        const { currentPassword, newPassword } = req.body;
        const { userId, tenantId } = req;

        const result = await pool.query(
            'SELECT password FROM users WHERE id = $1 AND tenant_id = $2',
            [userId, tenantId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        const user = result.rows[0];
        const isMatch = await bcrypt.compare(currentPassword, user.password);

        if (!isMatch) {
            return res.status(403).json({ error: 'La contraseña actual es incorrecta' });
        }

        const hashedNewPassword = await bcrypt.hash(newPassword, 12);
        await pool.query(
            'UPDATE users SET password = $1 WHERE id = $2 AND tenant_id = $3',
            [hashedNewPassword, userId, tenantId]
        );

        res.status(200).json({ success: true, message: 'Contraseña actualizada' });
    } catch (err) {
        console.error('❌ Error al cambiar contraseña:', err);
        res.status(500).json({ error: 'No se pudo actualizar la contraseña' });
    }
});

// 🖼️ SUBIR AVATAR DE USUARIO
router.post('/user/avatar', authenticateToken, uploadAvatar.single('avatar'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No se ha subido ningún archivo.' });
        }

        const avatarUrl = `/uploads/${req.file.filename}`;
        const { userId, tenantId } = req;

        const result = await pool.query(
            'UPDATE users SET avatar_url = $1 WHERE id = $2 AND tenant_id = $3',
            [avatarUrl, userId, tenantId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        res.status(200).json({
            success: true,
            message: 'Avatar actualizado correctamente.',
            avatar_url: avatarUrl
        });
    } catch (err) {
        console.error('❌ Error al actualizar avatar:', err);
        res.status(500).json({ error: 'No se pudo actualizar la imagen de perfil.' });
    }
});

// ======================================================
// ===     DEFINICIÓN DE RUTAS DE NOTIFICACIONES      ===
// ======================================================

// 🔔 OBTENER NOTIFICACIONES DEL USUARIO (filtrado por tenant)
router.get('/notifications', authenticateToken, async (req, res) => {
    try {
        const { userId, tenantId } = req;

        const result = await pool.query(
            `SELECT *, leida as is_read FROM notifications 
       WHERE usuario_id = $1 AND (tenant_id = $2 OR tenant_id IS NULL)
       ORDER BY fecha_creacion DESC`,
            [userId, tenantId]
        );

        res.json(result.rows || []);
    } catch (err) {
        console.error('❌ Error al obtener notificaciones:', err);
        res.status(500).json({ error: 'Error al obtener notificaciones' });
    }
});

// 🔔 MARCAR UNA NOTIFICACIÓN COMO LEÍDA
router.put('/notifications/:id/read', authenticateToken, async (req, res) => {
    try {
        const notificationId = req.params.id;
        const { userId, tenantId } = req;

        const result = await pool.query(
            'UPDATE notifications SET leida = true WHERE id = $1 AND usuario_id = $2 AND tenant_id = $3',
            [notificationId, userId, tenantId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Notificación no encontrada o sin permisos' });
        }

        res.status(200).json({ success: true });
    } catch (err) {
        console.error('❌ Error al marcar notificación:', err);
        res.status(500).json({ error: 'Error al actualizar la notificación' });
    }
});

// 🔔 MARCAR TODAS LAS NOTIFICACIONES COMO LEÍDAS
router.put('/notifications/read-all', authenticateToken, async (req, res) => {
    try {
        const { userId, tenantId } = req;

        const result = await pool.query(
            'UPDATE notifications SET leida = true WHERE usuario_id = $1 AND tenant_id = $2 AND leida = false',
            [userId, tenantId]
        );

        res.status(200).json({ success: true, changes: result.rowCount });
    } catch (err) {
        console.error('❌ Error al marcar notificaciones:', err);
        res.status(500).json({ error: 'Error al actualizar las notificaciones' });
    }
});

// 🔔 ELIMINAR UNA NOTIFICACIÓN
router.delete('/notifications/:id', authenticateToken, async (req, res) => {
    try {
        const notificationId = req.params.id;
        const { userId, tenantId } = req;

        const result = await pool.query(
            'DELETE FROM notifications WHERE id = $1 AND usuario_id = $2 AND tenant_id = $3',
            [notificationId, userId, tenantId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Notificación no encontrada o sin permisos' });
        }

        res.status(200).json({ success: true });
    } catch (err) {
        console.error('❌ Error al eliminar notificación:', err);
        res.status(500).json({ error: 'Error al eliminar la notificación' });
    }
});

module.exports = router;
