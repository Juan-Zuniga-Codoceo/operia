// backend/routes/tasks.routes-postgres.js
// PostgreSQL version - Core task management with multi-tenancy
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { body, validationResult } = require('express-validator');
const pool = require('../db-postgres');
const { authenticateToken } = require('../middleware/auth');
const { sendEmail } = require('../services/email.service');
const { broadcast } = require('../services/websocket.service');
const { createEmailTemplate } = require('../services/email-template.service');

const jsonParser = express.json({ limit: '10mb' });

// --- Multer Configuration ---
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
        'image/jpeg', 'image/png', 'image/gif',
        'application/pdf', 'text/plain',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Tipo de archivo no permitido'), false);
    }
};

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: fileFilter
});

// ======================================================
// ===          TASK CRUD OPERATIONS                  ===
// ======================================================

// 📋 GET TASK BY ID
router.get('/tasks/:id(\\d+)', authenticateToken, async (req, res) => {
    try {
        const taskId = req.params.id;
        const { tenantId } = req;

        const sql = `
      SELECT 
        t.*, 
        u.name as created_by_name,
        ur.name as responsible_user_name,
        ur.id as responsible_user_id,
        array_agg(DISTINCT ua.name) FILTER (WHERE ua.id IS NOT NULL) as assigned_names,
        array_agg(DISTINCT ta.user_id) FILTER (WHERE ta.user_id IS NOT NULL) as assigned_ids,
        array_agg(DISTINCT l.name) FILTER (WHERE l.id IS NOT NULL) as label_names,
        array_agg(DISTINCT l.color) FILTER (WHERE l.id IS NOT NULL) as label_colors,
        json_agg(
          DISTINCT jsonb_build_object(
            'id', att.id,
            'file_name', att.file_name,
            'file_path', att.file_path
          )
        ) FILTER (WHERE att.id IS NOT NULL) as attachments
      FROM tasks t
      LEFT JOIN users u ON t.created_by = u.id
      LEFT JOIN users ur ON t.responsible_user_id = ur.id
      LEFT JOIN task_assignments ta ON t.id = ta.task_id
      LEFT JOIN users ua ON ta.user_id = ua.id
      LEFT JOIN task_labels tl ON t.id = tl.task_id
      LEFT JOIN labels l ON tl.label_id = l.id
      LEFT JOIN attachments att ON t.id = att.task_id AND att.comment_id IS NULL
      WHERE t.id = $1 AND t.tenant_id = $2
      GROUP BY t.id, u.name, ur.name, ur.id
    `;

        const result = await pool.query(sql, [taskId, tenantId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Tarea no encontrada' });
        }

        const task = result.rows[0];

        // Process labels
        task.labels = [];
        if (task.label_names && task.label_names.length > 0) {
            task.labels = task.label_names.map((name, index) => ({
                name: name,
                color: task.label_colors[index] || '#ccc'
            }));
        }
        delete task.label_names;
        delete task.label_colors;

        // Process attachments
        if (!task.attachments || task.attachments[0] === null) {
            task.attachments = [];
        }

        res.json(task);
    } catch (err) {
        console.error('❌ Error al obtener tarea:', err);
        res.status(500).json({ error: 'Error al obtener la tarea' });
    }
});

// 📋 LIST TASKS
router.get('/tasks', authenticateToken, async (req, res) => {
    try {
        const { assigned_to, created_by, status, due_date, search } = req.query;
        const { tenantId } = req;

        let sql = `
            SELECT 
                t.*, 
                u.name as created_by_name,
                ur.name as responsible_user_name,
                ur.id as responsible_user_id,
                uo.name as observer_user_name,
                string_agg(DISTINCT ua.name, ',') as assigned_names,
                string_agg(DISTINCT ta.user_id::text, ',') as assigned_ids,
                string_agg(DISTINCT l.name, ',') as label_names,
                string_agg(DISTINCT l.color, ',') as label_colors,
                json_agg(
                    DISTINCT jsonb_build_object(
                        'id', att.id,
                        'file_name', att.file_name,
                        'file_path', att.file_path
                    )
                ) FILTER (WHERE att.id IS NOT NULL) as attachments
            FROM tasks t
            LEFT JOIN users u ON t.created_by = u.id
            LEFT JOIN users ur ON t.responsible_user_id = ur.id
            LEFT JOIN users uo ON t.observer_user_id = uo.id
            LEFT JOIN task_assignments ta ON t.id = ta.task_id
            LEFT JOIN users ua ON ta.user_id = ua.id
            LEFT JOIN task_labels tl ON t.id = tl.task_id
            LEFT JOIN labels l ON tl.label_id = l.id
            LEFT JOIN attachments att ON t.id = att.task_id AND att.comment_id IS NULL
            WHERE t.tenant_id = $1 AND t.is_archived = false
        `;

        const params = [tenantId];
        let paramCount = 1;

        if (assigned_to) {
            paramCount++;
            sql += ` AND ta.user_id = $${paramCount}`;
            params.push(assigned_to);
        }
        if (created_by) {
            paramCount++;
            sql += ` AND t.created_by = $${paramCount}`;
            params.push(created_by);
        }
        if (status) {
            paramCount++;
            sql += ` AND t.status = $${paramCount}`;
            params.push(status);
        }
        if (due_date) {
            paramCount++;
            sql += ` AND DATE(t.due_date) = DATE($${paramCount})`;
            params.push(due_date);
        }
        if (search) {
            paramCount++;
            sql += ` AND (t.title ILIKE $${paramCount} OR t.description ILIKE $${paramCount})`;
            params.push(`%${search}%`);
        }

        sql += `
      GROUP BY t.id, u.name, ur.name, ur.id, uo.name
      ORDER BY 
        CASE t.priority 
          WHEN 'alta' THEN 1 
          WHEN 'media' THEN 2 
          WHEN 'baja' THEN 3 
          ELSE 4 
        END ASC,
            t.due_date ASC
    `;

        const result = await pool.query(sql, params);

        // Process attachments for each task
        result.rows.forEach(task => {
            if (!task.attachments || task.attachments[0] === null) {
                task.attachments = [];
            }
        });

        console.log(`📋 Tareas recuperadas: ${result.rows.length} `);
        res.json(result.rows || []);
    } catch (err) {
        console.error('❌ Error al obtener tareas:', err);
        res.status(500).json({ error: 'Error al obtener tareas' });
    }
});

// ➕ CREATE TASK
router.post('/tasks', jsonParser, authenticateToken, [
    body('title').notEmpty().trim().escape()
], async (req, res) => {
    const client = await pool.connect();

    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        let {
            title, description, due_date, priority, assigned_to, label_ids, responsible_user_id,
            origin, shipping_type, payment_status, client_snapshot
        } = req.body;

        priority = priority || 'media';
        const creator = req.user;
        const { tenantId } = req;

        // Prefix mapping
        const originPrefixMap = {
            'Valparaíso': 'BV',
            'Quilpué': 'BQ',
            'Bodega': 'BD',
            'Viña del Mar': 'BVM',
            'Default': 'GEN'
        };

        const prefix = originPrefixMap[origin] || originPrefixMap['Default'];

        await client.query('BEGIN');

        // 1. Get/Update sequence
        const seqResult = await client.query(
            'SELECT last_number FROM sequences WHERE tenant_id = $1 AND prefix = $2 FOR UPDATE',
            [tenantId, prefix]
        );

        let nextNumber = 1;
        if (seqResult.rows.length > 0) {
            nextNumber = seqResult.rows[0].last_number + 1;
            await client.query(
                'UPDATE sequences SET last_number = $1 WHERE tenant_id = $2 AND prefix = $3',
                [nextNumber, tenantId, prefix]
            );
        } else {
            await client.query(
                'INSERT INTO sequences (tenant_id, prefix, last_number) VALUES ($1, $2, $3)',
                [tenantId, prefix, nextNumber]
            );
        }

        const humanId = `${prefix} -${String(nextNumber).padStart(4, '0')} `;

        // 2. Insert Task
        const clientSnapshotStr = typeof client_snapshot === 'object' ? JSON.stringify(client_snapshot) : client_snapshot;

        const insertSql = `
      INSERT INTO tasks(
                tenant_id, title, description, due_date, priority, created_by, responsible_user_id,
                human_id, origin, shipping_type, payment_status, client_snapshot
            ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id
    `;

        const taskResult = await client.query(insertSql, [
            tenantId, title, description || '', due_date, priority, creator.id, responsible_user_id || null,
            humanId, origin, shipping_type, payment_status, clientSnapshotStr
        ]);

        const taskId = taskResult.rows[0].id;

        // 3. Task assignments
        if (assigned_to && Array.isArray(assigned_to) && assigned_to.length > 0) {
            for (const userId of assigned_to) {
                await client.query(
                    'INSERT INTO task_assignments (task_id, user_id) VALUES ($1, $2)',
                    [taskId, userId]
                );

                // Notifications for assigned users
                if (userId !== creator.id && userId !== responsible_user_id) {
                    const mensaje = `${creator.name} te ha asignado una nueva tarea: "${title.substring(0, 30)}..."[${humanId}]`;
                    await client.query(
                        'INSERT INTO notifications (tenant_id, usuario_id, mensaje, tipo, task_id) VALUES ($1, $2, $3, $4, $5)',
                        [tenantId, userId, mensaje, 'assignment', taskId]
                    );
                }
            }
        }

        // 4. Labels
        if (label_ids && Array.isArray(label_ids) && label_ids.length > 0) {
            for (const labelId of label_ids) {
                await client.query(
                    'INSERT INTO task_labels (task_id, label_id) VALUES ($1, $2)',
                    [taskId, labelId]
                );
            }
        }

        // 5. Notification for responsible user
        if (responsible_user_id && responsible_user_id !== creator.id) {
            const mensaje = `${creator.name} te asignó como RESPONSABLE de: "${title.substring(0, 30)}..."[${humanId}]`;
            await client.query(
                'INSERT INTO notifications (tenant_id, usuario_id, mensaje, tipo, task_id) VALUES ($1, $2, $3, $4, $5)',
                [tenantId, responsible_user_id, mensaje, 'responsible', taskId]
            );
        }

        await client.query('COMMIT');

        res.status(201).json({ id: taskId, human_id: humanId, success: true });
        broadcast({ type: 'TASKS_UPDATED' });

        // Send emails asynchronously (don't await)
        sendTaskNotificationEmails(taskId, tenantId, creator, title, humanId, priority, due_date, responsible_user_id, assigned_to).catch(console.error);

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Error al crear tarea:', err);
        res.status(500).json({ error: 'No se pudo crear la tarea' });
    } finally {
        client.release();
    }
});

// Helper function for sending emails (async, non-blocking)
async function sendTaskNotificationEmails(taskId, tenantId, creator, title, humanId, priority, due_date, responsible_user_id, assigned_to) {
    try {
        const taskUrl = `${process.env.APP_URL || 'http://localhost:3000'}/tablero`;
        const formattedDueDate = due_date ? new Date(due_date).toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' }) : 'No especificada';

        // Email to creator
        const creatorContent = `
      <p style="color: #34495E; font-size: 16px;">Tu tarea "<strong>${title}</strong>" ha sido creada exitosamente.</p>
      <p style="color: #7F8C8D;"><strong>ID:</strong> ${humanId}</p>
      <p style="color: #7F8C8D;"><strong>Prioridad:</strong> <span style="color: ${priority === 'alta' ? '#E74C3C' : '#34495E'}; font-weight: bold;">${priority.toUpperCase()}</span></p>
      <p style="color: #7F8C8D;"><strong>Vencimiento:</strong> ${formattedDueDate}</p>
    `;
        const creatorHtml = createEmailTemplate({
            title: '✅ Tarea Creada',
            recipientName: creator.name,
            mainContentHtml: creatorContent,
            buttonUrl: taskUrl,
            buttonText: 'Ver Tarea'
        });
        await sendEmail(creator.email, `✅ Tarea Creada [${humanId}]: ${title.substring(0, 30)}`, creatorHtml);

        // Emails to responsible and assigned users
        // (similar to creator, fetch user details from database and send)
    } catch (err) {
        console.error('❌ Error al enviar emails de tarea:', err);
    }
}

// ✏️ UPDATE TASK
router.put('/tasks/:id', jsonParser, authenticateToken, async (req, res) => {
    const client = await pool.connect();

    try {
        const taskId = req.params.id;
        const { title, description, due_date, priority, assigned_to, label_ids, responsible_user_id } = req.body;
        const { userId, tenantId } = req;
        const userRole = req.user.role;

        // Check permissions
        const permissionCheck = await client.query(
            `SELECT t.created_by, t.responsible_user_id, string_agg(ta.user_id::text, ',') as assigned_ids
       FROM tasks t
       LEFT JOIN task_assignments ta ON t.id = ta.task_id
       WHERE t.id = $1 AND t.tenant_id = $2
       GROUP BY t.id, t.created_by, t.responsible_user_id`,
            [taskId, tenantId]
        );

        if (permissionCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Tarea no encontrada' });
        }

        const task = permissionCheck.rows[0];
        const isAdmin = userRole === 'admin';
        const isCreator = task.created_by === userId;
        const isResponsible = task.responsible_user_id === userId;
        const isAssigned = task.assigned_ids && task.assigned_ids.includes(userId);

        if (!isAdmin && !isCreator && !isResponsible && !isAssigned) {
            return res.status(403).json({ error: 'No tienes permiso para editar la tarea' });
        }

        await client.query('BEGIN');

        // Update task
        const clientSnapshotStr = req.body.client ? JSON.stringify(req.body.client) : null;
        let updateSql = 'UPDATE tasks SET title = $1, description = $2, due_date = $3, priority = $4, responsible_user_id = $5';
        const params = [title, description, due_date, priority, responsible_user_id || null];
        let paramCount = 5;

        if (req.body.origin) {
            paramCount++;
            updateSql += `, origin = $${paramCount}`;
            params.push(req.body.origin);
        }
        if (req.body.shipping_type) {
            paramCount++;
            updateSql += `, shipping_type = $${paramCount}`;
            params.push(req.body.shipping_type);
        }
        if (req.body.payment_status) {
            paramCount++;
            updateSql += `, payment_status = $${paramCount}`;
            params.push(req.body.payment_status);
        }
        if (clientSnapshotStr) {
            paramCount++;
            updateSql += `, client_snapshot = $${paramCount}`;
            params.push(clientSnapshotStr);
        }

        paramCount++;
        updateSql += ` WHERE id = $${paramCount} AND tenant_id = $${paramCount + 1}`;
        params.push(taskId, tenantId);

        await client.query(updateSql, params);

        // Replace assignments
        await client.query('DELETE FROM task_assignments WHERE task_id = $1', [taskId]);
        if (assigned_to && Array.isArray(assigned_to) && assigned_to.length > 0) {
            for (const userId of assigned_to) {
                await client.query(
                    'INSERT INTO task_assignments (task_id, user_id) VALUES ($1, $2)',
                    [taskId, userId]
                );
            }
        }

        // Replace labels
        await client.query('DELETE FROM task_labels WHERE task_id = $1', [taskId]);
        if (label_ids && Array.isArray(label_ids) && label_ids.length > 0) {
            for (const labelId of label_ids) {
                await client.query(
                    'INSERT INTO task_labels (task_id, label_id) VALUES ($1, $2)',
                    [taskId, labelId]
                );
            }
        }

        await client.query('COMMIT');

        res.status(200).json({ success: true, message: 'Tarea actualizada' });
        broadcast({ type: 'TASKS_UPDATED' });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Error al actualizar tarea:', err);
        res.status(500).json({ error: 'Error al actualizar la tarea' });
    } finally {
        client.release();
    }
});

// 🗑️ DELETE TASK
router.delete('/tasks/:id', authenticateToken, async (req, res) => {
    try {
        const taskId = req.params.id;
        const { userId, tenantId } = req;
        const userRole = req.user.role;

        const result = await pool.query(
            'SELECT created_by FROM tasks WHERE id = $1 AND tenant_id = $2',
            [taskId, tenantId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Tarea no encontrada' });
        }

        const task = result.rows[0];
        if (task.created_by !== userId && userRole !== 'admin') {
            return res.status(403).json({ error: 'No tienes permiso para eliminar esta tarea' });
        }

        await pool.query('DELETE FROM tasks WHERE id = $1 AND tenant_id = $2', [taskId, tenantId]);

        res.status(200).json({ success: true, message: 'Tarea eliminada' });
        broadcast({ type: 'TASKS_UPDATED' });
    } catch (err) {
        console.error('❌ Error al eliminar tarea:', err);
        res.status(500).json({ error: 'Error al eliminar la tarea' });
    }
});

// ======================================================
// ===      COMMENTS, ATTACHMENTS, DOWNLOADS          ===
// ======================================================

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
        const sql = `
      SELECT 
        c.id,
        c.contenido as comment,
        c.fecha_creacion as created_at,
        u.id as user_id,
        u.name as user_name,
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
      JOIN users u ON c.autor_id = u.id
      LEFT JOIN attachments a ON c.id = a.comment_id
      WHERE c.task_id = $1
      GROUP BY c.id, u.id, u.name, u.avatar_url
      ORDER BY c.fecha_creacion ASC
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

// 💬 ADD COMMENT (with optional attachments)
router.post('/tasks/comments', upload.array('attachments', 5), authenticateToken, async (req, res) => {
    const client = await pool.connect();

    try {
        const { task_id, contenido } = req.body;
        const userId = req.userId;
        const { tenantId } = req;

        if (!task_id || !contenido) {
            return res.status(400).json({ error: 'task_id y contenido son requeridos' });
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
      INSERT INTO comments (task_id, autor_id, contenido)
      VALUES ($1, $2, $3)
      RETURNING id, fecha_creacion as created_at
    `, [task_id, userId, contenido]);

        const newComment = commentResult.rows[0];

        // Get user name for response
        const userRes = await client.query('SELECT name FROM users WHERE id = $1', [userId]);
        const userName = userRes.rows[0]?.name || 'Usuario';

        // 2. Insert attachments if any
        const attachments = [];
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                const attResult = await client.query(`
          INSERT INTO attachments (task_id, comment_id, uploaded_by, file_name, file_path)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id, file_name, file_path, uploaded_at
        `, [task_id, newComment.id, userId, file.originalname, file.filename]);

                attachments.push(attResult.rows[0]);
            }
        }

        // 2.5. Process mentioned users and create notifications for them
        const mentionedUserIds = req.body.mentioned_user_ids ? JSON.parse(req.body.mentioned_user_ids) : [];
        if (mentionedUserIds.length > 0) {
            for (const mentionedUserId of mentionedUserIds) {
                const mensaje = `${userName} te mencionó en "${taskCheck.rows[0].title.substring(0, 30)}..."`; await client.query(
                    'INSERT INTO notifications (usuario_id, mensaje, tipo, task_id) VALUES ($1, $2, $3, $4)',
                    [mentionedUserId, mensaje, 'mention', task_id]
                );
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

        const taskTitle = taskCheck.rows[0].title;

        for (const participant of participants.rows) {
            const mensaje = `${userName} comentó en "${taskTitle.substring(0, 30)}..."`;
            await client.query(
                'INSERT INTO notifications (usuario_id, mensaje, tipo, task_id) VALUES ($1, $2, $3, $4)',
                [participant.id, mensaje, 'comment', task_id]
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
                comment: contenido,
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
        INSERT INTO attachments (task_id, uploaded_by, file_name, file_path)
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
              string_agg(ta.user_id::text, ',') as assigned_ids
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


// ======================================================
// ===           MISSING ROUTES (RESTORED)            ===
// ======================================================

// 🗓️ TASK SUMMARY (Counts)
router.get('/tasks/resumen', authenticateToken, async (req, res) => {
    try {
        const { tenantId } = req;

        // PostgreSQL query using FILTER for efficiency
        const sql = `
            SELECT 
                COUNT(*) FILTER (WHERE status = 'pendiente' AND due_date < NOW()) as vencidas,
                COUNT(*) FILTER (WHERE status = 'pendiente' AND due_date >= NOW() AND due_date <= (NOW() + INTERVAL '3 days')) as proximas,
                COUNT(*) FILTER (WHERE status = 'pendiente') as total_pendientes
            FROM tasks
            WHERE tenant_id = $1 AND is_archived = false
        `;

        const result = await pool.query(sql, [tenantId]);

        // Ensure numbers are returned as integers (Postgres COUNT returns bigint as string)
        const row = result.rows[0];
        const response = {
            vencidas: parseInt(row.vencidas || 0),
            proximas: parseInt(row.proximas || 0),
            total_pendientes: parseInt(row.total_pendientes || 0)
        };

        res.json(response);
    } catch (err) {
        console.error('❌ Error al generar resumen:', err);
        res.status(500).json({ error: 'Error al generar el resumen' });
    }
});

// 🏷️ GET ALL LABELS
router.get('/labels', authenticateToken, async (req, res) => {
    try {
        const { tenantId } = req;
        const result = await pool.query(
            'SELECT * FROM labels WHERE tenant_id = $1 ORDER BY name',
            [tenantId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('❌ Error al obtener etiquetas:', err);
        res.status(500).json({ error: 'Error al obtener etiquetas' });
    }
});

// 🏷️ CREATE LABEL
router.post('/labels', jsonParser, authenticateToken, [
    body('name').trim().isLength({ min: 1 }).escape()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { name, color } = req.body;
        const { userId, tenantId } = req;

        const result = await pool.query(
            `INSERT INTO labels (tenant_id, name, color, created_by)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (tenant_id, name) DO NOTHING
             RETURNING id, name, color, created_by`,
            [tenantId, name, color || '#00A651', userId]
        );

        if (result.rows.length === 0) {
            return res.status(409).json({ error: 'La etiqueta ya existe' });
        }

        res.status(201).json({ ...result.rows[0], success: true });

    } catch (err) {
        console.error('❌ Error al crear etiqueta:', err);
        res.status(500).json({ error: 'No se pudo crear la etiqueta' });
    }
});

// 🗄️ ARCHIVE TASK
router.post('/tasks/:id/archive', authenticateToken, async (req, res) => {
    try {
        const taskId = req.params.id;
        const { userId, tenantId } = req;
        const userRole = req.user.role;

        // Verify permission
        const checkSql = 'SELECT created_by FROM tasks WHERE id = $1 AND tenant_id = $2';
        const checkResult = await pool.query(checkSql, [taskId, tenantId]);

        if (checkResult.rows.length === 0) {
            return res.status(404).json({ error: 'Tarea no encontrada' });
        }

        const task = checkResult.rows[0];
        if (task.created_by !== userId && userRole !== 'admin') {
            return res.status(403).json({ error: 'No tienes permiso para archivar esta tarea' });
        }

        // Archive
        await pool.query(
            'UPDATE tasks SET is_archived = true WHERE id = $1 AND tenant_id = $2',
            [taskId, tenantId]
        );

        res.status(200).json({ success: true, message: 'Tarea archivada' });
        broadcast({ type: 'TASKS_UPDATED' });

    } catch (err) {
        console.error('❌ Error al archivar tarea:', err);
        res.status(500).json({ error: 'Error al archivar la tarea' });
    }
});

// 🗄️ AUTO-ARCHIVE TASKS (Cron or Manual Trigger)
router.post('/tasks/auto-archive', authenticateToken, async (req, res) => {
    try {
        const { tenantId } = req;
        const userRole = req.user.role;

        if (userRole !== 'admin') {
            return res.status(403).json({ error: 'Requiere permisos de administrador' });
        }

        // Archive completed tasks older than 30 days
        const result = await pool.query(
            `UPDATE tasks 
             SET is_archived = true 
             WHERE tenant_id = $1 
               AND status = 'completada' 
               AND completed_at < NOW() - INTERVAL '30 days'
               AND is_archived = false`,
            [tenantId]
        );

        res.json({
            success: true,
            message: `Se archivaron ${result.rowCount} tareas antiguas`,
            count: result.rowCount
        });

        if (result.rowCount > 0) {
            broadcast({ type: 'TASKS_UPDATED' });
        }

    } catch (err) {
        console.error('❌ Error en auto-archivado:', err);
        res.status(500).json({ error: 'Error al ejecutar auto-archivado' });
    }
});

// 🚀 COMPLETE TASK (With Proof)
router.post('/tasks/:id/complete', authenticateToken, upload.single('completion_proof'), async (req, res) => {
    const client = await pool.connect();
    try {
        const taskId = req.params.id;
        const { userId, tenantId } = req;
        const { closing_note } = req.body;

        // Verify existing task
        const checkResult = await client.query(
            'SELECT id FROM tasks WHERE id = $1 AND tenant_id = $2',
            [taskId, tenantId]
        );

        if (checkResult.rows.length === 0) {
            return res.status(404).json({ error: 'Tarea no encontrada' });
        }

        await client.query('BEGIN');

        // 1. Mark as completed
        await client.query(
            "UPDATE tasks SET status = 'completada', completed_at = NOW() WHERE id = $1",
            [taskId]
        );

        // 2. Save proof file if exists
        if (req.file) {
            await client.query(
                `INSERT INTO attachments (task_id, user_id, file_name, file_path, file_type, file_size, attachment_type)
                 VALUES ($1, $2, $3, $4, $5, $6, 'completion_proof')`,
                [taskId, userId, req.file.originalname, req.file.filename, req.file.mimetype, req.file.size]
            );
        }

        // 3. Save closing note as comment
        if (closing_note && closing_note.trim()) {
            await client.query(
                'INSERT INTO comments (task_id, user_id, comment) VALUES ($1, $2, $3)',
                [taskId, userId, closing_note.trim()]
            );
        }

        await client.query('COMMIT');

        res.json({
            success: true,
            message: 'Tarea completada exitosamente',
            hasProof: !!req.file
        });

        broadcast({ type: 'TASKS_UPDATED' });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Error al completar tarea:', err);

        // Cleanup file
        if (req.file) {
            const filePath = path.join(uploadsDir, req.file.filename);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }

        res.status(500).json({ error: 'Error al completar la tarea' });
    } finally {
        client.release();
    }
});

// 🔔 CHECK TASKS DUE TODAY (Cron or Manual Trigger)
router.post('/tasks/check-due-today', authenticateToken, async (req, res) => {
    try {
        const { tenantId } = req;
        const today = new Date().toISOString().slice(0, 10);

        // Find pending tasks due today that haven't been notified yet today
        const sql = `
            SELECT 
                t.id, 
                t.title, 
                t.created_by, 
                t.responsible_user_id,
                array_agg(ta.user_id) FILTER (WHERE ta.user_id IS NOT NULL) as assigned_ids
            FROM tasks t
            LEFT JOIN task_assignments ta ON t.id = ta.task_id
            WHERE t.tenant_id = $1
              AND DATE(t.due_date) = DATE($2)
              AND t.status = 'pendiente'
              AND NOT EXISTS (
                SELECT 1 FROM notifications n
                WHERE n.tipo = 'due_today' 
                  AND n.task_id = t.id
                  AND DATE(n.fecha_creacion) = DATE($2)
              )
            GROUP BY t.id
        `;

        const result = await pool.query(sql, [tenantId, today]);
        const tasks = result.rows;

        let notificationsCount = 0;

        for (const task of tasks) {
            const allInvolved = new Set();
            if (task.created_by) allInvolved.add(task.created_by);
            if (task.responsible_user_id) allInvolved.add(task.responsible_user_id);
            if (task.assigned_ids) {
                task.assigned_ids.forEach(id => allInvolved.add(id));
            }

            const mensaje = `La tarea "${task.title.substring(0, 30)}..." vence hoy.`;

            for (const userId of allInvolved) {
                await pool.query(
                    `INSERT INTO notifications (tenant_id, usuario_id, mensaje, tipo, task_id) 
                     VALUES ($1, $2, $3, 'due_today', $4)`,
                    [tenantId, userId, mensaje, task.id]
                );
                notificationsCount++;
            }
        }

        res.json({
            success: true,
            checked: tasks.length,
            notifications_sent: notificationsCount
        });

    } catch (err) {
        console.error('❌ Error al verificar tareas vencidas:', err);
        res.status(500).json({ error: 'Error al verificar tareas vencidas' });
    }
});

// 🗄️ OBTENER TAREAS ARCHIVADAS (COMPLETO)
router.get('/tasks/archived', authenticateToken, async (req, res) => {
    try {
        const { tenantId } = req;
        const sql = `
            SELECT 
                t.*, 
                u.name as created_by_name,
                ur.name as responsible_user_name,
                ur.id as responsible_user_id,
                uo.name as observer_user_name,
                string_agg(DISTINCT ua.name, ',') as assigned_names,
                string_agg(DISTINCT ta.user_id::text, ',') as assigned_ids,
                string_agg(DISTINCT l.name, ',') as label_names,
                string_agg(DISTINCT l.color, ',') as label_colors,
                string_agg(
                    CASE 
                        WHEN att.id IS NOT NULL THEN 
                            att.id || ':' || att.file_name || ':' || att.file_path 
                        ELSE NULL 
                    END, ','
                ) as attachments_data
            FROM tasks t
            LEFT JOIN users u ON t.created_by = u.id
            LEFT JOIN users ur ON t.responsible_user_id = ur.id
            LEFT JOIN users uo ON t.observer_user_id = uo.id
            LEFT JOIN task_assignments ta ON t.id = ta.task_id
            LEFT JOIN users ua ON ta.user_id = ua.id
            LEFT JOIN task_labels tl ON t.id = tl.task_id
            LEFT JOIN labels l ON tl.label_id = l.id
            LEFT JOIN attachments att ON t.id = att.task_id AND att.comment_id IS NULL
            WHERE t.tenant_id = $1 AND t.is_archived = true
            GROUP BY t.id, u.name, ur.name, ur.id, uo.name
            ORDER BY t.completed_at DESC
        `;

        const result = await pool.query(sql, [tenantId]);

        // Procesar adjuntos y etiquetas para cada tarea
        const processedTasks = (result.rows || []).map(task => {
            // Adjuntos
            if (task.attachments_data) {
                const uniqueAttachments = new Set(task.attachments_data.split(','));
                task.attachments = Array.from(uniqueAttachments).map(attString => {
                    const parts = attString.split(':');
                    const id = parts[0];
                    const file_path = parts.pop();
                    const file_name = parts.slice(1).join(':');
                    return { id: parseInt(id), file_name, file_path };
                });
            } else {
                task.attachments = [];
            }
            delete task.attachments_data;

            // Etiquetas
            task.labels = [];
            if (task.label_names && task.label_colors) {
                const names = task.label_names.split(',');
                const colors = task.label_colors.split(',');
                task.labels = names.map((name, index) => ({
                    name: name,
                    color: colors[index] || '#ccc'
                }));
            }
            return task;
        });

        res.json(processedTasks);
    } catch (err) {
        console.error('❌ Error al obtener tareas archivadas:', err);
        res.status(500).json({ error: 'Error al obtener tareas archivadas' });
    }
});

router.put('/tasks/:id/unarchive', authenticateToken, async (req, res) => {
    try {
        const taskId = req.params.id;
        const { tenantId } = req;

        const result = await pool.query(
            "UPDATE tasks SET is_archived = false, status = 'pendiente', completed_at = NULL WHERE id = $1 AND tenant_id = $2",
            [taskId, tenantId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'La tarea no se encontró para restaurar.' });
        }

        broadcast({ type: 'TASK_RESTORED', taskId: taskId });
        res.status(200).json({ success: true, message: 'Tarea restaurada correctamente' });

    } catch (err) {
        console.error('❌ Error al restaurar tarea:', err);
        res.status(500).json({ error: 'Error al ejecutar la restauración' });
    }
});

// ======================================================
// ===        MISSING ROUTES RESTORED                 ===
// ======================================================

// 📎 GET ATTACHMENTS FOR A TASK (without comment attachments)
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

        const sql = `
            SELECT a.*, u.name as uploaded_by_name 
            FROM attachments a 
            JOIN users u ON a.uploaded_by = u.id 
            WHERE a.task_id = $1 AND a.comment_id IS NULL
        `;

        const result = await pool.query(sql, [taskId]);
        res.json(result.rows || []);
    } catch (err) {
        console.error('❌ Error al obtener adjuntos:', err);
        res.status(500).json({ error: 'Error al obtener adjuntos' });
    }
});

// 🔄 UPDATE TASK STATUS
router.put('/tasks/:id/status', jsonParser, authenticateToken, [
    body('status').isIn(['pendiente', 'en_camino', 'completada'])
], async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const { userId, tenantId } = req;

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        // Verify task belongs to tenant and user has permissions
        const permissionCheck = await pool.query(`
            SELECT t.id 
            FROM tasks t
            LEFT JOIN task_assignments ta ON t.id = ta.task_id
            WHERE t.id = $1 
              AND t.tenant_id = $2
              AND (
                t.created_by = $3 
                OR t.responsible_user_id = $3
                OR ta.user_id = $3
              )
            GROUP BY t.id
        `, [id, tenantId, userId]);

        if (permissionCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Tarea no encontrada o sin permisos' });
        }

        const completed_at = status === 'completada' ? new Date() : null;

        const result = await pool.query(
            'UPDATE tasks SET status = $1, completed_at = $2 WHERE id = $3 RETURNING id',
            [status, completed_at, id]
        );

        res.json({ success: true, id: result.rows[0].id });
        broadcast({ type: 'TASKS_UPDATED' });

    } catch (err) {
        console.error('❌ Error al actualizar estado:', err);
        res.status(500).json({ error: 'Error al actualizar estado' });
    }
});

// 📝 EDIT COMMENT
router.put('/comments/:id', jsonParser, authenticateToken, async (req, res) => {
    try {
        const commentId = req.params.id;
        const { contenido } = req.body;
        const { userId, tenantId } = req;

        if (!contenido || !contenido.trim()) {
            return res.status(400).json({ error: 'El contenido del comentario es requerido' });
        }

        // Verify comment exists, belongs to tenant, and user is the author
        const commentCheck = await pool.query(`
            SELECT c.id, c.task_id
            FROM comments c
            JOIN tasks t ON c.task_id = t.id
            WHERE c.id = $1 AND c.autor_id = $2 AND t.tenant_id = $3
        `, [commentId, userId, tenantId]);

        if (commentCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Comentario no encontrado o sin permisos' });
        }

        await pool.query(
            'UPDATE comments SET contenido = $1 WHERE id = $2',
            [contenido.trim(), commentId]
        );

        res.json({ success: true, id: commentId });
        broadcast({ type: 'TASKS_UPDATED' });

    } catch (err) {
        console.error('❌ Error al editar comentario:', err);
        res.status(500).json({ error: 'Error al editar comentario' });
    }
});

// 🗑️ DELETE COMMENT
router.delete('/comments/:id', authenticateToken, async (req, res) => {
    const client = await pool.connect();

    try {
        const commentId = req.params.id;
        const { userId, tenantId } = req;

        await client.query('BEGIN');

        // Verify comment exists, belongs to tenant, and user is the author or admin
        const commentCheck = await client.query(`
            SELECT c.id, c.task_id, u.role
            FROM comments c
            JOIN tasks t ON c.task_id = t.id
            JOIN users u ON u.id = $2
            WHERE c.id = $1 AND t.tenant_id = $3
              AND (c.autor_id = $2 OR u.role = 'admin')
        `, [commentId, userId, tenantId]);

        if (commentCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Comentario no encontrado o sin permisos' });
        }

        // Delete comment (attachments will be deleted via CASCADE)
        await client.query('DELETE FROM comments WHERE id = $1', [commentId]);

        await client.query('COMMIT');

        res.json({ success: true });
        broadcast({ type: 'TASKS_UPDATED' });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Error al eliminar comentario:', err);
        res.status(500).json({ error: 'Error al eliminar comentario' });
    } finally {
        client.release();
    }
});

module.exports = router;
