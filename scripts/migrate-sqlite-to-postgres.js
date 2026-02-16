const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');
const path = require('path');

// Configuración de SQLite (origen)
const dbPath = path.join(__dirname, '../backend/database.sqlite');
const sqliteDb = new sqlite3.Database(dbPath);

// Configuración de PostgreSQL (destino)
const pgPool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://operia_user:operia_secure_2026!@localhost:5432/operia_production',
    ssl: false
});

// Función helper para promisificar SQLite
function sqliteAll(query, params = []) {
    return new Promise((resolve, reject) => {
        sqliteDb.all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

async function migrateSQLiteToPostgres() {
    const client = await pgPool.connect();

    try {
        console.log('🚀 Iniciando migración de SQLite a PostgreSQL...\n');

        await client.query('BEGIN');

        // ==========================================
        // 1. CREAR TENANT POR DEFECTO
        // ==========================================
        console.log('📦 Creando tenant por defecto...');
        const tenantResult = await client.query(`
      INSERT INTO tenants (name, subdomain, plan, subscription_status, onboarding_completed)
      VALUES ('Empresa Migrada', 'migrated', 'professional', 'active', true)
      ON CONFLICT (subdomain) DO UPDATE SET name = 'Empresa Migrada'
      RETURNING id
    `);
        const defaultTenantId = tenantResult.rows[0].id;
        console.log(`✅ Tenant creado con ID: ${defaultTenantId}\n`);

        // ==========================================
        // 2. MIGRAR USUARIOS
        // ==========================================
        console.log('👥 Migrando usuarios...');
        const users = await sqliteAll('SELECT * FROM users');
        let userCount = 0;

        for (const user of users) {
            await client.query(`
        INSERT INTO users (
          tenant_id, id, name, email, password, office, role, avatar_url,
          created_at, reset_token, reset_token_expires, email_notifications, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (tenant_id, email) DO NOTHING
      `, [
                defaultTenantId,
                user.id,
                user.name,
                user.email,
                user.password,
                user.office,
                user.role || 'user',
                user.avatar_url,
                user.created_at,
                user.reset_token,
                user.reset_token_expires,
                user.email_notifications !== 0,
                user.is_active !== 0
            ]);
            userCount++;
        }

        // Actualizar secuencia
        await client.query(`SELECT setval('users_id_seq', (SELECT MAX(id) FROM users))`);
        console.log(`✅ ${userCount} usuarios migrados\n`);

        // ==========================================
        // 3. MIGRAR CLIENTES
        // ==========================================
        console.log('🏢 Migrando clientes...');
        const clients = await sqliteAll('SELECT * FROM clients');
        let clientCount = 0;

        for (const client_data of clients) {
            await client.query(`
        INSERT INTO clients (
          tenant_id, id, rut, name, email, phone, address_street, commune, region, reference, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (rut) DO NOTHING
      `, [
                defaultTenantId,
                client_data.id,
                client_data.rut,
                client_data.name,
                client_data.email,
                client_data.phone,
                client_data.address_street,
                client_data.commune,
                client_data.region,
                client_data.reference,
                client_data.created_at
            ]);
            clientCount++;
        }

        await client.query(`SELECT setval('clients_id_seq', (SELECT MAX(id) FROM clients))`);
        console.log(`✅ ${clientCount} clientes migrados\n`);

        // ==========================================
        // 4. MIGRAR SEQUENCES
        // ==========================================
        console.log('🔢 Migrando sequences...');
        const sequences = await sqliteAll('SELECT * FROM sequences');

        for (const seq of sequences) {
            await client.query(`
        INSERT INTO sequences (tenant_id, prefix, last_number)
        VALUES ($1, $2, $3)
        ON CONFLICT (tenant_id, prefix) DO UPDATE SET last_number = $3
      `, [defaultTenantId, seq.prefix, seq.last_number]);
        }
        console.log(`✅ ${sequences.length} sequences migradas\n`);

        // ==========================================
        // 5. MIGRAR LABELS
        // ==========================================
        console.log('🏷️  Migrando labels...');
        const labels = await sqliteAll('SELECT * FROM labels');

        for (const label of labels) {
            await client.query(`
        INSERT INTO labels (tenant_id, id, name, color, created_by, created_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (tenant_id, name) DO NOTHING
      `, [defaultTenantId, label.id, label.name, label.color, label.created_by, label.created_at]);
        }

        await client.query(`SELECT setval('labels_id_seq', (SELECT MAX(id) FROM labels))`);
        console.log(`✅ ${labels.length} labels migradas\n`);

        // ==========================================
        // 6. MIGRAR CATEGORIES
        // ==========================================
        console.log('📂 Migrando categories...');
        const categories = await sqliteAll('SELECT * FROM categories');

        for (const cat of categories) {
            await client.query(`
        INSERT INTO categories (tenant_id, id, name, created_by, created_at)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (tenant_id, name) DO NOTHING
      `, [defaultTenantId, cat.id, cat.name, cat.created_by, cat.created_at]);
        }

        await client.query(`SELECT setval('categories_id_seq', (SELECT MAX(id) FROM categories))`);
        console.log(`✅ ${categories.length} categorías migradas\n`);

        // ==========================================
        // 7. MIGRAR TASKS
        // ==========================================
        console.log('📋 Migrando tasks...');
        const tasks = await sqliteAll('SELECT * FROM tasks');
        let taskCount = 0;

        for (const task of tasks) {
            await client.query(`
        INSERT INTO tasks (
          tenant_id, id, title, description, due_date, priority, status, created_by,
          created_at, completed_at, is_archived, responsible_user_id, observer_user_id,
          human_id, origin, shipping_type, payment_status, client_snapshot, client_reference
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      `, [
                defaultTenantId,
                task.id,
                task.title,
                task.description,
                task.due_date,
                task.priority || 'media',
                task.status || 'pendiente',
                task.created_by,
                task.created_at,
                task.completed_at,
                task.is_archived !== 0,
                task.responsible_user_id,
                task.observer_user_id,
                task.human_id,
                task.origin,
                task.shipping_type,
                task.payment_status,
                task.client_snapshot,
                task.client_reference
            ]);
            taskCount++;
        }

        await client.query(`SELECT setval('tasks_id_seq', (SELECT MAX(id) FROM tasks))`);
        console.log(`✅ ${taskCount} tasks migradas\n`);

        // ==========================================
        // 8. MIGRAR TASK_ASSIGNMENTS
        // ==========================================
        console.log('👤 Migrando task_assignments...');
        const assignments = await sqliteAll('SELECT * FROM task_assignments');

        for (const assignment of assignments) {
            await client.query(`
        INSERT INTO task_assignments (id, task_id, user_id)
        VALUES ($1, $2, $3)
        ON CONFLICT (task_id, user_id) DO NOTHING
      `, [assignment.id, assignment.task_id, assignment.user_id]);
        }

        await client.query(`SELECT setval('task_assignments_id_seq', (SELECT MAX(id) FROM task_assignments))`);
        console.log(`✅ ${assignments.length} asignaciones migradas\n`);

        // ==========================================
        // 9. MIGRAR TASK_LABELS
        // ==========================================
        console.log('🔗 Migrando task_labels...');
        const taskLabels = await sqliteAll('SELECT * FROM task_labels');

        for (const tl of taskLabels) {
            await client.query(`
        INSERT INTO task_labels (id, task_id, label_id)
        VALUES ($1, $2, $3)
        ON CONFLICT (task_id, label_id) DO NOTHING
      `, [tl.id, tl.task_id, tl.label_id]);
        }

        await client.query(`SELECT setval('task_labels_id_seq', (SELECT MAX(id) FROM task_labels))`);
        console.log(`✅ ${taskLabels.length} task_labels migradas\n`);

        // ==========================================
        // 10. MIGRAR COMMENTS
        // ==========================================
        console.log('💬 Migrando comments...');
        const comments = await sqliteAll('SELECT * FROM comments');

        for (const comment of comments) {
            await client.query(`
        INSERT INTO comments (id, task_id, contenido, autor_id, fecha_creacion)
        VALUES ($1, $2, $3, $4, $5)
      `, [comment.id, comment.task_id, comment.contenido, comment.autor_id, comment.fecha_creacion]);
        }

        await client.query(`SELECT setval('comments_id_seq', (SELECT MAX(id) FROM comments))`);
        console.log(`✅ ${comments.length} comentarios migrados\n`);

        // ==========================================
        // 11. MIGRAR ATTACHMENTS
        // ==========================================
        console.log('📎 Migrando attachments...');
        const attachments = await sqliteAll('SELECT * FROM attachments');

        for (const att of attachments) {
            await client.query(`
        INSERT INTO attachments (
          id, task_id, comment_id, file_path, file_name, file_type,
          file_size, uploaded_by, uploaded_at, attachment_type
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
                att.id, att.task_id, att.comment_id, att.file_path, att.file_name,
                att.file_type, att.file_size, att.uploaded_by, att.uploaded_at,
                att.attachment_type || 'general'
            ]);
        }

        await client.query(`SELECT setval('attachments_id_seq', (SELECT MAX(id) FROM attachments))`);
        console.log(`✅ ${attachments.length} attachments migrados\n`);

        // ==========================================
        // 12. MIGRAR NOTIFICATIONS
        // ==========================================
        console.log('🔔 Migrando notifications...');
        const notifications = await sqliteAll('SELECT * FROM notifications');

        for (const notif of notifications) {
            await client.query(`
        INSERT INTO notifications (id, usuario_id, mensaje, leida, tipo, task_id, fecha_creacion)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
                notif.id, notif.usuario_id, notif.mensaje, notif.leida !== 0,
                notif.tipo || 'info', notif.task_id, notif.fecha_creacion
            ]);
        }

        await client.query(`SELECT setval('notifications_id_seq', (SELECT MAX(id) FROM notifications))`);
        console.log(`✅ ${notifications.length} notificaciones migradas\n`);

        // ==========================================
        // 13. MIGRAR TECHNICAL_SHEETS
        // ==========================================
        console.log('📄 Migrando technical_sheets...');
        const sheets = await sqliteAll('SELECT * FROM technical_sheets');

        for (const sheet of sheets) {
            await client.query(`
        INSERT INTO technical_sheets (
          tenant_id, id, product_name, model, sku, category_id, tags,
          file_path, file_name, uploaded_by, uploaded_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
                defaultTenantId, sheet.id, sheet.product_name, sheet.model, sheet.sku,
                sheet.category_id, sheet.tags, sheet.file_path, sheet.file_name,
                sheet.uploaded_by, sheet.uploaded_at
            ]);
        }

        await client.query(`SELECT setval('technical_sheets_id_seq', (SELECT MAX(id) FROM technical_sheets))`);
        console.log(`✅ ${sheets.length} fichas técnicas migradas\n`);

        // ==========================================
        // 14. MIGRAR SENDER_CONFIG
        // ==========================================
        console.log('📮 Migrando sender_config...');
        const senderConfigs = await sqliteAll('SELECT * FROM sender_config');

        for (const config of senderConfigs) {
            await client.query(`
        INSERT INTO sender_config (
          tenant_id, id, name, rut, address, commune, region, phone, email,
          website, contact_person, contact_rut, thank_you_message, logo_path,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        ON CONFLICT (tenant_id) DO NOTHING
      `, [
                defaultTenantId, config.id, config.name, config.rut, config.address,
                config.commune, config.region, config.phone, config.email, config.website,
                config.contact_person, config.contact_rut, config.thank_you_message,
                config.logo_path, config.created_at, config.updated_at
            ]);
        }

        await client.query(`SELECT setval('sender_config_id_seq', (SELECT MAX(id) FROM sender_config))`);
        console.log(`✅ ${senderConfigs.length} sender_config migrados\n`);

        await client.query('COMMIT');

        console.log('\n✅✅✅ MIGRACIÓN COMPLETADA EXITOSAMENTE ✅✅✅\n');
        console.log('📊 Resumen:');
        console.log(`   - Usuarios: ${userCount}`);
        console.log(`   - Clientes: ${clientCount}`);
        console.log(`   - Tareas: ${taskCount}`);
        console.log(`   - Comentarios: ${comments.length}`);
        console.log(`   - Adjuntos: ${attachments.length}`);
        console.log(`\n🔗 Acceso: El tenant está disponible en subdomain 'migrated'`);

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error durante la migración:', error);
        throw error;
    } finally {
        client.release();
        sqliteDb.close();
        await pgPool.end();
    }
}

// Ejecutar migración
migrateSQLiteToPostgres().catch(err => {
    console.error('Error fatal:', err);
    process.exit(1);
});
