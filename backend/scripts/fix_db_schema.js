// backend/scripts/fix_db_schema.js
require('dotenv').config({ path: '../.env.production' }); // Load env vars
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function fixSchema() {
  const client = await pool.connect();
  try {
    console.log('🔧 Starting Database Schema Fix...');

    // 1. Fix Attachments Table (Missing user_id)
    console.log('Checking "attachments" table...');
    await client.query(`
      ALTER TABLE attachments 
      ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
    `);
    console.log('✅ Added "user_id" to "attachments" (if missing).');

    // 2. Fix Labels Table (Just in case created_by is missing)
    console.log('Checking "labels" table...');
    await client.query(`
      ALTER TABLE labels 
      ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
    `);
    console.log('✅ Added "created_by" to "labels" (if missing).');

    // 3. Ensure task_labels exists
    console.log('Checking "task_labels" table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS task_labels (
        task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
        label_id INTEGER REFERENCES labels(id) ON DELETE CASCADE,
        PRIMARY KEY (task_id, label_id)
      );
    `);
    console.log('✅ Verified "task_labels" table.');

    // 4. Fix Users Table (Add phone and office)
    console.log('Checking "users" table...');
    await client.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS phone TEXT,
            ADD COLUMN IF NOT EXISTS office TEXT;
        `);
    console.log('✅ Added "phone" and "office" to "users" (if missing).');

    console.log('🎉 Schema fix completed successfully!');
  } catch (err) {
    console.error('❌ Error fixing schema:', err);
  } finally {
    client.release();
    pool.end();
  }
}

fixSchema();
