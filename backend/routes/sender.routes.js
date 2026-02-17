const express = require('express');
const router = express.Router();
const pool = require('../db-postgres'); // Use Postgres Pool
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticateToken } = require('../middleware/auth');

// Configurar multer para subir logos
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = process.env.RENDER_UPLOADS_PATH
            ? path.join(process.env.RENDER_UPLOADS_PATH, 'logos')
            : path.join(__dirname, '../../uploads/logos');

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

// GET /api/sender-config - Obtener configuración actual
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
                thank_you_message: 'GRACIAS POR PREFERIRNOS',
                logo_path: null
            });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error al obtener sender_config:', err);
        res.status(500).json({ error: 'Error al obtener configuración' });
    }
});

// POST /api/sender-config - Guardar/actualizar configuración
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { tenantId } = req;
        const {
            name, rut, address, commune, region,
            phone, email, website, contact_person,
            contact_rut, thank_you_message
        } = req.body;

        // Validar que al menos el nombre esté presente
        if (!name || name.trim() === '') {
            return res.status(400).json({ error: 'El nombre es requerido' });
        }

        // Check if exists
        const check = await pool.query(
            'SELECT id FROM sender_config WHERE tenant_id = $1 ORDER BY id DESC LIMIT 1',
            [tenantId]
        );

        if (check.rows.length > 0) {
            // Update
            const rowId = check.rows[0].id;
            await pool.query(`
                UPDATE sender_config 
                SET name = $1, rut = $2, address = $3, commune = $4, region = $5, 
                    phone = $6, email = $7, website = $8, contact_person = $9, 
                    contact_rut = $10, thank_you_message = $11, 
                    updated_at = NOW()
                WHERE id = $12 AND tenant_id = $13
            `, [
                name, rut, address, commune, region, phone, email, website,
                contact_person, contact_rut, thank_you_message, rowId, tenantId
            ]);

            res.json({ success: true, message: 'Configuración actualizada' });
        } else {
            // Insert
            await pool.query(`
                INSERT INTO sender_config (
                    tenant_id, name, rut, address, commune, region, phone, email, website,
                    contact_person, contact_rut, thank_you_message
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            `, [
                tenantId, name, rut, address, commune, region, phone, email, website,
                contact_person, contact_rut, thank_you_message
            ]);

            res.json({ success: true, message: 'Configuración creada' });
        }
    } catch (err) {
        console.error('Error al guardar sender_config:', err);
        res.status(500).json({ error: 'Error al guardar configuración' });
    }
});

// POST /api/sender-config/logo - Subir logo
router.post('/logo', authenticateToken, upload.single('logo'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No se proporcionó ningún archivo' });
    }

    const logoPath = `/uploads/logos/${req.file.filename}`;
    const { tenantId } = req;

    try {
        const check = await pool.query(
            'SELECT id, logo_path FROM sender_config WHERE tenant_id = $1 ORDER BY id DESC LIMIT 1',
            [tenantId]
        );

        if (check.rows.length > 0) {
            // Update existing
            const row = check.rows[0];
            // Optional: Delete old logo file from disk if desired

            await pool.query(
                'UPDATE sender_config SET logo_path = $1, updated_at = NOW() WHERE id = $2',
                [logoPath, row.id]
            );
        } else {
            // Create new with logo only
            await pool.query(
                'INSERT INTO sender_config (tenant_id, name, logo_path) VALUES ($1, $2, $3)',
                [tenantId, 'Empresa Sin Nombre', logoPath]
            );
        }

        res.json({ success: true, message: 'Logo actualizado', logoPath });

    } catch (err) {
        console.error('Error al guardar logo:', err);
        return res.status(500).json({ error: 'Error al guardar logo' });
    }
});

module.exports = router;
