const pool = require('../db-postgres');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const deleteTenant = async (identifier) => {
    const client = await pool.connect();

    try {
        // Buscar el tenant
        const res = await client.query(
            "SELECT * FROM tenants WHERE subdomain = $1 OR id::text = $1",
            [identifier]
        );

        if (res.rows.length === 0) {
            console.error(`❌ No se encontró ningún tenant con subdomain o ID: ${identifier}`);
            process.exit(1);
        }

        const tenant = res.rows[0];
        console.log(`\n⚠️  ATENCIÓN: Estás a punto de eliminar el siguiente tenant:`);
        console.log(`   ID: ${tenant.id}`);
        console.log(`   Nombre: ${tenant.name}`);
        console.log(`   Subdomain: ${tenant.subdomain}`);
        console.log(`   Creado: ${tenant.created_at}`);
        console.log(`\n   ESTA ACCIÓN ES IRREVERSIBLE. Se eliminarán todos los usuarios, tareas, etiquetas y datos asociados.`);

        rl.question('\n¿Estás seguro? Escribe el subdomain del tenant para confirmar: ', async (confirmation) => {
            if (confirmation !== tenant.subdomain) {
                console.log('❌ Cancelado. El subdomain no coincide.');
                process.exit(0);
            }

            try {
                await client.query('BEGIN');

                console.log('⏳ Eliminando datos relacionados...');

                // El orden importa por las llaves foráneas (si no hay ON DELETE CASCADE)
                // 1. Archivos adjuntos (Attachments)
                await client.query('DELETE FROM attachments WHERE tenant_id = $1', [tenant.id]);

                // 2. Comentarios (Comments) - A veces ligados a tareas, pero mejor asegurar
                // Si comments no tiene tenant_id directo, se borran via tareas, pero asumimos arquitectura segura
                // await client.query('DELETE FROM comments WHERE task_id IN (SELECT id FROM tasks WHERE tenant_id = $1)', [tenant.id]);

                // 3. Tareas (Tasks)
                await client.query('DELETE FROM tasks WHERE tenant_id = $1', [tenant.id]);

                // 4. Etiquetas (Labels)
                await client.query('DELETE FROM labels WHERE tenant_id = $1', [tenant.id]);

                // 5. Invitaciones (si existen)
                // await client.query('DELETE FROM user_invitations WHERE tenant_id = $1', [tenant.id]);

                // 6. Usuarios (Users)
                await client.query('DELETE FROM users WHERE tenant_id = $1', [tenant.id]);

                // 7. Configuración de Sender (Sender_Config)
                await client.query('DELETE FROM sender_config WHERE tenant_id = $1', [tenant.id]);

                // 8. Notificaciones
                await client.query('DELETE FROM notifications WHERE tenant_id = $1', [tenant.id]);

                // 9. Finalmente, el Tenant
                await client.query('DELETE FROM tenants WHERE id = $1', [tenant.id]);

                await client.query('COMMIT');
                console.log(`✅ Tenant "${tenant.name}" (${tenant.subdomain}) eliminado exitosamente.`);
            } catch (err) {
                await client.query('ROLLBACK');
                console.error('❌ Error al eliminar:', err);
            } finally {
                client.release();
                process.exit(0);
            }
        });

    } catch (err) {
        console.error('Error de conexión o consulta:', err);
        client.release();
        process.exit(1);
    }
};

if (process.argv.length < 3) {
    console.log('Uso: node backend/scripts/delete_tenant.js <subdomain_o_uuid>');
    process.exit(1);
}

deleteTenant(process.argv[2]);
