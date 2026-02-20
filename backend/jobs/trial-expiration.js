// backend/jobs/trial-expiration.js
const pool = require('../db-postgres');
const { sendEmail } = require('../services/email.service');
const { createEmailTemplate } = require('../services/email-template.service');

/**
 * Revisa todos los tenants cuyo trial_ends_at ha pasado
 * y su estado aún es 'trial'. Actualiza el estado a 'trial_expired'
 * y notifica a los administradores de esas organizaciones.
 */
async function processExpiredTrials() {
    console.log('🔍 Iniciando revisión de organizaciones con Trial vencido...');
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Buscar tenants vencidos y obtener sus datos + los datos del administrador
        const expiredQuery = `
      SELECT t.id, t.name, t.subdomain, u.email, u.name as admin_name
      FROM tenants t
      JOIN users u ON u.tenant_id = t.id
      WHERE t.subscription_status = 'trial' 
        AND t.trial_ends_at < CURRENT_TIMESTAMP
        AND u.role = 'admin'
    `;

        const result = await client.query(expiredQuery);

        if (result.rows.length === 0) {
            console.log('✅ No hay organizaciones con periodo de prueba vencido hoy.');
            await client.query('COMMIT');
            return;
        }

        console.log(`⚠️ Se encontraron ${result.rows.length} organizaciones con trial vencido.`);

        // 2. Extraer IDs para actualizar
        const tenantIds = result.rows.map(row => row.id);

        // 3. Actualizar estado en la base de datos
        await client.query(`
      UPDATE tenants 
      SET subscription_status = 'trial_expired'
      WHERE id = ANY($1)
    `, [tenantIds]);

        await client.query('COMMIT');
        console.log('✅ Base de datos actualizada: Estados cambiados a trial_expired.');

        // 4. Enviar correos a los administradores afectados
        for (const tenant of result.rows) {
            const emailHtml = createEmailTemplate({
                title: 'Tu período de prueba ha finalizado',
                recipientName: tenant.admin_name,
                mainContentHtml: `
          <p>Esperamos que hayas disfrutado probar Operia.</p>
          <p>Tu período de prueba de 14 días ha llegado a su fin y el acceso a tu espacio de trabajo (<strong>${tenant.subdomain}.operia.app</strong>) ha sido suspendido temporalmente.</p>
          <p>Para continuar utilizando la plataforma sin interrupciones y no perder tus datos, por favor actualiza tu suscripción a uno de nuestros planes de pago.</p>
        `,
                buttonUrl: `https://${tenant.subdomain}.operia.app/billing/upgrade`, // O la URL real de pagos
                buttonText: 'Renovar Suscripción'
            });

            try {
                await sendEmail(tenant.email, 'Operia - Período de prueba finalizado', emailHtml);
                console.log(`📧 Correo de expiración enviado a: ${tenant.email} (Tenant: ${tenant.name})`);
            } catch (emailErr) {
                console.error(`❌ Error al enviar correo de expiración a ${tenant.email}:`, emailErr);
            }
        }

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error crítico al procesar trials vencidos:', error);
    } finally {
        client.release();
    }
}

module.exports = { processExpiredTrials };
