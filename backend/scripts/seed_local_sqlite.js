// backend/scripts/seed_local_sqlite.js
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

const dbPath = path.join(__dirname, '../database.sqlite');
console.log('🔌 Connecting to SQLite database at:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Failed to connect to local database:', err.message);
        process.exit(1);
    }
});

db.serialize(async () => {
    console.log('🧹 Cleaning up old demo data...');
    db.run("DELETE FROM attachments");
    db.run("DELETE FROM comments");
    db.run("DELETE FROM notifications");
    db.run("DELETE FROM task_assignments");
    db.run("DELETE FROM task_labels");
    db.run("DELETE FROM tasks");
    db.run("DELETE FROM clients");
    db.run("DELETE FROM labels");
    db.run("DELETE FROM users WHERE email != 'admin@operia.cl'");

    console.log('👥 Seeding Users...');
    const passwordHash = await bcrypt.hash('1234', 10);
    
    // Insert test users
    db.run("INSERT INTO users (name, email, password, office, role, is_active) VALUES (?, ?, ?, ?, ?, 1)", 
        ['Operador Logístico', 'operaciones@operia.cl', passwordHash, 'Bodega', 'user']);
    db.run("INSERT INTO users (name, email, password, office, role, is_active) VALUES (?, ?, ?, ?, ?, 1)", 
        ['Soporte Cliente', 'soporte@operia.cl', passwordHash, 'Oficina Central', 'user']);
    db.run("INSERT INTO users (name, email, password, office, role, is_active) VALUES (?, ?, ?, ?, ?, 1)", 
        ['Vendedor Central', 'ventas@operia.cl', passwordHash, 'Ventas', 'user']);

    // Seeding Labels
    db.run("INSERT INTO labels (name, color, created_by) VALUES ('Urgente', '#EF4444', 1)");
    db.run("INSERT INTO labels (name, color, created_by) VALUES ('Despacho', '#3B82F6', 1)");
    db.run("INSERT INTO labels (name, color, created_by) VALUES ('Oficina', '#10B981', 1)");
    db.run("INSERT INTO labels (name, color, created_by) VALUES ('Facturación', '#F59E0B', 1)");

    // Seeding Clients
    db.run("INSERT INTO clients (rut, name, email, phone, address_street, commune) VALUES ('12.345.678-9', 'Almacenes Paris S.A.', 'contacto@paris.cl', '+56911111111', 'Av. Kennedy 9001', 'Las Condes')");
    db.run("INSERT INTO clients (rut, name, email, phone, address_street, commune) VALUES ('98.765.432-1', 'Constructora BioBio', 'finanzas@biobio.cl', '+56922222222', 'Calle Limache 345', 'Viña del Mar')");
    db.run("INSERT INTO clients (rut, name, email, phone, address_street, commune) VALUES ('11.223.344-5', 'Hospital Gustavo Fricke', 'adquisiciones@hospital.cl', '+56933333333', 'Alvarez 1532', 'Viña del Mar')");
    db.run("INSERT INTO clients (rut, name, email, phone, address_street, commune) VALUES ('55.666.777-K', 'Minera Escondida', 'logistica@minera.cl', '+56944444444', 'Av. Industria 500', 'Antofagasta')");

    // Once everything is serialially inserted, query IDs to seed tasks
    db.all("SELECT id, name, rut, email, phone, address_street, commune FROM clients", [], (err, clients) => {
        if (err) {
            console.error('❌ Failed to fetch clients:', err);
            return;
        }

        db.all("SELECT id, name FROM labels", [], (err, labels) => {
            if (err) {
                console.error('❌ Failed to fetch labels:', err);
                return;
            }

            db.all("SELECT id, email FROM users", [], (err, users) => {
                if (err) {
                    console.error('❌ Failed to fetch users:', err);
                    return;
                }

                const adminUser = users.find(u => u.email === 'admin@operia.cl');
                const adminId = adminUser ? adminUser.id : 1;
                const opUser = users.find(u => u.email === 'operaciones@operia.cl');
                const opId = opUser ? opUser.id : 2;

                console.log('📋 Seeding Tasks...');
                const tasks = [
                    { title: 'Envío Urgente a Paris', description: 'Despachar 50 unidades de insumos médicos. Prioridad alta.', status: 'pendiente', priority: 'alta', clientIdx: 0 },
                    { title: 'Retiro en Tienda Fricke', description: 'Cliente pasará a retirar pedido #4032.', status: 'pendiente', priority: 'media', clientIdx: 2 },
                    { title: 'Facturar Pedido BioBio', description: 'Emitir factura y enviar por mail.', status: 'en_camino', priority: 'media', clientIdx: 1 },
                    { title: 'Revisión Stock Bodega', description: 'Tarea interna de inventario mensual.', status: 'en_camino', priority: 'baja', clientIdx: -1 },
                    { title: 'Mantenimiento Servidor', description: 'Actualizar parches de seguridad de producción.', status: 'completada', priority: 'alta', clientIdx: -1 },
                    { title: 'Cotización Minera formal', description: 'Enviar cotización formal a Minera Escondida.', status: 'pendiente', priority: 'media', clientIdx: 3 }
                ];

                tasks.forEach(t => {
                    let snapshot = null;
                    let shipType = 'Interno';

                    if (t.clientIdx >= 0 && clients[t.clientIdx]) {
                        const client = clients[t.clientIdx];
                        snapshot = JSON.stringify({
                            rut: client.rut,
                            name: client.name,
                            email: client.email,
                            phone: client.phone,
                            address: client.address_street,
                            commune: client.commune
                        });
                        shipType = 'Starken';
                    }

                    const completedAt = t.status === 'completada' ? new Date().toISOString() : null;

                    db.run(`
                        INSERT INTO tasks (
                            title, description, due_date, priority, status, 
                            created_by, responsible_user_id, shipping_type, client_snapshot, completed_at
                        ) VALUES (?, ?, datetime('now', '+1 day'), ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        t.title,
                        t.description,
                        t.priority,
                        t.status,
                        adminId,
                        opId,
                        shipType,
                        snapshot,
                        completedAt
                    ], function (err) {
                        if (err) {
                            console.error('❌ Failed to insert task:', err);
                            return;
                        }
                        const taskId = this.lastID;

                        // Link labels
                        if (t.priority === 'alta') {
                            const l = labels.find(lbl => lbl.name === 'Urgente');
                            if (l) db.run("INSERT INTO task_labels (task_id, label_id) VALUES (?, ?)", [taskId, l.id]);
                        }
                        if (t.clientIdx >= 0) {
                            const l = labels.find(lbl => lbl.name === 'Despacho');
                            if (l) db.run("INSERT INTO task_labels (task_id, label_id) VALUES (?, ?)", [taskId, l.id]);
                        } else {
                            const l = labels.find(lbl => lbl.name === 'Oficina');
                            if (l) db.run("INSERT INTO task_labels (task_id, label_id) VALUES (?, ?)", [taskId, l.id]);
                        }
                    });
                });

                console.log('✅ Seeding execution completed successfully!');
            });
        });
    });
});

