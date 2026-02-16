// backend/routes/clients.routes-postgres.js
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const pool = require('../db-postgres');
const { authenticateToken } = require('../middleware/auth');
const { checkPlanLimit } = require('../middleware/planLimits');

const jsonParser = express.json();

// 📋 BUSCAR CLIENTES (Autocompletado y Gestión)
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { search } = req.query;
        const { tenantId } = req;

        let sql = 'SELECT * FROM clients WHERE tenant_id = $1';
        let params = [tenantId];

        if (search && search.length >= 2) {
            sql += ' AND (rut ILIKE $2 OR name ILIKE $2)';
            params.push(`%${search}%`);
        }

        sql += ' ORDER BY created_at DESC LIMIT 50';

        const result = await pool.query(sql, params);
        res.json(result.rows || []);
    } catch (err) {
        console.error('❌ Error al buscar clientes:', err);
        res.status(500).json({ error: 'Error al buscar clientes' });
    }
});

// ➕ CREAR CLIENTE (con límite de plan)
router.post('/', jsonParser, authenticateToken, checkPlanLimit('clients'), [
    body('rut').notEmpty().withMessage('RUT es requerido').trim().escape(),
    body('name').notEmpty().withMessage('Nombre es requerido').trim().escape(),
    body('email').optional({ checkFalsy: true }).isEmail().normalizeEmail(),
    body('phone').optional({ checkFalsy: true }).trim().escape(),
    body('address_street').optional({ checkFalsy: true }).trim().escape(),
    body('commune').optional({ checkFalsy: true }).trim().escape(),
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { rut, name, email, phone, address_street, commune, region, reference } = req.body;
        const { tenantId } = req;

        const sql = `
      INSERT INTO clients (tenant_id, rut, name, email, phone, address_street, commune, region, reference)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

        const result = await pool.query(sql, [
            tenantId, rut, name, email, phone, address_street, commune, region, reference
        ]);

        res.status(201).json({
            ...result.rows[0],
            success: true
        });
    } catch (err) {
        if (err.constraint === 'clients_rut_key') {
            return res.status(409).json({ error: 'El cliente con este RUT ya existe.' });
        }
        console.error('❌ Error al crear cliente:', err);
        res.status(500).json({ error: 'Error al crear cliente' });
    }
});

// ✏️ ACTUALIZAR CLIENTE
router.put('/:id', jsonParser, authenticateToken, [
    body('rut').notEmpty().withMessage('RUT es requerido').trim().escape(),
    body('name').notEmpty().withMessage('Nombre es requerido').trim().escape(),
    body('email').optional({ checkFalsy: true }).isEmail().normalizeEmail(),
    body('phone').optional({ checkFalsy: true }).trim().escape(),
    body('address_street').optional({ checkFalsy: true }).trim().escape(),
    body('commune').optional({ checkFalsy: true }).trim().escape(),
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { id } = req.params;
        const { rut, name, email, phone, address_street, commune, region, reference } = req.body;
        const { tenantId } = req;

        const sql = `
      UPDATE clients 
      SET rut = $1, name = $2, email = $3, phone = $4, 
          address_street = $5, commune = $6, region = $7, reference = $8
      WHERE id = $9 AND tenant_id = $10
    `;

        const result = await pool.query(sql, [
            rut, name, email, phone, address_street, commune, region, reference, id, tenantId
        ]);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        res.json({ success: true, message: 'Cliente actualizado correctamente' });
    } catch (err) {
        if (err.constraint === 'clients_rut_key') {
            return res.status(409).json({ error: 'El RUT ya está registrado por otro cliente.' });
        }
        console.error('❌ Error al actualizar cliente:', err);
        res.status(500).json({ error: 'Error al actualizar cliente' });
    }
});

// 🗑️ ELIMINAR CLIENTE
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { tenantId } = req;

        const sql = 'DELETE FROM clients WHERE id = $1 AND tenant_id = $2';
        const result = await pool.query(sql, [id, tenantId]);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        res.json({ success: true, message: 'Cliente eliminado correctamente' });
    } catch (err) {
        console.error('❌ Error al eliminar cliente:', err);
        res.status(500).json({ error: 'Error al eliminar cliente' });
    }
});

module.exports = router;
