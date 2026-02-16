// backend/routes/sender.routes-postgres.js
// PostgreSQL version with multi-tenancy
const express = require('express');
const router = express.Router();
const pool = require('../db-postgres');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticateToken } = require('../middleware/auth');

// Configurar multer para subir logos
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../../uploads/logos');
        // Crear directorio si no existe
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Generar nombre único para el logo
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'logo-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB máximo
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|svg/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Solo se permiten archivos de imagen (jpeg, jpg, png, gif, svg)'));
        }
    }
});

// ======================================================
// ===      GET SENDER CONFIG (POR TENANT)            ===
// ======================================================

router.get('/', authenticateToken, async (req, res) => {
    try {
        const { tenantId } = req;

        const result = await pool.query(
            'SELECT * FROM sender_config WHERE tenant_id = $1 ORDER BY id DESC LIMIT 1',
            [tenantId]
        );

        // Si no hay configuración, devolver valores por defecto
        if (result.rows.length === 0) {
            return res.json({
                name: 'Operia',
                rut: '',
                address: '',
                commune: 'Valparaíso',
                region: 'Valparaíso',
                phone: '',
                email: '',
                website: '',
                contact_person: '',
                contact_rut: '',
                thank_you_message: 'GRACIAS POR PREFERIR',
                logo_path: null
            });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error('❌ Error al obtener sender_config:', err);
        res.status(500).json({ error: 'Error al obtener configuración' });
    }
});

// ======================================================
// ===      SAVE/UPDATE SENDER CONFIG                 ===
// ======================================================

router.post('/', authenticateToken, async (req, res) => {
    try {
        const {
            name,
            rut,
            address,
            commune,
            region,
            phone,
            email,
            website,
            contact_person,
            contact_rut,
            thank_you_message,
            primary_color
        } = req.body;

        const { tenantId } = req;

        // Validar que al menos el nombre esté presente
        if (!name || name.trim() === '') {
            return res.status(400).json({ error: 'El nombre es requerido' });
        }

        // Verificar si ya existe una configuración para este tenant
        const existingConfig = await pool.query(
            'SELECT id, logo_path, primary_color FROM sender_config WHERE tenant_id = $1 ORDER BY id DESC LIMIT 1',
            [tenantId]
        );

        const logo_path = existingConfig.rows.length > 0 ? existingConfig.rows[0].logo_path : null;
        const current_color = existingConfig.rows.length > 0 ? existingConfig.rows[0].primary_color : '#006837';

        if (existingConfig.rows.length > 0) {
            // Actualizar configuración existente
            const result = await pool.query(
                `UPDATE sender_config 
                 SET name = $1, rut = $2, address = $3, commune = $4, region = $5, 
                     phone = $6, email = $7, website = $8, contact_person = $9, 
                     contact_rut = $10, thank_you_message = $11, primary_color = $12, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $13 AND tenant_id = $14
                 RETURNING id`,
                [
                    name, rut, address, commune, region, phone, email, website,
                    contact_person, contact_rut, thank_you_message, primary_color || current_color,
                    existingConfig.rows[0].id, tenantId
                ]
            );

            res.json({
                success: true,
                message: 'Configuración actualizada exitosamente',
                config: {
                    id: result.rows[0].id,
                    name, rut, address, commune, region, phone, email, website,
                    contact_person, contact_rut, thank_you_message, logo_path,
                    primary_color: primary_color || current_color
                }
            });
        } else {
            // Crear nueva configuración
            const result = await pool.query(
                `INSERT INTO sender_config (
                    tenant_id, name, rut, address, commune, region, phone, email, website,
                    contact_person, contact_rut, thank_you_message, primary_color
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                 RETURNING id`,
                [
                    tenantId, name, rut, address, commune, region, phone, email, website,
                    contact_person, contact_rut, thank_you_message, primary_color || '#006837'
                ]
            );

            res.json({
                success: true,
                message: 'Configuración creada exitosamente',
                config: {
                    id: result.rows[0].id,
                    name, rut, address, commune, region, phone, email, website,
                    contact_person, contact_rut, thank_you_message, logo_path: null,
                    primary_color: primary_color || '#006837'
                }
            });
        }
    } catch (err) {
        console.error('❌ Error al guardar sender_config:', err);
        res.status(500).json({ error: 'Error al guardar configuración' });
    }
});

// ======================================================
// ===      UPLOAD LOGO                               ===
// ======================================================

router.post('/logo', authenticateToken, upload.single('logo'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No se proporcionó ningún archivo' });
        }

        const { tenantId } = req;
        const logoPath = `/uploads/logos/${req.file.filename}`;

        // Obtener o crear configuración
        const existingConfig = await pool.query(
            'SELECT id, logo_path FROM sender_config WHERE tenant_id = $1 ORDER BY id DESC LIMIT 1',
            [tenantId]
        );

        if (existingConfig.rows.length > 0) {
            const config = existingConfig.rows[0];

            // Eliminar logo anterior si existe
            if (config.logo_path) {
                const oldLogoPath = path.join(__dirname, '../..', config.logo_path);
                if (fs.existsSync(oldLogoPath)) {
                    try {
                        fs.unlinkSync(oldLogoPath);
                    } catch (unlinkErr) {
                        console.error('Error al eliminar logo anterior:', unlinkErr);
                    }
                }
            }

            // Actualizar logo en configuración existente
            await pool.query(
                'UPDATE sender_config SET logo_path = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND tenant_id = $3',
                [logoPath, config.id, tenantId]
            );

            res.json({
                success: true,
                message: 'Logo actualizado exitosamente',
                logoPath: logoPath
            });
        } else {
            // Crear nueva configuración con solo el logo
            await pool.query(
                'INSERT INTO sender_config (tenant_id, name, logo_path) VALUES ($1, $2, $3)',
                [tenantId, 'Operia', logoPath]
            );

            res.json({
                success: true,
                message: 'Logo guardado exitosamente',
                logoPath: logoPath
            });
        }
    } catch (err) {
        console.error('❌ Error al subir logo:', err);

        // Eliminar archivo subido si hay error
        if (req.file) {
            try {
                fs.unlinkSync(req.file.path);
            } catch (unlinkErr) {
                console.error('Error al eliminar archivo:', unlinkErr);
            }
        }

        res.status(500).json({ error: 'Error al guardar logo' });
    }
});

module.exports = router;
