// Script para poblar Operia con datos de prueba realistas para video publicitario (PostgreSQL)
require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const poolConfig = process.env.DATABASE_URL ? {
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false
} : {
    host: process.env.PGHOST,
    port: process.env.PGPORT,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false
};

const pool = new Pool(poolConfig);

console.log('🎬 Iniciando población de datos demo para video Operia (PostgreSQL)...\n');

// IMPORTANTE: Usamos tenant_id = 1 (tenant 'demo' que ya existe)
const TENANT_ID = 1;

// Datos realistas chilenos
const USERS = [
    { name: 'Juan Pérez', email: 'juan.perez@operia.cl', office: 'Valparaíso', role: 'admin' },
    { name: 'María González', email: 'maria.gonzalez@operia.cl', office: 'Valparaíso', role: 'user' },
    { name: 'Carlos Rojas', email: 'carlos.rojas@operia.cl', office: 'Quilpué', role: 'user' },
    { name: 'Andrea Silva', email: 'andrea.silva@operia.cl', office: 'Viña del Mar', role: 'user' },
    { name: 'Roberto Muñoz', email: 'roberto.munoz@operia.cl', office: 'Valparaíso', role: 'user' },
    { name: 'Patricia Torres', email: 'patricia.torres@operia.cl', office: 'Quilpué', role: 'user' },
    { name: 'Diego Fernández', email: 'diego.fernandez@operia.cl', office: 'Bodega', role: 'user' },
    { name: 'Camila Vargas', email: 'camila.vargas@operia.cl', office: 'Viña del Mar', role: 'user' },
    { name: 'Fernando Castro', email: 'fernando.castro@operia.cl', office: 'Bodega', role: 'user' },
    { name: 'Valentina Soto', email: 'valentina.soto@operia.cl', office: 'Valparaíso', role: 'user' }
];

const CLIENTS = [
    {
        rut: '76.456.789-0',
        name: 'Constructora del Pacífico SpA',
        email: 'ventas@construccpacifico.cl',
        phone: '+56 32 2234567',
        address_street: 'Av. Brasil 2145',
        commune: 'Valparaíso',
        region: 'Valparaíso',
        reference: 'Cliente Premium - Edificio Azul'
    },
    {
        rut: '78.123.456-2',
        name: 'Supermercados La Esquina Ltda',
        email: 'compras@laesquina.cl',
        phone: '+56 32 2345678',
        address_street: 'Calle Condell 1456',
        commune: 'Quilpué',
        region: 'Valparaíso',
        reference: 'Cadena con 8 locales'
    },
    {
        rut: '77.987.654-1',
        name: 'Hotel Vista al Mar',
        email: 'administracion@hotelvistaalmar.cl',
        phone: '+56 32 2456789',
        address_street: 'Av. Marina 890',
        commune: 'Viña del Mar',
        region: 'Valparaíso',
        reference: 'Hotel 5 estrellas'
    },
    {
        rut: '79.234.567-8',
        name: 'Clínica Salud Integral',
        email: 'suministros@clinicasalud.cl',
        phone: '+56 32 2567890',
        address_street: 'Av. Libertad 2340',
        commune: 'Viña del Mar',
        region: 'Valparaíso',
        reference: 'Clínica con 3 sedes'
    },
    {
        rut: '76.789.012-3',
        name: 'Restaurant El Marino',
        email: 'contacto@elmarino.cl',
        phone: '+56 32 2678901',
        address_street: 'Muelle Prat 567',
        commune: 'Valparaíso',
        region: 'Valparaíso',
        reference: 'Restaurant tradicional'
    },
    {
        rut: '78.345.678-9',
        name: 'Colegio Nueva Educación',
        email: 'direccion@colegionuevaedu.cl',
        phone: '+56 32 2789012',
        address_street: 'Av. Alessandri 1234',
        commune: 'Quilpué',
        region: 'Valparaíso',
        reference: 'Colegio particular'
    },
    {
        rut: '77.456.123-4',
        name: 'Farmacia Cruz Verde Local 45',
        email: 'gerencia.local45@cruzverde.cl',
        phone: '+56 32 2890123',
        address_street: 'Av. Valparaíso 890',
        commune: 'Viña del Mar',
        region: 'Valparaíso',
        reference: 'Local franquicia'
    },
    {
        rut: '79.567.234-5',
        name: 'Inmobiliaria Costa Azul',
        email: 'ventas@inmocostaazul.cl',
        phone: '+56 32 2901234',
        address_street: 'Av. España 1567',
        commune: 'Valparaíso',
        region: 'Valparaíso',
        reference: 'Cliente recurrente mensual'
    },
    {
        rut: '76.678.345-6',
        name: 'Autoservicio Central',
        email: 'pedidos@autoserviciocentral.cl',
        phone: '+56 32 2012345',
        address_street: 'Calle Freire 2345',
        commune: 'Quilpué',
        region: 'Valparaíso',
        reference: 'Minimarket 24hrs'
    },
    {
        rut: '78.789.456-7',
        name: 'Centro Médico Familiar',
        email: 'recepcion@centromedico.cl',
        phone: '+56 32 2123456',
        address_street: 'Av. San Martín 890',
        commune: 'Viña del Mar',
        region: 'Valparaíso',
        reference: 'Centro médico ambulatorio'
    },
    {
        rut: '77.890.567-8',
        name: 'Panadería y Pastelería Don Juan',
        email: 'donjuan@pasteleriadonjuan.cl',
        phone: '+56 32 2234567',
        address_street: 'Calle Esmeralda 456',
        commune: 'Valparaíso',
        region: 'Valparaíso',
        reference: 'Negocio familiar tradicional'
    },
    {
        rut: '79.901.678-9',
        name: 'Librería Universitaria',
        email: 'ventas@libreriauniv.cl',
        phone: '+56 32 2345678',
        address_street: 'Av. Errázuriz 1234',
        commune: 'Valparaíso',
        region: 'Valparaíso',
        reference: 'Librería especializada'
    },
    {
        rut: '76.012.789-0',
        name: 'Gym Fitness Pro',
        email: 'info@fitnesspro.cl',
        phone: '+56 32 2456789',
        address_street: 'Av. Libertad 789',
        commune: 'Viña del Mar',
        region: 'Valparaíso',
        reference: 'Gimnasio con 2 sedes'
    },
    {
        rut: '78.123.890-1',
        name: 'Boutique Moda Chic',
        email: 'contacto@modachic.cl',
        phone: '+56 32 2567890',
        address_street: 'Calle Arlegui 567',
        commune: 'Viña del Mar',
        region: 'Valparaíso',
        reference: 'Boutique de ropa'
    },
    {
        rut: '77.234.901-2',
        name: 'Distribuidora Alimentos del Puerto',
        email: 'ventas@alimentospuerto.cl',
        phone: '+56 32 2678901',
        address_street: 'Av. Argentina 2345',
        commune: 'Valparaíso',
        region: 'Valparaíso',
        reference: 'Mayorista de alimentos'
    }
];

const TASKS_INTERNAL = [
    {
        title: 'Actualizar inventario bodega central',
        description: 'Revisar y actualizar sistema de inventario con productos nuevos del mes',
        priority: 'alta',
        status: 'En camino',
        origin: 'Bodega'
    },
    {
        title: 'Capacitación equipo ventas',
        description: 'Capacitación sobre nuevos productos y protocolos de atención al cliente',
        priority: 'media',
        status: 'Pendiente',
        origin: 'Valparaíso'
    },
    {
        title: 'Mantenimiento flota vehículos',
        description: 'Revisión técnica y mantenimiento preventivo de 3 camionetas de reparto',
        priority: 'alta',
        status: 'Completado',
        origin: 'Quilpué'
    },
    {
        title: 'Auditoría equipos de seguridad',
        description: 'Inspección mensual de extintores, salidas de emergencia y señalética',
        priority: 'alta',
        status: 'En camino',
        origin: 'Valparaíso'
    },
    {
        title: 'Reunión planificación trimestral',
        description: 'Reunión de equipo para revisar objetivos y metas del próximo trimestre',
        priority: 'media',
        status: 'Pendiente',
        origin: 'Valparaíso'
    },
    {
        title: 'Actualizar sistema informático',
        description: 'Migración de datos y actualización del software de gestión',
        priority: 'alta',
        status: 'En camino',
        origin: 'Bodega'
    },
    {
        title: 'Optimizar rutas de reparto',
        description: 'Análisis y optimización de rutas para reducir tiempos y costos',
        priority: 'media',
        status: 'Pendiente',
        origin: 'Quilpué'
    },
    {
        title: 'Informe mensual de ventas',
        description: 'Elaborar reporte consolidado de ventas del mes anterior',
        priority: 'alta',
        status: 'Completado',
        origin: 'Valparaíso'
    },
    {
        title: 'Limpieza profunda bodega',
        description: 'Limpieza y reorganización de espacios de almacenamiento',
        priority: 'baja',
        status: 'Pendiente',
        origin: 'Bodega'
    },
    {
        title: 'Renovación certificaciones ISO',
        description: 'Preparar documentación y auditoría para renovación de certificaciones',
        priority: 'alta',
        status: 'En camino',
        origin: 'Valparaíso'
    }
];

const TASKS_CLIENTS = [
    {
        title: 'Entrega materiales Constructora del Pacífico',
        description: '500 sacos de cemento + 100 planchas de yeso. Obra Edificio Azul',
        priority: 'alta',
        status: 'En camino',
        origin: 'Valparaíso',
        clientIndex: 0,
        shipping_type: 'Retiro en tienda',
        payment_status: 'Pagado'
    },
    {
        title: 'Pedido semanal Supermercados La Esquina',
        description: 'Abarrotes variados según lista adjunta. 8 locales',
        priority: 'alta',
        status: 'Pendiente',
        origin: 'Quilpué',
        clientIndex: 1,
        shipping_type: 'Despacho domicilio',
        payment_status: 'Pendiente'
    },
    {
        title: 'Suministros Hotel Vista al Mar',
        description: 'Productos de limpieza y amenities para habitaciones',
        priority: 'media',
        status: 'Completado',
        origin: 'Viña del Mar',
        clientIndex: 2,
        shipping_type: 'Despacho domicilio',
        payment_status: 'Pagado'
    },
    {
        title: 'Equipamiento médico Clínica Salud Integral',
        description: 'Insumos médicos y material de curación. Urgente para sede central',
        priority: 'alta',
        status: 'En camino',
        origin: 'Viña del Mar',
        clientIndex: 3,
        shipping_type: 'Despacho domicilio',
        payment_status: 'Pagado'
    },
    {
        title: 'Provisión Restaurant El Marino',
        description: 'Productos frescos y congelados para el fin de semana',
        priority: 'alta',
        status: 'Pendiente',
        origin: 'Valparaíso',
        clientIndex: 4,
        shipping_type: 'Despacho domicilio',
        payment_status: 'Pendiente'
    },
    {
        title: 'Material didáctico Colegio Nueva Educación',
        description: 'Útiles escolares y material de arte para talleres',
        priority: 'media',
        status: 'Completado',
        origin: 'Quilpué',
        clientIndex: 5,
        shipping_type: 'Retiro en tienda',
        payment_status: 'Pagado'
    },
    {
        title: 'Reposición Farmacia Cruz Verde',
        description: 'Medicamentos y productos de cuidado personal',
        priority: 'alta',
        status: 'En camino',
        origin: 'Viña del Mar',
        clientIndex: 6,
        shipping_type: 'Despacho domicilio',
        payment_status: 'Pagado'
    },
    {
        title: 'Materiales Inmobiliaria Costa Azul',
        description: 'Señalética y material promocional para proyecto nuevo',
        priority: 'media',
        status: 'Pendiente',
        origin: 'Valparaíso',
        clientIndex: 7,
        shipping_type: 'Retiro en tienda',
        payment_status: 'Pendiente'
    },
    {
        title: 'Pedido Autoservicio Central',
        description: 'Reposición semanal de bebidas y snacks',
        priority: 'media',
        status: 'Completado',
        origin: 'Quilpué',
        clientIndex: 8,
        shipping_type: 'Despacho domicilio',
        payment_status: 'Pagado'
    },
    {
        title: 'Insumos Centro Médico Familiar',
        description: 'Material de oficina y formularios médicos',
        priority: 'baja',
        status: 'Pendiente',
        origin: 'Viña del Mar',
        clientIndex: 9,
        shipping_type: 'Despacho domicilio',
        payment_status: 'Pendiente'
    },
    {
        title: 'Insumos Panadería Don Juan',
        description: 'Harina, levadura y materias primas para producción',
        priority: 'alta',
        status: 'En camino',
        origin: 'Valparaíso',
        clientIndex: 10,
        shipping_type: 'Despacho domicilio',
        payment_status: 'Pagado'
    },
    {
        title: 'Libros Librería Universitaria',
        description: 'Pedido especial de textos académicos para temporada',
        priority: 'media',
        status: 'Completado',
        origin: 'Valparaíso',
        clientIndex: 11,
        shipping_type: 'Retiro en tienda',
        payment_status: 'Pagado'
    },
    {
        title: 'Equipamiento Gym Fitness Pro',
        description: 'Máquinas y accesorios para nueva sede',
        priority: 'alta',
        status: 'Pendiente',
        origin: 'Viña del Mar',
        clientIndex: 12,
        shipping_type: 'Despacho domicilio',
        payment_status: 'Pendiente'
    },
    {
        title: 'Mercadería Boutique Moda Chic',
        description: 'Colección nueva temporada otoño-invierno',
        priority: 'media',
        status: 'En camino',
        origin: 'Viña del Mar',
        clientIndex: 13,
        shipping_type: 'Despacho domicilio',
        payment_status: 'Pagado'
    },
    {
        title: 'Pedido mensual Distribuidora Alimentos',
        description: 'Productos no perecibles para reventa',
        priority: 'alta',
        status: 'Completado',
        origin: 'Valparaíso',
        clientIndex: 14,
        shipping_type: 'Retiro en tienda',
        payment_status: 'Pagado'
    }
];

const LABELS = [
    { name: 'Urgente', color: '#ef4444' },
    { name: 'Cliente Premium', color: '#8b5cf6' },
    { name: 'Interno', color: '#06b6d4' },
    { name: 'Entrega', color: '#10b981' },
    { name: 'Seguimiento', color: '#f59e0b' },
    { name: 'Inventario', color: '#6366f1' }
];

// Función auxiliar para fechas
function randomDate(daysAgo, daysAhead) {
    const date = new Date();
    const offset = Math.floor(Math.random() * (daysAhead + daysAgo)) - daysAgo;
    date.setDate(date.getDate() + offset);
    return date.toISOString();
}

// Función principal
async function seedData() {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const defaultPassword = await bcrypt.hash('demo2024', 10);

        console.log('👥 Obteniendo usuarios existentes...');
        
        let userIds = [];
        const adminResult = await client.query('SELECT id FROM users WHERE tenant_id = $1 AND email = \'admin@demo.operia.app\'', [TENANT_ID]);
        if (adminResult.rows.length > 0) {
            userIds.push(adminResult.rows[0].id);
        }

        console.log('Creando o actualizando usuarios demo...');
        for (const user of USERS) {
            // Verificar si ya existe para evitar colisión de índice único
            const check = await client.query('SELECT id FROM users WHERE tenant_id = $1 AND email = $2', [TENANT_ID, user.email]);
            if (check.rows.length === 0) {
                const result = await client.query(
                    `INSERT INTO users (tenant_id, name, email, password, office, role, is_active)
                     VALUES ($1, $2, $3, $4, $5, $6, true)
                     RETURNING id`,
                    [TENANT_ID, user.name, user.email, defaultPassword, user.office, user.role]
                );
                userIds.push(result.rows[0].id);
            } else {
                // Actualizar contraseña para que coincida con demo2024
                await client.query(
                    `UPDATE users SET password = $1 WHERE id = $2`,
                    [defaultPassword, check.rows[0].id]
                );
                userIds.push(check.rows[0].id);
            }
        }
        console.log(`✅ ${userIds.length} usuarios disponibles\n`);

        console.log('🏢 Verificando clientes...');
        const clientIds = [];

        // Primero intentar obtener los existentes por RUT
        for (const client_data of CLIENTS) {
            const existing = await client.query(
                'SELECT id FROM clients WHERE tenant_id = $1 AND rut = $2',
                [TENANT_ID, client_data.rut]
            );

            if (existing.rows.length > 0) {
                clientIds.push(existing.rows[0].id);
            } else {
                // Si no existe, crearlo
                const result = await client.query(
                    `INSERT INTO clients (tenant_id, rut, name, email, phone, address_street, commune, region, reference)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                     RETURNING id`,
                    [TENANT_ID, client_data.rut, client_data.name, client_data.email, client_data.phone,
                        client_data.address_street, client_data.commune, client_data.region, client_data.reference]
                );
                clientIds.push(result.rows[0].id);
            }
        }
        console.log(`✅ ${clientIds.length} clientes disponibles\n`);

        console.log('🏷️  Verificando etiquetas...');
        const labelIds = [];

        for (const label of LABELS) {
            const existing = await client.query(
                'SELECT id FROM labels WHERE tenant_id = $1 AND name = $2',
                [TENANT_ID, label.name]
            );

            if (existing.rows.length > 0) {
                labelIds.push(existing.rows[0].id);
            } else {
                const result = await client.query(
                    `INSERT INTO labels (tenant_id, name, color, created_by)
                     VALUES ($1, $2, $3, $4)
                     RETURNING id`,
                    [TENANT_ID, label.name, label.color, userIds[0]]
                );
                labelIds.push(result.rows[0].id);
            }
        }
        console.log(`✅ ${labelIds.length} etiquetas disponibles\n`);

        console.log('📋 Creando tareas internas...');
        const taskIds = [];
        for (const task of TASKS_INTERNAL) {
            const createdBy = userIds[Math.floor(Math.random() * userIds.length)];
            const dueDate = randomDate(5, 15);
            const createdAt = randomDate(10, 0);

            const result = await client.query(
                `INSERT INTO tasks (tenant_id, title, description, priority, status, created_by, due_date, origin, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
                [TENANT_ID, task.title, task.description, task.priority, task.status,
                    createdBy, dueDate, task.origin, createdAt]
            );
            taskIds.push(result.rows[0].id);
        }
        console.log(`✅ ${TASKS_INTERNAL.length} tareas internas creadas\n`);

        console.log('📦 Creando entregas a clientes...');
        for (const task of TASKS_CLIENTS) {
            const createdBy = userIds[Math.floor(Math.random() * userIds.length)];
            const clientData = CLIENTS[task.clientIndex];
            const clientSnapshot = JSON.stringify({
                rut: clientData.rut,
                name: clientData.name,
                email: clientData.email,
                phone: clientData.phone,
                address: `${clientData.address_street}, ${clientData.commune}, ${clientData.region}`
            });
            const dueDate = randomDate(5, 15);
            const createdAt = randomDate(10, 0);

            const result = await client.query(
                `INSERT INTO tasks 
         (tenant_id, title, description, priority, status, created_by, due_date, origin, shipping_type, payment_status, client_snapshot, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id`,
                [TENANT_ID, task.title, task.description, task.priority, task.status,
                    createdBy, dueDate, task.origin, task.shipping_type, task.payment_status, clientSnapshot, createdAt]
            );
            taskIds.push(result.rows[0].id);
        }
        console.log(`✅ ${TASKS_CLIENTS.length} entregas a clientes creadas\n`);

        // Asignar usuarios a tareas
        console.log('👤 Asignando usuarios a tareas...');
        for (const taskId of taskIds) {
            // Asignar 1-3 usuarios aleatorios a cada tarea
            const numAssignments = Math.floor(Math.random() * 3) + 1;
            const shuffledUsers = [...userIds].sort(() => 0.5 - Math.random());

            for (let i = 0; i < numAssignments && i < shuffledUsers.length; i++) {
                try {
                    await client.query(
                        `INSERT INTO task_assignments (task_id, user_id)
               VALUES ($1, $2)
               ON CONFLICT DO NOTHING`,
                        [taskId, shuffledUsers[i]]
                    );
                } catch (err) {
                    if (err.code !== '23505') throw err;
                }
            }
        }
        console.log(`✅ Usuarios asignados a tareas\n`);

        // Asignar etiquetas a tareas
        console.log('🏷️  Asignando etiquetas a tareas...');
        for (const taskId of taskIds) {
            // Asignar 1-2 etiquetas aleatorias
            const numLabels = Math.floor(Math.random() * 2) + 1;
            const shuffledLabels = [...labelIds].sort(() => 0.5 - Math.random());

            for (let i = 0; i < numLabels && i < shuffledLabels.length; i++) {
                try {
                    await client.query(
                        `INSERT INTO task_labels (task_id, label_id)
               VALUES ($1, $2)
               ON CONFLICT DO NOTHING`,
                        [taskId, shuffledLabels[i]]
                    );
                } catch (err) {
                    if (err.code !== '23505') throw err;
                }
            }
        }
        console.log(`✅ Etiquetas asignadas a tareas\n`);

        await client.query('COMMIT');

        console.log('🎉 ¡Datos de demo creados exitosamente!\n');
        console.log('📊 Resumen:');
        console.log(`   - ${USERS.length} usuarios (password: demo2024)`);
        console.log(`   - ${CLIENTS.length} clientes frecuentes`);
        console.log(`   - ${TASKS_INTERNAL.length} tareas internas`);
        console.log(`   - ${TASKS_CLIENTS.length} entregas a clientes`);
        console.log(`   - ${LABELS.length} etiquetas`);
        console.log(`   - Tenant ID: ${TENANT_ID}`);
        console.log('\n✨ Tu sistema está listo para el video publicitario!\n');

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Error:', err);
        throw err;
    } finally {
        client.release();
        await pool.end();
    }
}

// Ejecutar
seedData()
    .then(() => {
        process.exit(0);
    })
    .catch(err => {
        console.error('❌ Error fatal:', err);
        process.exit(1);
    });
