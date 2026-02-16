// backend/routes/onboarding.routes-postgres.js
// Onboarding wizard API endpoints
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const pool = require('../db-postgres');
const { authenticateToken } = require('../middleware/auth');
const { sendEmail } = require('../services/email.service');
const { createInvitationEmail } = require('../services/email-template.service');

const jsonParser = express.json({ limit: '10mb' });

// ======================================================
// ===      GET ONBOARDING STATUS                     ===
// ======================================================

router.get('/onboarding/status', authenticateToken, async (req, res) => {
    try {
        const { tenantId } = req;

        // Get tenant onboarding info
        const tenantResult = await pool.query(`
      SELECT 
        onboarding_step,
        onboarding_skipped_steps,
        onboarding_completed,
        onboarding_completed_at,
        plan,
        max_users
      FROM tenants
      WHERE id = $1
    `, [tenantId]);

        if (tenantResult.rows.length === 0) {
            return res.status(404).json({ error: 'Tenant no encontrado' });
        }

        const tenant = tenantResult.rows[0];

        // Get current user/task counts
        const statsResult = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM users WHERE tenant_id = $1) as user_count,
        (SELECT COUNT(*) FROM tasks WHERE tenant_id = $1) as task_count,
        (SELECT COUNT(*) FROM clients WHERE tenant_id = $1) as client_count
    `, [tenantId]);

        const stats = statsResult.rows[0];

        res.json({
            current_step: tenant.onboarding_step,
            skipped_steps: JSON.parse(tenant.onboarding_skipped_steps || '[]'),
            completed: tenant.onboarding_completed,
            completed_at: tenant.onboarding_completed_at,
            stats: {
                users: parseInt(stats.user_count),
                tasks: parseInt(stats.task_count),
                clients: parseInt(stats.client_count),
                max_users: tenant.max_users
            },
            plan: tenant.plan
        });

    } catch (err) {
        console.error('❌ Error al obtener estado de onboarding:', err);
        res.status(500).json({ error: 'Error al obtener estado' });
    }
});

// ======================================================
// ===      INVITE TEAM MEMBERS                       ===
// ======================================================

router.post('/onboarding/invite-users', jsonParser, [
    authenticateToken,
    body('invitations').isArray().withMessage('invitations debe ser un array'),
    body('invitations.*.email').isEmail().withMessage('Email inválido'),
    body('invitations.*.role').optional().isIn(['user', 'admin']).withMessage('Rol inválido')
], async (req, res) => {
    const client = await pool.connect();

    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { invitations } = req.body;
        const { userId, tenantId } = req;

        // Get tenant info for limits
        const tenantResult = await client.query(
            'SELECT name, max_users, subdomain FROM tenants WHERE id = $1',
            [tenantId]
        );

        if (tenantResult.rows.length === 0) {
            return res.status(404).json({ error: 'Tenant no encontrado' });
        }

        const tenant = tenantResult.rows[0];

        // Count current users
        const userCountResult = await client.query(
            'SELECT COUNT(*) as count FROM users WHERE tenant_id = $1',
            [tenantId]
        );

        const currentUserCount = parseInt(userCountResult.rows[0].count);
        const availableSlots = tenant.max_users - currentUserCount;

        if (invitations.length > availableSlots) {
            return res.status(400).json({
                error: 'Límite de usuarios excedido',
                message: `Tu plan permite ${tenant.max_users} usuarios. Actualmente tienes ${currentUserCount}. Solo puedes invitar ${availableSlots} más.`,
                available_slots: availableSlots,
                requested: invitations.length
            });
        }

        // Get inviting user info
        const inviterResult = await client.query(
            'SELECT name, email FROM users WHERE id = $1',
            [userId]
        );

        const inviter = inviterResult.rows[0];

        await client.query('BEGIN');

        const createdInvitations = [];

        for (const inv of invitations) {
            const { email, role = 'user', office = '' } = inv;

            // Check if email already exists
            const existingUser = await client.query(
                'SELECT id FROM users WHERE email = $1',
                [email]
            );

            if (existingUser.rows.length > 0) {
                createdInvitations.push({
                    email,
                    status: 'already_exists',
                    error: 'Este email ya está registrado'
                });
                continue;
            }

            // Check if already invited
            const existingInvitation = await client.query(
                'SELECT id FROM user_invitations WHERE tenant_id = $1 AND email = $2 AND accepted_at IS NULL',
                [tenantId, email]
            );

            if (existingInvitation.rows.length > 0) {
                createdInvitations.push({
                    email,
                    status: 'already_invited',
                    error: 'Ya existe una invitación pendiente para este email'
                });
                continue;
            }

            // Create invitation token
            const token = crypto.randomBytes(32).toString('hex');
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

            // Insert invitation
            const invResult = await client.query(`
        INSERT INTO user_invitations (tenant_id, email, role, office, invited_by, invitation_token, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, email, role, created_at
      `, [tenantId, email, role, office, userId, token, expiresAt]);

            const invitation = invResult.rows[0];

            // Send invitation email
            const invitationUrl = `${process.env.APP_URL || 'http://localhost:3000'}/accept-invitation?token=${token}`;

            const emailHtml = createInvitationEmail({
                recipientEmail: email,
                inviterName: inviter.name,
                companyName: tenant.name,
                invitationUrl: invitationUrl,
                expiresInDays: 7
            });

            try {
                await sendEmail(
                    email,
                    `${inviter.name} te invitó a unirte a ${tenant.name} en Operia`,
                    emailHtml
                );

                createdInvitations.push({
                    id: invitation.id,
                    email: invitation.email,
                    role: invitation.role,
                    status: 'sent',
                    created_at: invitation.created_at
                });
            } catch (emailError) {
                console.error('Error al enviar email de invitación:', emailError);
                createdInvitations.push({
                    id: invitation.id,
                    email: invitation.email,
                    role: invitation.role,
                    status: 'created_but_email_failed',
                    error: 'Invitación creada pero el email no se pudo enviar',
                    created_at: invitation.created_at
                });
            }
        }

        await client.query('COMMIT');

        res.status(201).json({
            success: true,
            invitations: createdInvitations,
            total_sent: createdInvitations.filter(i => i.status === 'sent').length,
            total_failed: createdInvitations.filter(i => i.status !== 'sent').length
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Error al crear invitaciones:', err);
        res.status(500).json({ error: 'Error al crear invitaciones' });
    } finally {
        client.release();
    }
});

// ======================================================
// ===      ACCEPT INVITATION                         ===
// ======================================================

router.post('/onboarding/accept-invitation', jsonParser, [
    body('token').notEmpty().withMessage('Token requerido'),
    body('name').trim().isLength({ min: 2 }).withMessage('Nombre requerido'),
    body('password').isLength({ min: 6 }).withMessage('Contraseña debe tener al menos 6 caracteres')
], async (req, res) => {
    const client = await pool.connect();

    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { token, name, password } = req.body;

        // Find invitation
        const invResult = await client.query(`
      SELECT i.*, t.subdomain, t.name as company_name
      FROM user_invitations i
      JOIN tenants t ON i.tenant_id = t.id
      WHERE i.invitation_token = $1 AND i.accepted_at IS NULL
    `, [token]);

        if (invResult.rows.length === 0) {
            return res.status(404).json({
                error: 'Invitación no encontrada',
                message: 'Esta invitación no existe o ya fue aceptada'
            });
        }

        const invitation = invResult.rows[0];

        // Check expiration
        if (new Date() > new Date(invitation.expires_at)) {
            return res.status(400).json({
                error: 'Invitación expirada',
                message: 'Esta invitación ha expirado. Solicita una nueva invitación.'
            });
        }

        const bcrypt = require('bcrypt');
        const jwt = require('jsonwebtoken');

        await client.query('BEGIN');

        // Create user account
        const hashedPassword = await bcrypt.hash(password, 12);

        const userResult = await client.query(`
      INSERT INTO users (tenant_id, name, email, password, office, role, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, true)
      RETURNING id, name, email, role, tenant_id
    `, [
            invitation.tenant_id,
            name,
            invitation.email,
            hashedPassword,
            invitation.office || '',
            invitation.role
        ]);

        const user = userResult.rows[0];

        // Mark invitation as accepted
        await client.query(
            'UPDATE user_invitations SET accepted_at = CURRENT_TIMESTAMP WHERE id = $1',
            [invitation.id]
        );

        await client.query('COMMIT');

        // Generate JWT
        const jwtToken = jwt.sign(
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
            message: 'Cuenta creada exitosamente',
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            },
            tenant: {
                id: invitation.tenant_id,
                name: invitation.company_name,
                subdomain: invitation.subdomain
            },
            token: jwtToken
        });

    } catch (err) {
        await client.query('ROLLBACK');

        if (err.constraint === 'users_tenant_id_email_key') {
            return res.status(409).json({
                error: 'Email ya registrado',
                message: 'Este email ya está registrado en esta organización'
            });
        }

        console.error('❌ Error al aceptar invitación:', err);
        res.status(500).json({ error: 'Error al aceptar invitación' });
    } finally {
        client.release();
    }
});

// ======================================================
// ===      UPDATE ONBOARDING STEP                    ===
// ======================================================

router.put('/onboarding/step', jsonParser, [
    authenticateToken,
    body('step').isInt({ min: 1, max: 5 }).withMessage('Step debe estar entre 1 y 5')
], async (req, res) => {
    try {
        const { step } = req.body;
        const { tenantId } = req;

        // Update current step
        await pool.query(
            'UPDATE tenants SET onboarding_step = $1 WHERE id = $2',
            [step, tenantId]
        );

        res.json({
            success: true,
            current_step: step
        });

    } catch (err) {
        console.error('❌ Error al actualizar paso:', err);
        res.status(500).json({ error: 'Error al actualizar paso' });
    }
});

// ======================================================
// ===      SKIP ONBOARDING STEP                      ===
// ======================================================

router.post('/onboarding/skip-step', jsonParser, [
    authenticateToken,
    body('step').isInt({ min: 1, max: 5 }).withMessage('Step debe estar entre 1 y 5')
], async (req, res) => {
    try {
        const { step } = req.body;
        const { tenantId } = req;

        // Get current skipped steps
        const result = await pool.query(
            'SELECT onboarding_skipped_steps FROM tenants WHERE id = $1',
            [tenantId]
        );

        const current = JSON.parse(result.rows[0].onboarding_skipped_steps || '[]');

        if (!current.includes(step)) {
            current.push(step);
        }

        // Update
        await pool.query(
            'UPDATE tenants SET onboarding_skipped_steps = $1 WHERE id = $2',
            [JSON.stringify(current), tenantId]
        );

        res.json({
            success: true,
            skipped_steps: current
        });

    } catch (err) {
        console.error('❌ Error al saltar paso:', err);
        res.status(500).json({ error: 'Error al saltar paso' });
    }
});

// ======================================================
// ===      COMPLETE ONBOARDING                       ===
// ======================================================

router.put('/onboarding/complete', authenticateToken, async (req, res) => {
    try {
        const { tenantId, userId } = req;

        // Mark as completed
        await pool.query(`
      UPDATE tenants 
      SET onboarding_completed = true, 
          onboarding_completed_at = CURRENT_TIMESTAMP,
          onboarding_step = 5
      WHERE id = $1
    `, [tenantId]);

        // Create welcome notification
        await pool.query(`
      INSERT INTO notifications (tenant_id, usuario_id, mensaje, tipo)
      VALUES ($1, $2, $3, $4)
    `, [
            tenantId,
            userId,
            '¡Bienvenido a Operia! Has completado el onboarding exitosamente.',
            'success'
        ]);

        res.json({
            success: true,
            message: 'Onboarding completado'
        });

    } catch (err) {
        console.error('❌ Error al completar onboarding:', err);
        res.status(500).json({ error: 'Error al completar onboarding' });
    }
});

module.exports = router;
