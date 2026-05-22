const { Pool } = require('pg');
const bcrypt = require('bcrypt');

// Connection pool configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://operia_user:operia_password@localhost:5432/operia_production',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000, // Increased to 10 seconds
});

// Test connection
pool.on('connect', () => {
  console.log('✅ Conexión a PostgreSQL establecida');
});

pool.on('error', (err) => {
  console.error('❌ Error inesperado en PostgreSQL:', err);
  process.exit(-1);
});

// Initialize database schema
async function initializeDatabase() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // ==========================================
    // TABLA PRINCIPAL: TENANTS (Organizaciones)
    // ==========================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS tenants (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        subdomain VARCHAR(100) UNIQUE NOT NULL,
        plan VARCHAR(50) DEFAULT 'starter',
        subscription_status VARCHAR(50) DEFAULT 'trial',
        trial_ends_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '14 days'),
        next_billing_date TIMESTAMP,
        max_users INTEGER DEFAULT 10,
        max_clients INTEGER DEFAULT 100,
        storage_limit_mb INTEGER DEFAULT 500,
        branding_enabled BOOLEAN DEFAULT FALSE,
        custom_logo_path TEXT,
        primary_color VARCHAR(7) DEFAULT '#006837',
        onboarding_completed BOOLEAN DEFAULT FALSE,
        onboarding_step INTEGER DEFAULT 1,
        onboarding_skipped_steps TEXT DEFAULT '[]',
        onboarding_completed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Tabla tenants creada');

    // ==========================================
    // USUARIOS (con tenant_id)
    // ==========================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        password VARCHAR(255) NOT NULL,
        office VARCHAR(100),
        role VARCHAR(50) DEFAULT 'user',
        avatar_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        reset_token VARCHAR(255),
        reset_token_expires BIGINT,
        email_notifications BOOLEAN DEFAULT TRUE,
        is_active BOOLEAN DEFAULT TRUE,
        UNIQUE(tenant_id, email)
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
    console.log('✅ Tabla users creada');

    // ==========================================
    // SEQUENCES (con tenant_id)
    // ==========================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS sequences (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        prefix VARCHAR(50) NOT NULL,
        last_number INTEGER DEFAULT 0,
        UNIQUE(tenant_id, prefix)
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_sequences_tenant_id ON sequences(tenant_id)');
    console.log('✅ Tabla sequences creada');

    // ==========================================
    // CLIENTES (con tenant_id)
    // ==========================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS clients (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        rut VARCHAR(20) UNIQUE,
        name VARCHAR(255),
        email VARCHAR(255),
        phone VARCHAR(50),
        address_street TEXT,
        commune VARCHAR(100),
        region VARCHAR(100),
        reference TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_clients_tenant_id ON clients(tenant_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_clients_rut ON clients(rut)');
    console.log('✅ Tabla clients creada');

    // ==========================================
    // PROYECTOS (con tenant_id)
    // ==========================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_projects_tenant_id ON projects(tenant_id)');
    console.log('✅ Tabla projects creada');

    // ==========================================
    // MIEMBROS DE PROYECTO
    // ==========================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS project_members (
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        PRIMARY KEY (project_id, user_id)
      )
    `);
    console.log('✅ Tabla project_members creada');

    // ==========================================
    // TAREAS (con tenant_id)
    // ==========================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
        title VARCHAR(500) NOT NULL,
        description TEXT,
        due_date TIMESTAMP,
        priority VARCHAR(50) DEFAULT 'media',
        status VARCHAR(50) DEFAULT 'pendiente',
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        is_archived BOOLEAN DEFAULT FALSE,
        responsible_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        observer_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        human_id VARCHAR(50),
        origin VARCHAR(100),
        shipping_type VARCHAR(100),
        payment_status VARCHAR(50),
        client_snapshot TEXT,
        client_reference VARCHAR(255)
      )
    `);

    // Migración en caliente para tablas existentes
    await client.query(`
      ALTER TABLE tasks 
      ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_tasks_tenant_id ON tasks(tenant_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date)');
    console.log('✅ Tabla tasks verificada/actualizada');

    // ==========================================
    // ETIQUETAS (con tenant_id)
    // ==========================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS labels (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        color VARCHAR(7) DEFAULT '#006837',
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tenant_id, name)
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_labels_tenant_id ON labels(tenant_id)');
    console.log('✅ Tabla labels creada');

    // ==========================================
    // ASIGNACIONES DE TAREAS (con tenant_id implícito vía task)
    // ==========================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS task_assignments (
        id SERIAL PRIMARY KEY,
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(task_id, user_id)
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_task_assignments_task_id ON task_assignments(task_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_task_assignments_user_id ON task_assignments(user_id)');
    console.log('✅ Tabla task_assignments creada');

    // ==========================================
    // ETIQUETAS DE TAREAS
    // ==========================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS task_labels (
        id SERIAL PRIMARY KEY,
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        label_id INTEGER NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
        UNIQUE(task_id, label_id)
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_task_labels_task_id ON task_labels(task_id)');
    console.log('✅ Tabla task_labels creada');

    // ==========================================
    // COMENTARIOS (tenant_id implícito vía task)
    // ==========================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS comments (
        id SERIAL PRIMARY KEY,
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id),
        comment TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_comments_task_id ON comments(task_id)');
    console.log('✅ Tabla comments creada');

    // ==========================================
    // ARCHIVOS ADJUNTOS
    // ==========================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS attachments (
        id SERIAL PRIMARY KEY,
        task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
        comment_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
        file_path TEXT NOT NULL,
        file_name VARCHAR(500) NOT NULL,
        file_type VARCHAR(100),
        file_size INTEGER DEFAULT 0,
        uploaded_by INTEGER REFERENCES users(id),
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        attachment_type VARCHAR(50) DEFAULT 'general'
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_attachments_task_id ON attachments(task_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_attachments_comment_id ON attachments(comment_id)');
    console.log('✅ Tabla attachments creada');

    // ==========================================
    // NOTIFICACIONES (con tenant_id implícito vía user)
    // ==========================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        mensaje TEXT NOT NULL,
        leida BOOLEAN DEFAULT FALSE,
        tipo VARCHAR(50) DEFAULT 'info',
        task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
        fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_notifications_usuario_id ON notifications(usuario_id)');
    console.log('✅ Tabla notifications creada');

    // ==========================================
    // CATEGORÍAS (con tenant_id)
    // ==========================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tenant_id, name)
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_categories_tenant_id ON categories(tenant_id)');
    console.log('✅ Tabla categories creada');

    // ==========================================
    // FICHAS TÉCNICAS (con tenant_id)
    // ==========================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS technical_sheets (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        product_name VARCHAR(500) NOT NULL,
        model VARCHAR(255),
        sku VARCHAR(100),
        category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
        tags TEXT,
        file_path TEXT NOT NULL,
        file_name VARCHAR(500) NOT NULL,
        uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_technical_sheets_tenant_id ON technical_sheets(tenant_id)');
    console.log('✅ Tabla technical_sheets creada');

    // ==========================================
    // CONFIGURACIÓN DEL REMITENTE (con tenant_id)
    // ==========================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS sender_config (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        rut VARCHAR(20),
        address TEXT,
        commune VARCHAR(100),
        region VARCHAR(100),
        phone VARCHAR(50),
        email VARCHAR(255),
        website VARCHAR(255),
        contact_person VARCHAR(255),
        contact_rut VARCHAR(20),
        thank_you_message TEXT,
        logo_path TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tenant_id)
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_sender_config_tenant_id ON sender_config(tenant_id)');
    console.log('✅ Tabla sender_config creada');

    // ==========================================
    // TABLA DE PAGOS (para tracking de suscripciones)
    // ==========================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        flow_order VARCHAR(255) UNIQUE,
        flow_token VARCHAR(255),
        plan VARCHAR(50) NOT NULL,
        amount INTEGER NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        paid_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_payments_tenant_id ON payments(tenant_id)');
    console.log('✅ Tabla payments creada');

    // ==========================================
    // EXTENSIÓN PGVECTOR Y TABLA DE VECTORES
    // ==========================================
    const extensionCheck = await client.query("SELECT 1 FROM pg_available_extensions WHERE name = 'vector'");
    if (extensionCheck.rows.length > 0) {
      await client.query("CREATE EXTENSION IF NOT EXISTS vector");
      await client.query(`
        CREATE TABLE IF NOT EXISTS knowledge_base_chunks (
          id SERIAL PRIMARY KEY,
          document_name VARCHAR(255) NOT NULL,
          content TEXT NOT NULL,
          embedding VECTOR(768) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS knowledge_base_chunks_embedding_hnsw_idx 
        ON knowledge_base_chunks 
        USING hnsw (embedding vector_cosine_ops)
      `);
      console.log('✅ Tabla knowledge_base_chunks e índice HNSW creados');
    } else {
      console.warn('⚠️ La extensión pgvector no está disponible en este sistema PostgreSQL. No se creará la tabla knowledge_base_chunks.');
    }

    // ==========================================
    // CREAR TENANT DE DEMOSTRACIÓN
    // ==========================================
    const defaultPassword = await bcrypt.hash('1234', 10);

    const tenantResult = await client.query(`
      INSERT INTO tenants (name, subdomain, plan, subscription_status, onboarding_completed)
      VALUES ('Demo Company', 'demo', 'professional', 'active', true)
      ON CONFLICT (subdomain) DO NOTHING
      RETURNING id
    `);

    if (tenantResult.rows.length > 0) {
      const tenantId = tenantResult.rows[0].id;

      await client.query(`
        INSERT INTO users (tenant_id, name, email, password, office, role)
        VALUES ($1, 'Admin Demo', 'admin@demo.operia.app', $2, 'Valparaíso', 'admin')
        ON CONFLICT (tenant_id, email) DO NOTHING
      `, [tenantId, defaultPassword]);

      console.log('✅ Tenant demo creado: demo.operia.app / admin@demo.operia.app / contraseña: 1234');
    } else {
      console.log('ℹ️  Tenant demo ya existe');
    }

    await client.query('COMMIT');
    console.log('✅ Base de datos PostgreSQL inicializada con éxito');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error al inicializar la base de datos:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Execute initialization
initializeDatabase().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});

module.exports = pool;
