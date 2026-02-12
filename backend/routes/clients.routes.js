const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

// Middleware para parsear JSON
const jsonParser = express.json();

// 📋 BUSCAR CLIENTES (Autocompletado y Gestión)
router.get('/', authenticateToken, (req, res) => {
    const { search } = req.query;

    let sql = 'SELECT * FROM clients';
    let params = [];

    if (search && search.length >= 2) {
        sql += ' WHERE rut LIKE ? OR name LIKE ?';
        const searchTerm = `%${search}%`;
        params = [searchTerm, searchTerm];
    }

    sql += ' ORDER BY created_at DESC LIMIT 50';

    db.all(sql, params, (err, rows) => {
        if (err) {
            console.error('❌ Error al buscar clientes:', err);
            return res.status(500).json({ error: 'Error al buscar clientes' });
        }
        res.json(rows || []);
    });
});

// ➕ CREAR CLIENTE
router.post('/', jsonParser, authenticateToken, [
    body('rut').notEmpty().withMessage('RUT es requerido').trim().escape(),
    body('name').notEmpty().withMessage('Nombre es requerido').trim().escape(),
    body('email').optional({ checkFalsy: true }).isEmail().normalizeEmail(),
    body('phone').optional({ checkFalsy: true }).trim().escape(),
    body('address_street').optional({ checkFalsy: true }).trim().escape(),
    body('commune').optional({ checkFalsy: true }).trim().escape(),
], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { rut, name, email, phone, address_street, commune, region, reference } = req.body;

    const sql = `
    INSERT INTO clients (rut, name, email, phone, address_street, commune, region, reference)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

    db.run(sql, [rut, name, email, phone, address_street, commune, region, reference], function (err) {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                return res.status(409).json({ error: 'El cliente con este RUT ya existe.' });
            }
            console.error('❌ Error al crear cliente:', err);
            return res.status(500).json({ error: 'Error al crear cliente' });
        }

        res.status(201).json({
            id: this.lastID,
            rut,
            name,
            email,
            phone,
            address_street,
            commune,
            region,
            success: true
        });
    });
});

// ✏️ ACTUALIZAR CLIENTE
router.put('/:id', jsonParser, authenticateToken, [
    body('rut').notEmpty().withMessage('RUT es requerido').trim().escape(),
    body('name').notEmpty().withMessage('Nombre es requerido').trim().escape(),
    body('email').optional({ checkFalsy: true }).isEmail().normalizeEmail(),
    body('phone').optional({ checkFalsy: true }).trim().escape(),
    body('address_street').optional({ checkFalsy: true }).trim().escape(),
    body('commune').optional({ checkFalsy: true }).trim().escape(),
], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { rut, name, email, phone, address_street, commune, region, reference } = req.body;

    const sql = `
    UPDATE clients 
    SET rut = ?, name = ?, email = ?, phone = ?, address_street = ?, commune = ?, region = ?, reference = ?
    WHERE id = ?
  `;

    db.run(sql, [rut, name, email, phone, address_street, commune, region, reference, id], function (err) {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                return res.status(409).json({ error: 'El RUT ya está registrado por otro cliente.' });
            }
            console.error('❌ Error al actualizar cliente:', err);
            return res.status(500).json({ error: 'Error al actualizar cliente' });
        }

        if (this.changes === 0) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        res.json({ success: true, message: 'Cliente actualizado correctamente' });
    });
});

// 🗑️ ELIMINAR CLIENTE
router.delete('/:id', authenticateToken, (req, res) => {
    const { id } = req.params;

    const sql = 'DELETE FROM clients WHERE id = ?';

    db.run(sql, [id], function (err) {
        if (err) {
            console.error('❌ Error al eliminar cliente:', err);
            return res.status(500).json({ error: 'Error al eliminar cliente' });
        }

        if (this.changes === 0) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        res.json({ success: true, message: 'Cliente eliminado correctamente' });
    });
});

module.exports = router;
