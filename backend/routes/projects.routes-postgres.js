const express = require('express');
const router = express.Router();
const pool = require('../db-postgres');
const authenticateToken = require('../middleware/authenticateToken');

// ==========================================
// 1. Obtener los proyectos a los que pertenezco
// ==========================================
router.get('/', authenticateToken, async (req, res) => {
    try {
        const tenant_id = req.user.tenantId;
        const user_id = req.user.id;
        const role = req.user.role; // 'admin' o 'user'

        let result;
        if (role === 'admin') {
            // Admin ve todos los proyectos
            result = await pool.query(`
                SELECT p.*, u.name as creator_name
                FROM projects p
                LEFT JOIN users u ON p.created_by = u.id
                WHERE p.tenant_id = $1
                ORDER BY p.name ASC
            `, [tenant_id]);
        } else {
            // Usuario normal ve solo a los que pertenece
            result = await pool.query(`
                SELECT p.*, u.name as creator_name
                FROM projects p
                INNER JOIN project_members pm ON p.id = pm.project_id
                LEFT JOIN users u ON p.created_by = u.id
                WHERE p.tenant_id = $1 AND pm.user_id = $2
                ORDER BY p.name ASC
            `, [tenant_id, user_id]);
        }

        res.json(result.rows);
    } catch (err) {
        console.error('❌ Error al obtener proyectos:', err);
        res.status(500).json({ error: 'Error interno al obtener proyectos' });
    }
});

// ==========================================
// 2. Crear un nuevo proyecto
// ==========================================
router.post('/', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { name, description } = req.body;
        const tenant_id = req.user.tenantId;
        const user_id = req.user.id;

        if (!name) {
            return res.status(400).json({ error: 'El nombre del proyecto es obligatorio' });
        }

        await client.query('BEGIN');

        // Create the project
        const projectResult = await client.query(`
            INSERT INTO projects (tenant_id, name, description, created_by)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `, [tenant_id, name, description, user_id]);

        const newProject = projectResult.rows[0];

        // Add the creator as the first member
        await client.query(`
            INSERT INTO project_members (project_id, user_id)
            VALUES ($1, $2)
        `, [newProject.id, user_id]);

        await client.query('COMMIT');
        res.status(201).json(newProject);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Error al crear proyecto:', err);
        res.status(500).json({ error: 'Error interno al crear proyecto' });
    } finally {
        client.release();
    }
});

// ==========================================
// 3. Obtener miembros de un proyecto
// ==========================================
router.get('/:id/members', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const tenant_id = req.user.tenantId;

        // Verify project belongs to tenant
        const projectCheck = await pool.query('SELECT id FROM projects WHERE id = $1 AND tenant_id = $2', [id, tenant_id]);
        if (projectCheck.rowCount === 0) return res.status(404).json({ error: 'Proyecto no encontrado' });

        const result = await pool.query(`
            SELECT u.id, u.name, u.email, u.role, u.avatar_url
            FROM users u
            INNER JOIN project_members pm ON u.id = pm.user_id
            WHERE pm.project_id = $1
            ORDER BY u.name ASC
        `, [id]);

        res.json(result.rows);
    } catch (err) {
        console.error('❌ Error al obtener miembros:', err);
        res.status(500).json({ error: 'Error interno al obtener miembros' });
    }
});

// ==========================================
// 4. Añadir miembro a un proyecto
// ==========================================
router.post('/:id/members', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { user_id } = req.body;
        const tenant_id = req.user.tenantId;

        // Optionally, check if caller is admin or project creator
        if (!user_id) return res.status(400).json({ error: 'Falta user_id' });

        const projectCheck = await pool.query('SELECT id FROM projects WHERE id = $1 AND tenant_id = $2', [id, tenant_id]);
        if (projectCheck.rowCount === 0) return res.status(404).json({ error: 'Proyecto no encontrado' });

        await pool.query(`
            INSERT INTO project_members (project_id, user_id)
            VALUES ($1, $2)
            ON CONFLICT DO NOTHING
        `, [id, user_id]);

        res.json({ success: true, message: 'Usuario añadido al proyecto' });
    } catch (err) {
        console.error('❌ Error al añadir miembro:', err);
        res.status(500).json({ error: 'Error al añadir miembro' });
    }
});

// ==========================================
// 5. Eliminar miembro de un proyecto
// ==========================================
router.delete('/:id/members/:userId', authenticateToken, async (req, res) => {
    try {
        const { id, userId } = req.params;
        const tenant_id = req.user.tenantId;

        const projectCheck = await pool.query('SELECT id FROM projects WHERE id = $1 AND tenant_id = $2', [id, tenant_id]);
        if (projectCheck.rowCount === 0) return res.status(404).json({ error: 'Proyecto no encontrado' });

        await pool.query(`
            DELETE FROM project_members
            WHERE project_id = $1 AND user_id = $2
        `, [id, userId]);

        res.json({ success: true, message: 'Usuario removido del proyecto' });
    } catch (err) {
        console.error('❌ Error al eliminar miembro:', err);
        res.status(500).json({ error: 'Error al remover miembro' });
    }
});

module.exports = router;
