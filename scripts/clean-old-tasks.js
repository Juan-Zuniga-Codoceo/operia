// Script para limpiar tareas antiguas y dejar solo las del demo
require('dotenv').config();
const { Pool } = require('pg');

const poolConfig = process.env.DATABASE_URL ? {
    connectionString: process.env.DATABASE_URL,
    ssl: false
} : {
    host: process.env.PGHOST,
    port: process.env.PGPORT,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    ssl: false
};

const pool = new Pool(poolConfig);
const TENANT_ID = 1;

console.log('🧹 Limpiando tareas antiguas del tenant demo...\n');

async function cleanOldTasks() {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Eliminar asignaciones de tareas
        const deleteAssignments = await client.query(
            'DELETE FROM task_assignments WHERE task_id IN (SELECT id FROM tasks WHERE tenant_id = $1)',
            [TENANT_ID]
        );
        console.log(`✅ Eliminadas ${deleteAssignments.rowCount} asignaciones de tareas`);

        // 2. Eliminar etiquetas de tareas
        const deleteLabels = await client.query(
            'DELETE FROM task_labels WHERE task_id IN (SELECT id FROM tasks WHERE tenant_id = $1)',
            [TENANT_ID]
        );
        console.log(`✅ Eliminadas ${deleteLabels.rowCount} etiquetas de tareas`);

        // 3. Eliminar comentarios
        const deleteComments = await client.query(
            'DELETE FROM comments WHERE task_id IN (SELECT id FROM tasks WHERE tenant_id = $1)',
            [TENANT_ID]
        );
        console.log(`✅ Eliminados ${deleteComments.rowCount} comentarios`);

        // 4. Eliminar adjuntos
        const deleteAttachments = await client.query(
            'DELETE FROM attachments WHERE task_id IN (SELECT id FROM tasks WHERE tenant_id = $1)',
            [TENANT_ID]
        );
        console.log(`✅ Eliminados ${deleteAttachments.rowCount} adjuntos`);

        // 5. Finalmente, eliminar todas las tareas
        const deleteTasks = await client.query(
            'DELETE FROM tasks WHERE tenant_id = $1',
            [TENANT_ID]
        );
        console.log(`✅ Eliminadas ${deleteTasks.rowCount} tareas\n`);

        await client.query('COMMIT');
        console.log('🎉 Limpieza completada exitosamente!\n');

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Error durante la limpieza:', err);
        throw err;
    } finally {
        client.release();
        await pool.end();
    }
}

cleanOldTasks()
    .then(() => {
        console.log('✨ Ahora puedes ejecutar: node scripts/seed-demo-data-postgres.js');
        process.exit(0);
    })
    .catch(err => {
        console.error('❌ Error fatal:', err);
        process.exit(1);
    });
