const express = require('express');
const router = express.Router();
const db = require('../db');
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

// GET /api/sender-config - Obtener configuración actual
router.get('/', authenticateToken, (req, res) => {
    db.get('SELECT * FROM sender_config ORDER BY id DESC LIMIT 1', [], (err, row) => {
        if (err) {
            console.error('Error al obtener sender_config:', err);
            return res.status(500).json({ error: 'Error al obtener configuración' });
        }

        // Si no hay configuración, devolver valores por defecto
        if (!row) {
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

        res.json(row);
    });
});

// POST /api/sender-config - Guardar/actualizar configuración
router.post('/', authenticateToken, (req, res) => {
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
        thank_you_message
    } = req.body;

    // Validar que al menos el nombre esté presente
    if (!name || name.trim() === '') {
        return res.status(400).json({ error: 'El nombre es requerido' });
    }

    // Primero verificar si ya existe una configuración
    db.get('SELECT id, logo_path FROM sender_config ORDER BY id DESC LIMIT 1', [], (err, row) => {
        if (err) {
            console.error('Error al verificar sender_config:', err);
            return res.status(500).json({ error: 'Error al guardar configuración' });
        }

        const logo_path = row ? row.logo_path : null;

        if (row) {
            // Actualizar configuración existente
            const query = `
        UPDATE sender_config 
        SET name = ?, rut = ?, address = ?, commune = ?, region = ?, 
            phone = ?, email = ?, website = ?, contact_person = ?, 
            contact_rut = ?, thank_you_message = ?, 
            updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `;

            db.run(query, [
                name, rut, address, commune, region, phone, email, website,
                contact_person, contact_rut, thank_you_message, row.id
            ], function (err) {
                if (err) {
                    console.error('Error al actualizar sender_config:', err);
                    return res.status(500).json({ error: 'Error al guardar configuración' });
                }

                res.json({
                    success: true,
                    message: 'Configuración actualizada exitosamente',
                    config: {
                        id: row.id,
                        name, rut, address, commune, region, phone, email, website,
                        contact_person, contact_rut, thank_you_message, logo_path
                    }
                });
            });
        } else {
            // Crear nueva configuración
            const query = `
        INSERT INTO sender_config (
          name, rut, address, commune, region, phone, email, website,
          contact_person, contact_rut, thank_you_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

            db.run(query, [
                name, rut, address, commune, region, phone, email, website,
                contact_person, contact_rut, thank_you_message
            ], function (err) {
                if (err) {
                    console.error('Error al crear sender_config:', err);
                    return res.status(500).json({ error: 'Error al guardar configuración' });
                }

                res.json({
                    success: true,
                    message: 'Configuración creada exitosamente',
                    config: {
                        id: this.lastID,
                        name, rut, address, commune, region, phone, email, website,
                        contact_person, contact_rut, thank_you_message, logo_path: null
                    }
                });
            });
        }
    });
});

// POST /api/sender-config/logo - Subir logo
router.post('/logo', authenticateToken, upload.single('logo'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No se proporcionó ningún archivo' });
    }

    const logoPath = `/uploads/logos/${req.file.filename}`;

    // Obtener o crear configuración
    db.get('SELECT id, logo_path FROM sender_config ORDER BY id DESC LIMIT 1', [], (err, row) => {
        if (err) {
            console.error('Error al verificar sender_config:', err);
            // Eliminar archivo subido si hay error
            fs.unlinkSync(req.file.path);
            return res.status(500).json({ error: 'Error al guardar logo' });
        }

        if (row) {
            // Eliminar logo anterior si existe
            if (row.logo_path) {
                const oldLogoPath = path.join(__dirname, '..', row.logo_path);
                if (fs.existsSync(oldLogoPath)) {
                    fs.unlinkSync(oldLogoPath);
                }
            }

            // Actualizar logo en configuración existente
            db.run(
                'UPDATE sender_config SET logo_path = ?, updated_at = datetime(\'now\', \'localtime\') WHERE id = ?',
                [logoPath, row.id],
                function (err) {
                    if (err) {
                        console.error('Error al actualizar logo:', err);
                        fs.unlinkSync(req.file.path);
                        return res.status(500).json({ error: 'Error al guardar logo' });
                    }

                    res.json({
                        success: true,
                        message: 'Logo actualizado exitosamente',
                        logoPath: logoPath
                    });
                }
            );
        } else {
            // Crear nueva configuración con solo el logo
            db.run(
                `INSERT INTO sender_config (name, logo_path) VALUES (?, ?)`,
                ['Operia', logoPath],
                function (err) {
                    if (err) {
                        console.error('Error al crear sender_config con logo:', err);
                        fs.unlinkSync(req.file.path);
                        return res.status(500).json({ error: 'Error al guardar logo' });
                    }

                    res.json({
                        success: true,
                        message: 'Logo guardado exitosamente',
                        logoPath: logoPath
                    });
                }
            );
        }
    });
});

module.exports = router;
