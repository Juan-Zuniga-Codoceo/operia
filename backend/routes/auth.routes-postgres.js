// backend/routes/auth.routes-postgres.js
// NUEVAS RUTAS DE AUTENTICACIÓN CON SOPORTE MULTI-TENANT
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { sendEmail } = require('../services/email.service');
const { createEmailTemplate } = require('../services/email-template.service');
const { body, validationResult } = require('express-validator');
const pool = require('../db-postgres');
const { authenticateToken } = require('../middleware/auth');
const { optionalTenant } = require('../middleware/tenant.middleware');

const jsonParser = express.json({ limit: '10mb' });

// ======================================================
// ===      REGISTRO DE NUEVO TENANT (ORGANIZACIÓN)   ===
// ======================================================

/**
 * POST /api/auth/signup-tenant
 * Crea una nueva organización (tenant) con su admin
 */
router.post('/signup-tenant', jsonParser, [
    body('company_name').trim().isLength({ min: 2, max: 255 }).escape(),
    body('subdomain').trim().isLength({ min: 3, max: 50 }).matches(/^[a-z0-9-]+$/),
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('user_name').trim().isLength({ min: 2, max: 255 }).escape()
], async (req, res) => {
    const client = await pool.connect();

    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: 'Datos inválidos', detalles: errors.array() });
        }

        const { company_name, subdomain, email, password, user_name, office, plan } = req.body;

        // Verificar que el subdomain no esté tomado
        const subdomainCheck = await client.query(
            'SELECT id FROM tenants WHERE subdomain = $1',
            [subdomain.toLowerCase()]
        );

        if (subdomainCheck.rows.length > 0) {
            return res.status(409).json({
                error: 'Subdomain no disponible',
                message: 'Este subdomain ya está en uso. Por favor, elige otro.'
            });
        }

        // Verificar email no exista en NINGÚN tenant
        const emailCheck = await client.query(
            'SELECT id FROM users WHERE email = $1',
            [email]
        );

        if (emailCheck.rows.length > 0) {
            return res.status(409).json({
                error: 'Email ya registrado',
                message: 'Este correo ya está registrado en otra organización.'
            });
        }

        await client.query('BEGIN');

        // 1. Crear el tenant
        const selectedPlan = plan || 'starter';
        const tenantResult = await client.query(`
      INSERT INTO tenants (name, subdomain, plan, subscription_status, trial_ends_at, onboarding_completed)
      VALUES ($1, $2, $3, 'trial', CURRENT_TIMESTAMP + INTERVAL '14 days', false)
      RETURNING id, subdomain, trial_ends_at
    `, [company_name, subdomain.toLowerCase(), selectedPlan]);

        const tenant = tenantResult.rows[0];

        // 2. Crear el usuario administrador
        const hashedPassword = await bcrypt.hash(password, 12);
        const userResult = await client.query(`
      INSERT INTO users (tenant_id, name, email, password, office, role, is_active)
      VALUES ($1, $2, $3, $4, $5, 'admin', true)
      RETURNING id, name, email, office, role
    `, [tenant.id, user_name, email, hashedPassword, office || '']);

        const user = userResult.rows[0];

        // 3. Crear datos iniciales para el tenant (labels por defecto, etc.)
        await client.query(`
      INSERT INTO labels (tenant_id, name, color, created_by)
      VALUES 
        ($1, 'Urgente', '#E74C3C', $2),
        ($1, 'Importante', '#F39C12', $2),
        ($1, 'Normal', '#3498DB', $2)
    `, [tenant.id, user.id]);

        await client.query('COMMIT');

        // 4. Generar JWT con tenant_id
        const token = jwt.sign(
            {
                id: user.id,
                name: user.name,
                role: user.role,
                tenant_id: tenant.id // Incluir tenant_id en el token
            },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );

        // 5. Enviar email de bienvenida
        const welcomeEmail = createEmailTemplate({
            title: '¡Bienvenido a Operia!',
            recipientName: user_name,
            mainContentHtml: `
        <p>Tu cuenta ha sido creada exitosamente. Ya puedes acceder a tu tablero:</p>
        <p><strong>Subdomain:</strong> ${subdomain}.operia.app</p>
        <p><strong>Trial:</strong> 14 días gratis (hasta ${new Date(tenant.trial_ends_at).toLocaleDateString('es-CL')})</p>
      `,
            buttonUrl: `https://${subdomain}.operia.app`,
            buttonText: 'Acceder a mi Tablero'
        });

        try {
            await sendEmail(email, '¡Bienvenido a Operia!', welcomeEmail);
        } catch (emailError) {
            console.error('Error al enviar email de bienvenida:', emailError);
            // No fallamos el registro por un error de email
        }

        res.status(201).json({
            success: true,
            message: 'Organización creada exitosamente',
            tenant: {
                id: tenant.id,
                name: company_name,
                subdomain: subdomain,
                access_url: `https://${subdomain}.operia.app`,
                trial_ends_at: tenant.trial_ends_at
            },
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            },
            token
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error en signup-tenant:', error);
        res.status(500).json({ error: 'Error al crear la organización' });
    } finally {
        client.release();
    }
});

// ======================================================
// ===      VERIFICAR DISPONIBILIDAD DE SUBDOMAIN     ===
// ======================================================

router.get('/check-subdomain/:subdomain', async (req, res) => {
    try {
        const { subdomain } = req.params;

        // Validar formato
        if (!/^[a-z0-9-]+$/.test(subdomain) || subdomain.length < 3 || subdomain.length > 50) {
            return res.json({
                available: false,
                message: 'El subdomain debe tener entre 3-50 caracteres (solo letras, números y guiones)'
            });
        }

        // Subdomains reservados
        const reserved = ['www', 'api', 'app', 'admin', 'mail', 'ftp', 'operia', 'demo', 'test', 'prod', 'dev'];
        if (reserved.includes(subdomain.toLowerCase())) {
            return res.json({
                available: false,
                message: 'Este subdomain está reservado'
            });
        }

        // Verificar en base de datos
        const result = await pool.query(
            'SELECT id FROM tenants WHERE subdomain = $1',
            [subdomain.toLowerCase()]
        );

        if (result.rows.length > 0) {
            return res.json({
                available: false,
                message: 'Este subdomain ya está en uso'
            });
        }

        res.json({
            available: true,
            message: 'Subdomain disponible',
            preview_url: `https://${subdomain}.operia.app`
        });

    } catch (error) {
        console.error('Error en check-subdomain:', error);
        res.status(500).json({ error: 'Error al verificar subdomain' });
    }
});

// ======================================================
// ===      LOGIN CON SOPORTE MULTI-TENANT            ===
// ======================================================

router.post('/login', jsonParser, optionalTenant, [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 1 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: 'Datos inválidos', detalles: errors.array() });
        }

        const { email, password } = req.body;

        // Buscar usuario (si hay subdomain, filtrar por tenant)
        let query = `
      SELECT u.*, t.subdomain, t.plan, t.subscription_status, t.name as tenant_name
      FROM users u
      JOIN tenants t ON u.tenant_id = t.id
      WHERE u.email = $1 AND u.is_active = true
    `;

        const params = [email];

        // Si hay tenant en el request (desde subdomain), filtrar
        if (req.tenantId) {
            query += ' AND u.tenant_id = $2';
            params.push(req.tenantId);
        }

        const result = await pool.query(query, params);

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        const user = result.rows[0];

        // Verificar contraseña
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        // Verificar estado de suscripción
        if (user.subscription_status === 'trial_expired' || user.subscription_status === 'suspended') {
            return res.status(403).json({
                error: 'Cuenta inactiva',
                message: 'Tu período de prueba ha finalizado. Por favor, actualiza tu plan.',
                upgrade_url: '/billing/upgrade'
            });
        }

        // Generar token con tenant_id
        const token = jwt.sign(
            {
                id: user.id,
                name: user.name,
                role: user.role,
                tenant_id: user.tenant_id
            },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );

        // Preparar respuesta sin password
        const { password: _, subscription_status, ...userWithoutPassword } = user;

        res.json({
            user: userWithoutPassword,
            token,
            tenant: {
                id: user.tenant_id,
                name: user.tenant_name,
                subdomain: user.subdomain,
                plan: user.plan
            }
        });

    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ======================================================
// ===      REGISTRO DE USUARIO EN TENANT EXISTENTE   ===
// ======================================================

router.post('/register', jsonParser, optionalTenant, [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('name').trim().isLength({ min: 2 }).escape(),
    // tenant_id is optional in body if provided via subdomain/header
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: 'Datos inválidos', detalles: errors.array() });
        }

        const { name, email, password, office } = req.body;
        // Use tenant_id from body OR from middleware (subdomain)
        const tenant_id = req.body.tenant_id || req.tenantId;

        if (!tenant_id) {
            return res.status(400).json({ error: 'Falta identificación de la organización (tenant_id o subdomain)' });
        }

        // Verificar que el tenant existe
        const tenantResult = await pool.query(
            'SELECT id, plan FROM tenants WHERE id = $1',
            [tenant_id]
        );

        if (tenantResult.rows.length === 0) {
            return res.status(404).json({ error: 'Organización no encontrada' });
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        const userResult = await pool.query(`
      INSERT INTO users (tenant_id, name, email, password, office, role, is_active)
      VALUES ($1, $2, $3, $4, $5, 'user', true)
      RETURNING id, tenant_id, name, email, office, role
    `, [tenant_id, name, email, hashedPassword, office || '']);

        const user = userResult.rows[0];

        // Generar token
        const token = jwt.sign(
            {
                id: user.id,
                name: user.name,
                role: user.role,
                tenant_id: user.tenant_id
            },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );

        res.status(201).json({
            success: true,
            user,
            token
        });

    } catch (error) {
        if (error.constraint === 'users_tenant_id_email_key') {
            return res.status(409).json({ error: 'El correo ya está registrado en esta organización' });
        }
        console.error('Error en register:', error);
        res.status(500).json({ error: 'Error al crear usuario' });
    }
});

// ======================================================
// ===      RESETEO DE CONTRASEÑA (sin cambios)       ===
// ======================================================

router.post('/forgot-password', jsonParser, [
    body('email').isEmail().normalizeEmail(),
    body('subdomain').optional().trim().isString()
], async (req, res) => {
    try {
        const { email, subdomain } = req.body;

        // Si se provee un subdomain, filtramos estricto. Si no (admin global), lo intentamos buscar.
        let query = 'SELECT u.*, t.subdomain FROM users u JOIN tenants t ON u.tenant_id = t.id WHERE u.email = $1';
        let params = [email];

        if (subdomain && subdomain !== 'www' && subdomain !== 'app' && subdomain !== 'admin') {
            query += ' AND t.subdomain = $2';
            params.push(subdomain);
        }

        const result = await pool.query(query, params);

        if (result.rows.length === 0) {
            return res.status(200).json({ message: 'Si existe una cuenta, se ha enviado un correo de recuperación.' });
        }

        const user = result.rows[0];
        const token = crypto.randomBytes(32).toString('hex');
        const expires = Date.now() + 3600000; // 1 hora

        await pool.query(
            'UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE id = $3',
            [token, expires, user.id]
        );

        const baseUrl = `https://${user.subdomain}.operia.app`;
        const resetLink = `${baseUrl}/reset-password.html?token=${token}`;

        const emailHtml = createEmailTemplate({
            title: 'Recuperación de Contraseña',
            recipientName: user.name,
            mainContentHtml: `
        <p>Has solicitado restablecer tu contraseña para tu cuenta en Operia.</p>
        <p style="color: #7F8C8D; font-size: 14px;">Este enlace es válido por 1 hora.</p>
      `,
            buttonUrl: resetLink,
            buttonText: 'Restablecer mi Contraseña'
        });

        await sendEmail(user.email, 'Recuperación de Contraseña - Operia', emailHtml);
        res.status(200).json({ message: 'Si existe una cuenta, se ha enviado un correo de recuperación.' });

    } catch (error) {
        console.error('Error en forgot-password:', error);
        res.status(500).json({ error: 'Error al procesar solicitud' });
    }
});

router.post('/reset-password', jsonParser, [
    body('newPassword').isLength({ min: 6 })
], async (req, res) => {
    try {
        const { token, newPassword } = req.body;

        const result = await pool.query(
            'SELECT * FROM users WHERE reset_token = $1 AND reset_token_expires > $2',
            [token, Date.now()]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'El token es inválido o ha expirado' });
        }

        const user = result.rows[0];
        const hashedPassword = await bcrypt.hash(newPassword, 12);

        await pool.query(
            'UPDATE users SET password = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2',
            [hashedPassword, user.id]
        );

        res.status(200).json({ success: true, message: '¡Contraseña actualizada con éxito!' });

    } catch (error) {
        console.error('Error en reset-password:', error);
        res.status(500).json({ error: 'Error al actualizar la contraseña' });
    }
});

// ======================================================
// ===      OBTENER DATOS DEL USUARIO ACTUAL          ===
// ======================================================

router.get('/me', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT u.id, u.tenant_id, u.name, u.email, u.office, u.role, u.avatar_url, u.email_notifications,
              t.name as tenant_name, t.subdomain, t.plan, t.subscription_status
       FROM users u
       JOIN tenants t ON u.tenant_id = t.id
       WHERE u.id = $1`,
            [req.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error en /me:', error);
        res.status(500).json({ error: 'Error al obtener datos del usuario' });
    }
});

module.exports = router;
