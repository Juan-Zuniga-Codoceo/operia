// backend/scripts/check_notifications_schema.js
require('dotenv').config({ path: '../.env.production' });
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function checkSchema() {
    const client = await pool.connect();
    try {
        console.log('🕵️ Checking "notifications" table columns...');
        const res = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'notifications';
    `);

        console.table(res.rows);
    } catch (err) {
        console.error('❌ Error checking schema:', err);
    } finally {
        client.release();
        pool.end();
    }
}

checkSchema();
