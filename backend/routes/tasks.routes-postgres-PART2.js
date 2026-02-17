// backend/routes/tasks.routes-postgres-PART2.js
// PostgreSQL version - Comments, Attachments, Downloads
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { body, validationResult } = require('express-validator');
const pool = require('../db-postgres');
const { authenticateToken } = require('../middleware/auth');
const { broadcast } = require('../services/websocket.service');

const jsonParser = express.json({ limit: '10mb' });

// Multer configuration
const uploadsDir = process.env.RENDER_UPLOADS_PATH || path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const originalName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        cb(null, uniqueSuffix + '-' + originalName);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedMimes = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'application/pdf', 'text/plain',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Tipo de archivo no permitido'), false);
    }
};

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: fileFilter
});

// ======================================================
// ===             COMMENTS                           ===
// ======================================================

// 💬 GET COMMENTS FOR A TASK
router.get('/tasks/:id/comments', authenticateToken, async (req, res) => {
    try {
        const taskId = req.params.id;
        const { tenantId } = req;

        // Verify task belongs to tenant
        const taskCheck = await pool.query(
            'SELECT id FROM tasks WHERE id = $1 AND tenant_id = $2',
            [taskId, tenantId]
        );

        if (taskCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Tarea no encontrada' });
        }

        // Get comments with user info and attachments
        // FIX: Alias 'comment' as 'contenido' for frontend compatibility
        const sql = `
      SELECT 
        c.id,
        c.comment as contenido,
        c.comment,
        c.created_at,
        c.created_at as fecha_creacion,
        u.id as user_id,
        u.name as user_name,
        u.name as autor_nombre,
        u.avatar_url,
        json_agg(
          DISTINCT jsonb_build_object(
            'id', a.id,
            'file_name', a.file_name,
            'file_path', a.file_path,
            'uploaded_at', a.uploaded_at
          )
        ) FILTER (WHERE a.id IS NOT NULL) as attachments
      FROM comments c
      JOIN users u ON c.user_id = u.id
      LEFT JOIN attachments a ON c.id = a.comment_id
      WHERE c.task_id = $1
      GROUP BY c.id, u.id, u.name, u.avatar_url, c.created_at
      ORDER BY c.created_at ASC
    `;

        const result = await pool.query(sql, [taskId]);

        // Process attachments
        result.rows.forEach(comment => {
            if (!comment.attachments || comment.attachments[0] === null) {
                comment.attachments = [];
            }
        });

        res.json(result.rows);
    } catch (err) {
        console.error('❌ Error al obtener comentarios:', err);
        res.status(500).json({ error: 'Error al obtener comentarios' });
    }
});

// 📎 GET ATTACHMENTS FOR A TASK (Separate endpoint)
router.get('/attachments/task/:taskId', authenticateToken, async (req, res) => {
    try {
        const { taskId } = req.params;
        const { tenantId } = req;

        // Verify task belongs to tenant
        const taskCheck = await pool.query(
            'SELECT id FROM tasks WHERE id = $1 AND tenant_id = $2',
            [taskId, tenantId]
        );

        if (taskCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Tarea no encontrada' });
        }

        const result = await pool.query(`
            SELECT id, file_name, file_path, uploaded_at, user_id
            FROM attachments
            WHERE task_id = $1 AND comment_id IS NULL
            ORDER BY uploaded_at DESC
        `, [taskId]);

        res.json(result.rows);
    } catch (err) {
        console.error('❌ Error al obtener adjuntos:', err);
        res.status(500).json({ error: 'Error al obtener adjuntos' });
    }
});

// 💬 ADD COMMENT (with optional attachments)
// Frontend sends 'attachments' not 'files'
router.post('/tasks/comments', upload.array('attachments', 5), authenticateToken, async (req, res) => {
    const client = await pool.connect();

    try {
        // Frontend sends 'contenido' instead of 'comment'
        const { task_id, contenido, comment: commentAlt } = req.body;
        const comment = contenido || commentAlt;

        const userId = req.userId;
        const { tenantId } = req;

        if (!task_id || !comment) {
            return res.status(400).json({ error: 'task_id y comment (o contenido) son requeridos' });
        }

        // Verify task belongs to tenant
        const taskCheck = await client.query(
            'SELECT id, title FROM tasks WHERE id = $1 AND tenant_id = $2',
            [task_id, tenantId]
        );

        if (taskCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Tarea no encontrada' });
        }

        await client.query('BEGIN');

        // 1. Insert comment
        const commentResult = await client.query(`
      INSERT INTO comments (task_id, user_id, comment)
      VALUES ($1, $2, $3)
      RETURNING id, created_at
    `, [task_id, userId, comment]);

        const newComment = commentResult.rows[0];

        // 2. Insert attachments if any
        const attachments = [];
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                const attResult = await client.query(`
          INSERT INTO attachments (task_id, comment_id, user_id, file_name, file_path)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id, file_name, file_path, uploaded_at
        `, [task_id, newComment.id, userId, file.originalname, file.filename]);

                attachments.push(attResult.rows[0]);
            }
        }

        // 3. Create notifications for task participants (except commenter)
        const participantsSql = `
      SELECT DISTINCT u.id, u.email_notifications
      FROM users u
      WHERE u.tenant_id = $1
        AND u.id != $2
        AND (
          u.id = (SELECT created_by FROM tasks WHERE id = $3)
          OR u.id = (SELECT responsible_user_id FROM tasks WHERE id = $3)
          OR u.id IN (SELECT user_id FROM task_assignments WHERE task_id = $3)
        )
    `;

        const participants = await client.query(participantsSql, [tenantId, userId, task_id]);

        const userName = req.user.name;
        const taskTitle = taskCheck.rows[0].title;

        for (const participant of participants.rows) {
            const mensaje = `${userName} comentó en "${taskTitle.substring(0, 30)}..."`;
            // FIX: Use 'tenant_id' and correct column names based on schema
            await client.query(
                'INSERT INTO notifications (tenant_id, usuario_id, mensaje, tipo, task_id) VALUES ($1, $2, $3, $4, $5)',
                [tenantId, participant.id, mensaje, 'comment', task_id]
            );
        }

        await client.query('COMMIT');

        res.status(201).json({
            success: true,
            comment: {
                id: newComment.id,
                task_id: parseInt(task_id),
                user_id: userId,
                user_name: userName,
                comment: comment,
                created_at: newComment.created_at,
                attachments: attachments
            }
        });

        broadcast({ type: 'TASKS_UPDATED' });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Error al crear comentario:', err);

        // Clean up uploaded files if DB insert failed
        if (req.files) {
            req.files.forEach(file => {
                const filePath = path.join(uploadsDir, file.filename);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            });
        }

        res.status(500).json({ error: 'Error al crear el comentario' });
    } finally {
        client.release();
    }
});

// 🔄 UPDATE TASK STATUS
router.put('/tasks/:id/status', authenticateToken, async (req, res) => {
    try {
        const taskId = req.params.id;
        const { status } = req.body;
        const { userId, tenantId } = req;

        if (!['pendiente', 'en_camino', 'completada'].includes(status)) {
            return res.status(400).json({ error: 'Estado inválido' });
        }

        // Verify task exists and belongs to tenant
        const taskCheck = await pool.query(
            'SELECT * FROM tasks WHERE id = $1 AND tenant_id = $2',
            [taskId, tenantId]
        );

        if (taskCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Tarea no encontrada' });
        }

        const task = taskCheck.rows[0];
        let completedAt = null;
        if (status === 'completada') {
            completedAt = new Date();
        }

        // Update status
        await pool.query(
            'UPDATE tasks SET status = $1, completed_at = $2 WHERE id = $3',
            [status, completedAt, taskId]
        );

        // Create notification for creator if someone else changes status
        if (task.created_by !== userId) {
            await pool.query(
                'INSERT INTO notifications (tenant_id, usuario_id, mensaje, tipo, task_id) VALUES ($1, $2, $3, $4, $5)',
                [tenantId, task.created_by, `Estado actualizado a: ${status.toUpperCase()}`, 'status', taskId]
            );
        }

        res.json({ success: true, status, completed_at: completedAt });
        broadcast({ type: 'TASKS_UPDATED' });

    } catch (err) {
        console.error('❌ Error al actualizar estado:', err);
        res.status(500).json({ error: 'Error al actualizar estado' });
    }
});

// ✅ COMPLETE TASK (Legacy/Alternative endpoint)
router.post('/tasks/:id/complete', authenticateToken, async (req, res) => {
    try {
        const taskId = req.params.id;
        const { tenantId, userId } = req;
        const completedAt = new Date();

        // Update status
        const result = await pool.query(
            'UPDATE tasks SET status = $1, completed_at = $2 WHERE id = $3 AND tenant_id = $4 RETURNING *',
            ['completada', completedAt, taskId, tenantId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Tarea no encontrada' });
        }

        const task = result.rows[0];

        // Create notification for creator if someone else completes it
        if (task.created_by !== userId) {
            await pool.query(
                'INSERT INTO notifications (tenant_id, usuario_id, mensaje, tipo, task_id) VALUES ($1, $2, $3, $4, $5)',
                [tenantId, task.created_by, `Tarea completada`, 'status', taskId]
            );
        }

        res.json({ success: true, status: 'completada', completed_at: completedAt });
        broadcast({ type: 'TASKS_UPDATED' });

    } catch (err) {
        console.error('❌ Error al completar tarea:', err);
        res.status(500).json({ error: 'Error al completar tarea' });
    }
});

// 📅 CHECK DUE TASKS (background check triggered by frontend)
router.post('/tasks/check-due-today', authenticateToken, async (req, res) => {
    // This is optional if we have a background job, but useful for immediate frontend trigger
    res.json({ success: true, message: 'Verificación de vencimientos iniciada (simulado)' });
});

// ======================================================
// ===             FILE ATTACHMENTS                   ===
// ======================================================

// 📎 UPLOAD FILES TO TASK (without comment)
router.post('/upload', upload.array('files', 10), authenticateToken, async (req, res) => {
    const client = await pool.connect();

    try {
        const { task_id } = req.body;
        const userId = req.userId;
        const { tenantId } = req;

        if (!task_id) {
            return res.status(400).json({ error: 'task_id es requerido' });
        }

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No se recibieron archivos' });
        }

        // Verify task belongs to tenant
        const taskCheck = await client.query(
            'SELECT id FROM tasks WHERE id = $1 AND tenant_id = $2',
            [task_id, tenantId]
        );

        if (taskCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Tarea no encontrada' });
        }

        const attachments = [];

        for (const file of req.files) {
            const result = await client.query(`
        INSERT INTO attachments (task_id, user_id, file_name, file_path)
        VALUES ($1, $2, $3, $4)
        RETURNING id, file_name, file_path, uploaded_at
      `, [task_id, userId, file.originalname, file.filename]);

            attachments.push(result.rows[0]);
        }

        res.status(201).json({
            success: true,
            attachments: attachments
        });

        broadcast({ type: 'TASKS_UPDATED' });

    } catch (err) {
        console.error('❌ Error al subir archivos:', err);

        // Clean up uploaded files
        if (req.files) {
            req.files.forEach(file => {
                const filePath = path.join(uploadsDir, file.filename);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            });
        }

        res.status(500).json({ error: 'Error al subir los archivos' });
    } finally {
        client.release();
    }
});

// 📥 DOWNLOAD FILE
router.get('/download/:filename', authenticateToken, async (req, res) => {
    try {
        const { filename } = req.params;
        const { userId, tenantId } = req;

        // Get attachment info
        const result = await pool.query(`
      SELECT a.*, t.tenant_id
      FROM attachments a
      JOIN tasks t ON a.task_id = t.id
      WHERE a.file_path = $1
    `, [filename]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Archivo no encontrado' });
        }

        const attachment = result.rows[0];

        // Verify tenant access
        if (attachment.tenant_id !== tenantId) {
            return res.status(403).json({ error: 'No tienes permiso para acceder a este archivo' });
        }

        const filePath = path.join(uploadsDir, filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Archivo no encontrado en el sistema' });
        }

        // Set headers for download
        res.setHeader('Content-Disposition', `attachment; filename="${attachment.file_name}"`);
        res.setHeader('Content-Type', 'application/octet-stream');

        // Stream file
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);

    } catch (err) {
        console.error('❌ Error al descargar archivo:', err);
        res.status(500).json({ error: 'Error al descargar el archivo' });
    }
});

// 🗑️ DELETE ATTACHMENT
router.delete('/attachment/:id', authenticateToken, async (req, res) => {
    const client = await pool.connect();

    try {
        const attachmentId = req.params.id;
        const { userId, tenantId } = req;
        const userRole = req.user.role;

        // Get attachment info with task details
        const result = await client.query(`
      SELECT a.*, t.created_by, t.responsible_user_id, t.tenant_id,
             array_agg(ta.user_id) FILTER (WHERE ta.user_id IS NOT NULL) as assigned_ids
      FROM attachments a
      JOIN tasks t ON a.task_id = t.id
      LEFT JOIN task_assignments ta ON t.id = ta.task_id
      WHERE a.id = $1
      GROUP BY a.id, t.created_by, t.responsible_user_id, t.tenant_id
    `, [attachmentId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Adjunto no encontrado' });
        }

        const attachment = result.rows[0];

        // Verify tenant
        if (attachment.tenant_id !== tenantId) {
            return res.status(403).json({ error: 'No tienes permiso' });
        }

        // Permission check: admin, uploader, task creator, responsible, or assigned
        const isAdmin = userRole === 'admin';
        const isUploader = attachment.user_id === userId;
        const isCreator = attachment.created_by === userId;
        const isResponsible = attachment.responsible_user_id === userId;
        const isAssigned = attachment.assigned_ids && attachment.assigned_ids.includes(userId);

        if (!isAdmin && !isUploader && !isCreator && !isResponsible && !isAssigned) {
            return res.status(403).json({ error: 'No tienes permiso para eliminar este adjunto' });
        }

        // Delete from database
        await client.query('DELETE FROM attachments WHERE id = $1', [attachmentId]);

        // Delete physical file
        const filePath = path.join(uploadsDir, attachment.file_path);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        res.status(200).json({ success: true, message: 'Adjunto eliminado' });
        broadcast({ type: 'TASKS_UPDATED' });

    } catch (err) {
        console.error('❌ Error al eliminar adjunto:', err);
        res.status(500).json({ error: 'Error al eliminar el adjunto' });
    } finally {
        client.release();
    }
});

module.exports = router;
