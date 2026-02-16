// backend/routes/payments.routes-postgres.js
// Payment routes with Flow integration
const express = require('express');
const router = express.Router();
const pool = require('../db-postgres');
const { authenticateToken } = require('../middleware/auth');
const flowService = require('../services/flow.service');

// ======================================================
// ===      CREATE PAYMENT (INICIAR PAGO)            ===
// ======================================================

router.post('/create', authenticateToken, async (req, res) => {
    try {
        const { plan } = req.body;
        const { tenantId, userId, email } = req;

        // Validar plan
        const validPlans = ['starter', 'professional', 'business', 'enterprise'];
        if (!plan || !validPlans.includes(plan.toLowerCase())) {
            return res.status(400).json({ error: 'Plan inválido' });
        }

        // Si es plan starter (gratis), no requiere pago
        if (plan.toLowerCase() === 'starter') {
            return res.status(400).json({
                error: 'El plan Starter es gratuito y no requiere pago'
            });
        }

        // Obtener información del tenant
        const tenantResult = await pool.query(
            'SELECT id, name, subdomain FROM tenants WHERE id = $1',
            [tenantId]
        );

        if (tenantResult.rows.length === 0) {
            return res.status(404).json({ error: 'Tenant no encontrado' });
        }

        const tenant = tenantResult.rows[0];

        // Generar commerceOrder único
        const commerceOrder = flowService.generateCommerceOrder(tenantId, plan);

        // Obtener monto y descripción del plan
        const amount = flowService.getPlanAmount(plan);
        const subject = flowService.getPlanDescription(plan);

        // URLs de retorno
        const baseUrl = process.env.APP_DOMAIN === 'localhost'
            ? `http://${tenant.subdomain}.localhost:${process.env.PORT || 3000}`
            : `https://${tenant.subdomain}.${process.env.APP_DOMAIN}`;

        const urlReturn = `${baseUrl}/payment-result`;
        const urlConfirmation = process.env.FLOW_WEBHOOK_URL || `${baseUrl}/api/payments/webhook`;

        // Crear registro de pago en base de datos (estado pending)
        const paymentResult = await pool.query(
            `INSERT INTO payments (tenant_id, flow_order, plan, amount, status, created_at)
             VALUES ($1, $2, $3, $4, 'pending', CURRENT_TIMESTAMP)
             RETURNING id`,
            [tenantId, commerceOrder, plan, amount]
        );

        const paymentId = paymentResult.rows[0].id;

        // Crear pago en Flow
        const flowResponse = await flowService.createPayment({
            commerceOrder: commerceOrder,
            subject: subject,
            amount: amount,
            email: email,
            urlConfirmation: urlConfirmation,
            urlReturn: urlReturn
        });

        if (!flowResponse.success) {
            // Actualizar estado a failed
            await pool.query(
                'UPDATE payments SET status = $1 WHERE id = $2',
                ['failed', paymentId]
            );

            return res.status(500).json({
                error: 'Error al crear pago en Flow',
                details: flowResponse.error
            });
        }

        // Actualizar con token de Flow
        await pool.query(
            'UPDATE payments SET flow_token = $1 WHERE id = $2',
            [flowResponse.token, paymentId]
        );

        res.json({
            success: true,
            paymentId: paymentId,
            paymentUrl: flowResponse.url,
            commerceOrder: commerceOrder,
            amount: amount,
            plan: plan
        });

    } catch (err) {
        console.error('❌ Error al crear pago:', err);
        res.status(500).json({ error: 'Error al crear pago' });
    }
});

// ======================================================
// ===      WEBHOOK (CONFIRMACIÓN DE FLOW)           ===
// ======================================================
// NOTA: Este endpoint NO requiere autenticación porque Flow lo llama directamente

router.post('/webhook', async (req, res) => {
    try {
        const { token } = req.body;

        if (!token) {
            return res.status(400).send('Token no proporcionado');
        }

        console.log('📥 Webhook recibido de Flow, token:', token);

        // Obtener estado del pago desde Flow
        const statusResponse = await flowService.getPaymentStatus(token);

        if (!statusResponse.success) {
            console.error('❌ Error al obtener estado de pago:', statusResponse.error);
            return res.status(500).send('Error al verificar pago');
        }

        const paymentData = statusResponse.data;
        console.log('💳 Datos del pago:', paymentData);

        // Buscar el pago en nuestra base de datos
        const paymentResult = await pool.query(
            'SELECT * FROM payments WHERE flow_order = $1',
            [paymentData.commerceOrder]
        );

        if (paymentResult.rows.length === 0) {
            console.error('❌ Pago no encontrado:', paymentData.commerceOrder);
            return res.status(404).send('Pago no encontrado');
        }

        const payment = paymentResult.rows[0];

        // Verificar estado del pago en Flow
        if (paymentData.status === 2) { // 2 = Pagado
            console.log('✅ Pago confirmado:', paymentData.commerceOrder);

            // Actualizar estado del pago
            await pool.query(
                `UPDATE payments 
                 SET status = 'completed', 
                     paid_at = CURRENT_TIMESTAMP,
                     flow_token = $1
                 WHERE id = $2`,
                [token, payment.id]
            );

            // Actualizar plan del tenant con límites correspondientes
            const nextBillingDate = new Date();
            nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);

            const flowService = require('../services/flow.service');
            const limits = flowService.getPlanLimits(payment.plan);

            await pool.query(
                `UPDATE tenants 
                 SET plan = $1, 
                     subscription_status = 'active',
                     trial_ends_at = NULL,
                     next_billing_date = $2,
                     max_users = $3,
                     max_clients = $4,
                     storage_limit_mb = $5,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $6`,
                [payment.plan, nextBillingDate, limits.max_users, limits.max_clients, limits.storage_limit_mb, payment.tenant_id]
            );

            console.log(`✅ Plan actualizado a ${payment.plan} para tenant ${payment.tenant_id}`);

            // TODO: Enviar email de confirmación al usuario

            res.status(200).send('OK');
        } else {
            console.log('⚠️ Pago no completado, estado:', paymentData.status);

            // Actualizar estado según el estado de Flow
            let status = 'pending';
            if (paymentData.status === 3) status = 'rejected';
            if (paymentData.status === 4) status = 'cancelled';

            await pool.query(
                'UPDATE payments SET status = $1 WHERE id = $2',
                [status, payment.id]
            );

            res.status(200).send('OK');
        }

    } catch (err) {
        console.error('❌ Error en webhook:', err);
        res.status(500).send('Error interno');
    }
});

// ======================================================
// ===      GET PAYMENT STATUS (VERIFICAR PAGO)      ===
// ======================================================

router.get('/status/:paymentId', authenticateToken, async (req, res) => {
    try {
        const { paymentId } = req.params;
        const { tenantId } = req;

        const result = await pool.query(
            'SELECT * FROM payments WHERE id = $1 AND tenant_id = $2',
            [paymentId, tenantId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Pago no encontrado' });
        }

        const payment = result.rows[0];

        // Si tiene token de Flow, obtener estado actualizado
        if (payment.flow_token) {
            const flowStatus = await flowService.getPaymentStatus(payment.flow_token);

            if (flowStatus.success) {
                res.json({
                    id: payment.id,
                    commerceOrder: payment.flow_order,
                    plan: payment.plan,
                    amount: payment.amount,
                    status: payment.status,
                    createdAt: payment.created_at,
                    paidAt: payment.paid_at,
                    flowStatus: flowStatus.data
                });
            } else {
                res.json({
                    id: payment.id,
                    commerceOrder: payment.flow_order,
                    plan: payment.plan,
                    amount: payment.amount,
                    status: payment.status,
                    createdAt: payment.created_at,
                    paidAt: payment.paid_at
                });
            }
        } else {
            res.json({
                id: payment.id,
                commerceOrder: payment.flow_order,
                plan: payment.plan,
                amount: payment.amount,
                status: payment.status,
                createdAt: payment.created_at,
                paidAt: payment.paid_at
            });
        }

    } catch (err) {
        console.error('❌ Error al obtener estado de pago:', err);
        res.status(500).json({ error: 'Error al obtener estado de pago' });
    }
});

// ======================================================
// ===      GET PAYMENT HISTORY (HISTORIAL)          ===
// ======================================================

router.get('/history', authenticateToken, async (req, res) => {
    try {
        const { tenantId } = req;

        const result = await pool.query(
            `SELECT id, flow_order, plan, amount, status, created_at, paid_at
             FROM payments
             WHERE tenant_id = $1
             ORDER BY created_at DESC
             LIMIT 50`,
            [tenantId]
        );

        res.json({
            payments: result.rows,
            total: result.rows.length
        });

    } catch (err) {
        console.error('❌ Error al obtener historial de pagos:', err);
        res.status(500).json({ error: 'Error al obtener historial' });
    }
});

// ======================================================
// ===      GET CURRENT SUBSCRIPTION                 ===
// ======================================================

router.get('/subscription', authenticateToken, async (req, res) => {
    try {
        const { tenantId } = req;

        const result = await pool.query(
            `SELECT plan, subscription_status, trial_ends_at, next_billing_date, 
                    max_users, max_clients, storage_limit_mb
             FROM tenants
             WHERE id = $1`,
            [tenantId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Tenant no encontrado' });
        }

        const subscription = result.rows[0];

        // Calcular días restantes de trial
        let trialDaysLeft = null;
        if (subscription.trial_ends_at) {
            const now = new Date();
            const trialEnd = new Date(subscription.trial_ends_at);
            const diffTime = trialEnd - now;
            trialDaysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        }

        res.json({
            plan: subscription.plan,
            status: subscription.subscription_status,
            trialEndsAt: subscription.trial_ends_at,
            trialDaysLeft: trialDaysLeft,
            nextBillingDate: subscription.next_billing_date,
            limits: {
                maxUsers: subscription.max_users,
                maxClients: subscription.max_clients,
                storageLimitMb: subscription.storage_limit_mb
            }
        });

    } catch (err) {
        console.error('❌ Error al obtener suscripción:', err);
        res.status(500).json({ error: 'Error al obtener suscripción' });
    }
});

// ======================================================
// ===      CANCEL SUBSCRIPTION                      ===
// ======================================================

router.post('/cancel', authenticateToken, async (req, res) => {
    try {
        const { tenantId } = req;

        // Actualizar a plan starter (gratis) con límites actualizados
        await pool.query(
            `UPDATE tenants 
             SET plan = 'starter',
                 subscription_status = 'cancelled',
                 next_billing_date = NULL,
                 max_users = 5,
                 max_clients = 100,
                 storage_limit_mb = 500,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [tenantId]
        );

        res.json({
            success: true,
            message: 'Suscripción cancelada. Tu cuenta ha sido cambiada al plan Starter.'
        });

    } catch (err) {
        console.error('❌ Error al cancelar suscripción:', err);
        res.status(500).json({ error: 'Error al cancelar suscripción' });
    }
});

module.exports = router;
