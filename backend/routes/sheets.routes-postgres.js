// backend/routes/sheets.routes-postgres.js
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const pool = require('../db-postgres');
const { authenticateToken } = require('../middleware/auth');

// --- Configuración de Multer para Fichas Técnicas (solo PDFs) ---
const uploadsDir = process.env.RENDER_UPLOADS_PATH || path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const originalName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        cb(null, uniqueSuffix + '-' + originalName);
    }
});

const pdfFileFilter = (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
        cb(null, true);
    } else {
        cb(new Error('Formato de archivo no válido. Solo se permiten PDFs.'), false);
    }
};

const upload = multer({
    storage: storage,
    limits: { fileSize: 15 * 1024 * 1024 }, // 15MB para PDFs
    fileFilter: pdfFileFilter
});

// --- RUTAS PARA FICHAS TÉCNICAS ---

/**
 * @route   POST /api/sheets
 * @desc    Sube una nueva ficha técnica (PDF) con plan limit check
 * @access  Privado
 */
router.post('/', authenticateToken, upload.single('sheetFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'El archivo PDF es requerido.' });
        }

        const { product_name, model, category_id, tags, sku } = req.body;
        const { userId, tenantId } = req;

        if (!product_name) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ error: 'El nombre del producto es requerido.' });
        }

        const sql = `
      INSERT INTO technical_sheets (tenant_id, product_name, model, category_id, tags, file_path, file_name, uploaded_by, sku)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `;

        const params = [
            tenantId,
            product_name,
            model || null,
            category_id || null,
            tags || null,
            req.file.filename,
            req.file.originalname,
            userId,
            sku || null
        ];

        const result = await pool.query(sql, params);

        res.status(201).json({
            success: true,
            sheetId: result.rows[0].id,
            message: 'Ficha técnica subida correctamente.'
        });
    } catch (err) {
        console.error('❌ Error al guardar ficha técnica:', err);
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ error: 'Error al guardar la información de la ficha.' });
    }
});

/**
 * @route   GET /api/sheets/:id/download
 * @desc    Descarga el PDF de una ficha técnica
 * @access  Privado
 */
router.get('/:id/download', authenticateToken, async (req, res) => {
    try {
        const sheetId = req.params.id;
        const { tenantId } = req;

        const result = await pool.query(
            'SELECT file_path, file_name FROM technical_sheets WHERE id = $1 AND tenant_id = $2',
            [sheetId, tenantId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Ficha técnica no encontrada.' });
        }

        const sheet = result.rows[0];
        const filePath = path.join(uploadsDir, sheet.file_path);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'El archivo PDF no se encuentra en el servidor.' });
        }

        res.setHeader('Content-Disposition', `attachment; filename="${sheet.file_name}"`);
        res.setHeader('Content-Type', 'application/pdf');
        fs.createReadStream(filePath).pipe(res);
    } catch (err) {
        console.error('❌ Error al descargar ficha:', err);
        res.status(500).json({ error: 'Error al descargar el archivo.' });
    }
});

/**
 * @route   GET /api/sheets/:id/preview
 * @desc    Vista previa del PDF (inline)
 * @access  Privado
 */
router.get('/:id/preview', authenticateToken, async (req, res) => {
    try {
        const sheetId = req.params.id;
        const { tenantId } = req;

        const result = await pool.query(
            'SELECT file_path, file_name FROM technical_sheets WHERE id = $1 AND tenant_id = $2',
            [sheetId, tenantId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Ficha técnica no encontrada.' });
        }

        const sheet = result.rows[0];
        const filePath = path.join(uploadsDir, sheet.file_path);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'El archivo PDF no se encuentra en el servidor.' });
        }

        res.setHeader('Content-Disposition', `inline; filename="${sheet.file_name}"`);
        res.setHeader('Content-Type', 'application/pdf');
        fs.createReadStream(filePath).pipe(res);
    } catch (err) {
        console.error('❌ Error al previsualizar ficha:', err);
        res.status(500).json({ error: 'Error al obtener vista previa.' });
    }
});

/**
 * @route   GET /api/sheets
 * @desc    Obtiene y busca fichas técnicas (filtrado por tenant)
 * @access  Privado
 */
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { search, category } = req.query;
        const { tenantId } = req;

        let sql = `
      SELECT ts.*, c.name as category_name, u.name as uploaded_by_name
      FROM technical_sheets ts
      LEFT JOIN categories c ON ts.category_id = c.id
      LEFT JOIN users u ON ts.uploaded_by = u.id
      WHERE ts.tenant_id = $1
    `;
        const params = [tenantId];
        let paramCount = 1;

        if (search) {
            paramCount++;
            sql += ` AND (ts.product_name ILIKE $${paramCount} OR ts.model ILIKE $${paramCount} OR ts.tags ILIKE $${paramCount} OR ts.sku ILIKE $${paramCount})`;
            params.push(`%${search}%`);
        }

        if (category) {
            paramCount++;
            sql += ` AND ts.category_id = $${paramCount}`;
            params.push(category);
        }

        sql += ` ORDER BY ts.product_name ASC`;

        const result = await pool.query(sql, params);
        res.json(result.rows || []);
    } catch (err) {
        console.error('❌ Error al obtener fichas técnicas:', err);
        res.status(500).json({ error: 'Error al obtener las fichas técnicas.' });
    }
});

/**
 * @route   PUT /api/sheets/:id
 * @desc    Actualiza los metadatos de una ficha técnica
 * @access  Privado
 */
router.put('/:id', authenticateToken, express.json(), async (req, res) => {
    try {
        const sheetId = req.params.id;
        const { product_name, model, sku, category_id, tags } = req.body;
        const { tenantId } = req;

        if (!product_name) {
            return res.status(400).json({ error: 'El nombre del producto es requerido.' });
        }

        const sql = `
      UPDATE technical_sheets 
      SET product_name = $1, model = $2, sku = $3, category_id = $4, tags = $5
      WHERE id = $6 AND tenant_id = $7
    `;

        const params = [
            product_name,
            model || null,
            sku || null,
            category_id || null,
            tags || null,
            sheetId,
            tenantId
        ];

        const result = await pool.query(sql, params);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Ficha técnica no encontrada.' });
        }

        res.status(200).json({ success: true, message: 'Ficha actualizada correctamente.' });
    } catch (err) {
        console.error('❌ Error al actualizar ficha técnica:', err);
        res.status(500).json({ error: 'Error al actualizar la ficha.' });
    }
});

/**
 * @route   DELETE /api/sheets/:id
 * @desc    Elimina una ficha técnica (archivo + registro)
 * @access  Privado
 */
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const sheetId = req.params.id;
        const { tenantId } = req;

        // Obtener el file_path antes de eliminar
        const result = await pool.query(
            'SELECT file_path FROM technical_sheets WHERE id = $1 AND tenant_id = $2',
            [sheetId, tenantId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Ficha técnica no encontrada.' });
        }

        const sheet = result.rows[0];

        // Eliminar de la base de datos
        await pool.query(
            'DELETE FROM technical_sheets WHERE id = $1 AND tenant_id = $2',
            [sheetId, tenantId]
        );

        // Eliminar archivo físico
        const filePath = path.join(uploadsDir, sheet.file_path);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        res.json({ success: true, message: 'Ficha técnica eliminada correctamente.' });
    } catch (err) {
        console.error('❌ Error al eliminar ficha técnica:', err);
        res.status(500).json({ error: 'Error al eliminar la ficha.' });
    }
});

module.exports = router;
