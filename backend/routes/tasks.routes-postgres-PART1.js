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
        array_agg(DISTINCT ua.name) FILTER (WHERE ua.id IS NOT NULL) as assigned_names,
        array_agg(DISTINCT ta.user_id) FILTER (WHERE ta.user_id IS NOT NULL) as assigned_ids,
        array_agg(DISTINCT l.name) FILTER (WHERE l.id IS NOT NULL) as label_names,
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

        console.log(`📋 Tareas recuperadas: ${result.rows.length}`);
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

        const humanId = `${prefix}-${String(nextNumber).padStart(4, '0')}`;

        // 2. Insert Task
        const clientSnapshotStr = typeof client_snapshot === 'object' ? JSON.stringify(client_snapshot) : client_snapshot;

        const insertSql = `
      INSERT INTO tasks (
        tenant_id, title, description, due_date, priority, created_by, responsible_user_id,
        human_id, origin, shipping_type, payment_status, client_snapshot
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
                    const mensaje = `${creator.name} te ha asignado una nueva tarea: "${title.substring(0, 30)}..." [${humanId}]`;
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
            const mensaje = `${creator.name} te asignó como RESPONSABLE de: "${title.substring(0, 30)}..." [${humanId}]`;
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
            `SELECT created_by, responsible_user_id, 
              array_agg(ta.user_id) FILTER (WHERE ta.user_id IS NOT NULL) as assigned_ids
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

// PART 2 of tasks routes will be in a separate comment due to size...
// This includes: Change Status, Comments, Attachments, File Upload/Download

module.exports = router;
