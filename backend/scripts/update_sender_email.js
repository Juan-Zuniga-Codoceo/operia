// backend/scripts/update_sender_email.js
const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.production') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function run() {
    try {
        console.log('🔌 Conectando a PostgreSQL...');
        await pool.connect();

        // Check if the sender_config table exists before updating
        const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'sender_config'
      )
    `);

        if (tableCheck.rows[0].exists) {
            console.log('✅ Tabla sender_config encontrada. Actualizando correos...');
            const result = await pool.query(`
            UPDATE sender_config 
            SET "email" = 'notificaciones@mail.operia.cl', "name" = 'Operia'
        `);
            console.log(`✅ ¡Éxito! Se actualizaron ${result.rowCount} registros en sender_config.`);
        } else {
            console.log('⚠️ La tabla sender_config no existe en esta base de datos.');
        }

        // Also update instances in the codebase if they existed (already did this via grep/replace)
    } catch (error) {
        console.error('❌ Error al actualizar la base de datos:', error);
    } finally {
        await pool.end();
        console.log('🔌 Conexión cerrada.');
    }
}

run();
