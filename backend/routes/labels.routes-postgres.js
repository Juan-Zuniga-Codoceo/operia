// backend/routes/labels.routes-postgres.js
const express = require('express');
const router = express.Router();
const pool = require('../db-postgres');
const { authenticateToken } = require('../middleware/auth');

const jsonParser = express.json();

// GET /api/labels - Obtener todas las etiquetas del tenant
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { tenantId } = req;

        const sql = `
      SELECT l.*, u.name as created_by_name 
      FROM labels l
      LEFT JOIN users u ON l.created_by = u.id
      WHERE l.tenant_id = $1
      ORDER BY l.name
    `;

        const result = await pool.query(sql, [tenantId]);
        res.json(result.rows || []);
    } catch (err) {
        console.error('❌ Error al obtener etiquetas:', err);
        res.status(500).json({ error: 'Error al obtener las etiquetas' });
    }
});

// POST /api/labels - Crear nueva etiqueta
router.post('/', jsonParser, authenticateToken, async (req, res) => {
    try {
        const { name, color } = req.body;
        const { tenantId, userId } = req;

        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'El nombre de la etiqueta es obligatorio' });
        }

        const sql = `
      INSERT INTO labels (tenant_id, name, color, created_by)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;

        const result = await pool.query(sql, [
            tenantId,
            name.trim(),
            color || '#006837',
            userId
        ]);

        res.status(201).json(result.rows[0]);
    } catch (err) {
        if (err.constraint === 'labels_tenant_id_name_key') {
            return res.status(409).json({ error: 'Ya existe una etiqueta con ese nombre' });
        }
        console.error('❌ Error al crear etiqueta:', err);
        res.status(500).json({ error: 'Error al crear la etiqueta' });
    }
});

// DELETE /api/labels/:id - Eliminar etiqueta
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { tenantId } = req;

        const result = await pool.query(
            'DELETE FROM labels WHERE id = $1 AND tenant_id = $2',
            [id, tenantId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Etiqueta no encontrada' });
        }

        res.json({ success: true, message: 'Etiqueta eliminada' });
    } catch (err) {
        console.error('❌ Error al eliminar etiqueta:', err);
        res.status(500).json({ error: 'Error al eliminar etiqueta' });
    }
});

module.exports = router;
