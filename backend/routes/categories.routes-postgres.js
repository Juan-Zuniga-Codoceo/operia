// backend/routes/categories.routes-postgres.js
const express = require('express');
const router = express.Router();
const pool = require('../db-postgres');
const { authenticateToken } = require('../middleware/auth');

const jsonParser = express.json();

// GET /api/categories - Obtener todas las categorías del tenant
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { tenantId } = req;

        const sql = `
      SELECT c.*, u.name as created_by_name 
      FROM categories c 
      LEFT JOIN users u ON c.created_by = u.id 
      WHERE c.tenant_id = $1
      ORDER BY c.name
    `;

        const result = await pool.query(sql, [tenantId]);
        res.json(result.rows || []);
    } catch (err) {
        console.error('❌ Error al obtener categorías:', err);
        res.status(500).json({ error: 'Error al obtener categorías' });
    }
});

// POST /api/categories - Crear nueva categoría
router.post('/', jsonParser, authenticateToken, async (req, res) => {
    try {
        const { name } = req.body;
        const { tenantId, userId } = req;

        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'El nombre de la categoría es requerido' });
        }

        const sql = `
      INSERT INTO categories (tenant_id, name, created_by) 
      VALUES ($1, $2, $3)
      RETURNING *
    `;

        const result = await pool.query(sql, [tenantId, name.trim(), userId]);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        if (err.constraint === 'categories_tenant_id_name_key') {
            return res.status(409).json({ error: 'Ya existe una categoría con ese nombre' });
        }
        console.error('❌ Error al crear categoría:', err);
        res.status(500).json({ error: 'Error al crear categoría' });
    }
});

// DELETE /api/categories/:id - Eliminar categoría
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { tenantId } = req;

        const result = await pool.query(
            'DELETE FROM categories WHERE id = $1 AND tenant_id = $2',
            [id, tenantId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Categoría no encontrada' });
        }

        res.json({ success: true, message: 'Categoría eliminada' });
    } catch (err) {
        console.error('❌ Error al eliminar categoría:', err);
        res.status(500).json({ error: 'Error al eliminar categoría' });
    }
});

module.exports = router;
