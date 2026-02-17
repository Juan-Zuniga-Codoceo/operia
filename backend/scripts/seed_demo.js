const { Pool } = require('pg');
const bcrypt = require('bcrypt');
require('dotenv').config({ path: '../.env.production' }); // Ajusta segÃºn ubicaciÃ³n

// ConfiguraciÃ³n de conexiÃ³n (igual que db-postgres.js)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const DEMO_TENANT_ID = 1;
const RESET_DATA = true; // Set to true to wipe existing demo data

async function seedDemoTenant() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        console.log('🌱 Starting Demo Tenant Seeding...');

        // 1. Ensure Tenant Exists
        // NOTE: We assume tenant ID 1 exists. If not, insert it (optional logic)
        // const tenantRes = await client.query('SELECT id FROM tenants WHERE id = $1', [DEMO_TENANT_ID]);
        // if (tenantRes.rows.length === 0) {
        //    await client.query("INSERT INTO tenants (id, name, subdomain) VALUES ($1, 'Demo Company', 'demo')", [DEMO_TENANT_ID]);
        // }

        if (RESET_DATA) {
            console.log('🧹 Cleaning up old demo data (tasks, clients, labels, users)...');
            // Delete dependent tables first
            await client.query('DELETE FROM attachments WHERE task_id IN (SELECT id FROM tasks WHERE tenant_id = $1)', [DEMO_TENANT_ID]);
            await client.query('DELETE FROM comments WHERE task_id IN (SELECT id FROM tasks WHERE tenant_id = $1)', [DEMO_TENANT_ID]);
            await client.query('DELETE FROM notifications WHERE tenant_id = $1', [DEMO_TENANT_ID]);
            await client.query('DELETE FROM tasks WHERE tenant_id = $1', [DEMO_TENANT_ID]);
            await client.query('DELETE FROM clients WHERE tenant_id = $1', [DEMO_TENANT_ID]);
            await client.query('DELETE FROM labels WHERE tenant_id = $1', [DEMO_TENANT_ID]);
            // Don't delete ALL users, just non-admin maybe? For safety, let's just upsert/reset users below.
            // await client.query('DELETE FROM users WHERE tenant_id = $1 AND email != \'admin@demo.com\'', [DEMO_TENANT_ID]);
            console.log('   ...Cleanup done.');
        }

        // 2. Seed Users
        console.log('👥 Seeding Users...');
        const passwordHash = await bcrypt.hash('123456', 10);

        const users = [
            { name: 'Admin Demo', email: 'admin@demo.com', role: 'admin', office: 'Gerencia' },
            { name: 'Operador Logístico', email: 'operaciones@demo.com', role: 'user', office: 'Bodega' },
            { name: 'Vendedor 1', email: 'ventas1@demo.com', role: 'user', office: 'Ventas' },
            { name: 'Soporte', email: 'soporte@demo.com', role: 'user', office: 'Soporte' }
        ];

        for (const u of users) {
            // Check if exists
            const check = await client.query('SELECT id FROM users WHERE email = $1 AND tenant_id = $2', [u.email, DEMO_TENANT_ID]);
            if (check.rows.length === 0) {
                await client.query(
                    'INSERT INTO users (tenant_id, name, email, password, role, office, is_active) VALUES ($1, $2, $3, $4, $5, $6, true)',
                    [DEMO_TENANT_ID, u.name, u.email, passwordHash, u.role, u.office]
                );
            } else {
                // Update password/role just in case
                await client.query(
                    'UPDATE users SET password = $1, role = $2 WHERE id = $3',
                    [passwordHash, u.role, check.rows[0].id]
                );
            }
        }

        // Get User IDs for assigning tasks
        const userRows = await client.query('SELECT id, email FROM users WHERE tenant_id = $1', [DEMO_TENANT_ID]);
        const adminId = userRows.rows.find(u => u.email === 'admin@demo.com')?.id;
        const opId = userRows.rows.find(u => u.email === 'operaciones@demo.com')?.id;

        // 3. Seed Labels
        console.log('🏷️ Seeding Labels...');
        const labels = [
            { name: 'Urgente', color: '#EF4444' },
            { name: 'Despacho', color: '#3B82F6' },
            { name: 'Oficina', color: '#10B981' },
            { name: 'Facturación', color: '#F59E0B' }
        ];

        for (const l of labels) {
            await client.query(
                'INSERT INTO labels (tenant_id, name, color) VALUES ($1, $2, $3)',
                [DEMO_TENANT_ID, l.name, l.color]
            );
        }

        // 4. Seed Clients
        console.log('🤝 Seeding Clients...');
        const clientsData = [
            { rut: '12.345.678-9', name: 'Almacenes Paris S.A.', email: 'contacto@paris.cl', phone: '+56911111111', address: 'Av. Kennedy 9001', commune: 'Las Condes' },
            { rut: '98.765.432-1', name: 'Constructora BioBio', email: 'finanzas@biobio.cl', phone: '+56922222222', address: 'Calle Limache 345', commune: 'Viña del Mar' },
            { rut: '11.223.344-5', name: 'Hospital Gustavo Fricke', email: 'adquisiciones@hospital.cl', phone: '+56933333333', address: 'Alvarez 1532', commune: 'Viña del Mar' },
            { rut: '55.666.777-K', name: 'Minera Escondida', email: 'logistica@minera.cl', phone: '+56944444444', address: 'Av. Industria 500', commune: 'Antofagasta' },
            { rut: '77.888.999-0', name: 'Juan Pérez (Particular)', email: 'jperez@gmail.com', phone: '+56955555555', address: 'Los Alerces 123', commune: 'Quilpué' }
        ];

        for (const c of clientsData) {
            await client.query(
                'INSERT INTO clients (tenant_id, rut, name, email, phone, address_street, commune) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                [DEMO_TENANT_ID, c.rut, c.name, c.email, c.phone, c.address, c.commune]
            );
        }

        // RE-FETCH Clients and Labels for linking
        const createdClients = (await client.query('SELECT id, name FROM clients WHERE tenant_id = $1', [DEMO_TENANT_ID])).rows;
        const createdLabels = (await client.query('SELECT id, name FROM labels WHERE tenant_id = $1', [DEMO_TENANT_ID])).rows;

        // 5. Seed Tasks
        console.log('📋 Seeding Tasks...');

        const tasksData = [
            { title: 'Envío Urgente a Paris', description: 'Despachar 50 unidades de insumos médicos. Prioridad alta.', status: 'pendiente', priority: 'alta', clientIdx: 0 },
            { title: 'Retiro en Tienda', description: 'Cliente pasará a retirar pedido #4032.', status: 'pendiente', priority: 'media', clientIdx: 4 },
            { title: 'Facturar Pedido BioBio', description: 'Emitir factura y enviar por mail.', status: 'en_camino', priority: 'media', clientIdx: 1 },
            { title: 'Revisión Stock Bodega', description: 'Tarea interna de inventario mensual.', status: 'en_camino', priority: 'baja', clientIdx: -1 }, // Internal
            { title: 'Mantenimiento Servidor', description: 'Actualizar parches de seguridad.', status: 'completada', priority: 'alta', clientIdx: -1 },
            { title: 'Cotización Minera', description: 'Enviar cotización formal a Minera Escondida.', status: 'pendiente', priority: 'media', clientIdx: 3 },
            { title: 'Despacho Insumos Fricke', description: 'Entregar en recepción de hospital.', status: 'pendiente', priority: 'alta', clientIdx: 2 },
            { title: 'Llamar a Cliente', description: 'Confirmar dirección de despacho Juan Pérez.', status: 'completada', priority: 'media', clientIdx: 4 },
            { title: 'Comprar Útiles Aseo', description: 'Reponer stock baño personal.', status: 'en_camino', priority: 'baja', clientIdx: -1 },
            { title: 'Reunión Equipo', description: 'Planificación semanal Lunes 9AM.', status: 'pendiente', priority: 'media', clientIdx: -1 }
        ];

        for (const t of tasksData) {
            let clientId = null;
            let snapshot = null;
            let shipType = null;

            if (t.clientIdx >= 0) {
                clientId = createdClients[t.clientIdx].id;
                snapshot = JSON.stringify(clientsData[t.clientIdx]); // Simple snapshot
                shipType = 'Starken';
            } else {
                shipType = 'Interno';
            }

            // Randomly assign labels
            const labelIds = [];
            if (t.priority === 'alta') labelIds.push(createdLabels.find(l => l.name === 'Urgente')?.id);
            if (t.clientIdx >= 0) labelIds.push(createdLabels.find(l => l.name === 'Despacho')?.id);
            if (t.clientIdx === -1) labelIds.push(createdLabels.find(l => l.name === 'Oficina')?.id);

            const res = await client.query(
                `INSERT INTO tasks (
                    tenant_id, title, description, status, priority, 
                    due_date, created_by, responsible_user_id, client_id, client_snapshot,
                    label_ids, label_names, shipping_type, created_at, completed_at
                ) VALUES ($1, $2, $3, $4, $5, NOW() + interval '1 day', $6, $7, $8, $9, $10, $11, $12, NOW(), $13) RETURNING id`,
                [
                    DEMO_TENANT_ID, t.title, t.description, t.status, t.priority,
                    adminId, opId, clientId, snapshot,
                    labelIds.filter(Boolean).join(','), // label_ids (string for now)
                    '', // label_names (deprecated/unused by updated logic usually, but keep empty)
                    shipType,
                    t.status === 'completada' ? new Date() : null
                ]
            );
        }

        await client.query('COMMIT');
        console.log('✅ Seeding Completed Successfully for Tenant ID:', DEMO_TENANT_ID);

    } catch (e) {
        await client.query('ROLLBACK');
        console.error('❌ Seeding Failed:', e);
    } finally {
        client.release();
        pool.end();
    }
}

seedDemoTenant();
