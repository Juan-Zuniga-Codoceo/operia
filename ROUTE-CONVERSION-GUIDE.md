# Conversión de Rutas a PostgreSQL - Guía Rápida

## Archivos Convertidos

### ✅ Completados
- `auth.routes-postgres.js` - Autenticación multi-tenant ✅
- `clients.routes-postgres.js` - Gestión de clientes con límites ✅  
- `labels.routes-postgres.js` - Etiquetas por tenant ✅
- `categories.routes-postgres.js` - Categorías por tenant ✅

### ⏳ Pendientes (grandes)
- `tasks.routes.js` → `tasks.routes-postgres.js` (1156 líneas, 79 funciones)
- `users.routes.js` → `users.routes-postgres.js`
- `sheets.routes.js` → `sheets.routes-postgres.js`
- `admin.routes.js` → `admin.routes-postgres.js`
- `sender.routes.js` → `sender.routes-postgres.js`

---

## Patrón de Conversión

### SQLite → PostgreSQL

**Antes (SQLite con callbacks):**
```javascript
router.get('/clients', (req, res) => {
  db.all('SELECT * FROM clients WHERE rut LIKE ?', [`%${search}%`], (err, rows) => {
    if (err) return res.status(500).json({ error });
    res.json(rows);
  });
});
```

**Después (PostgreSQL async/await + tenant):**
```javascript
router.get('/clients', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM clients WHERE rut ILIKE $1 AND tenant_id = $2',
      [`%${search}%`, req.tenantId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error });
  }
});
```

---

## Cambios Clave

### 1. Importaciones
```javascript
// Cambiar
const db = require('../db');

// Por
const pool = require('../db-postgres');
```

### 2. Placeholders
```javascript
// SQLite: ?
WHERE id = ?

WHERE id = ? AND name LIKE ?

// PostgreSQL: $1, $2, $3
WHERE id = $1 AND tenant_id = $2

WHERE id = $1 AND name ILIKE $2 AND tenant_id = $3
```

### 3. Callbacks → Async/Await
```javascript
// Cambiar callbacks
db.get(sql, params, (err, row) => {
  if (err) return res.status(500).json({error});
  res.json(row);
});

// Por async/await
const result = await pool.query(sql, params);
const row = result.rows[0];
res.json(row);
```

### 4. Resultados
```javascript
// SQLite
db.all() → rows directamente
db.get() → row directamente
db.run() → this.lastID, this.changes

// PostgreSQL
pool.query() → result.rows (array)
pool.query() → result.rows[0] (single row)
pool.query() → result.rowCount (affected rows)
```

### 5. SIEMPRE Agregar tenant_id
```javascript
// SELECT
WHERE tenant_id = $1
WHERE id = $1 AND tenant_id = $2

// INSERT
INSERT INTO table (tenant_id, name) VALUES ($1, $2)

// UPDATE
WHERE id = $1 AND tenant_id = $2

// DELETE
WHERE id = $1 AND tenant_id = $2
```

### 6. Búsqueda Case-Insensitive
```javascript
// SQLite: LIKE
WHERE name LIKE '%search%'

// PostgreSQL: ILIKE
WHERE name ILIKE '%search%'
```

---

## Cómo Usar las Nuevas Rutas

### En server.js

**Cambiar:**
```javascript
const clientsRoutes = require('./routes/clients.routes');
app.use('/api/clients', clientsRoutes);
```

**Por:**
```javascript
const clientsRoutes = require('./routes/clients.routes-postgres');
app.use('/api/clients', clientsRoutes);
```

**Agregar middleware tenant ANTES de las rutas:**
```javascript
const { extractTenant } = require('./middleware/tenant.middleware');

// Aplicar a todas las rutas API (excepto signup)
app.use('/api', extractTenant);
```

---

## Testing

### Test de Aislamiento de Tenants

```bash
# Crear 2 tenants
curl -X POST http://localhost:3000/api/auth/signup-tenant \
  -H "Content-Type: application/json" \
  -d '{
    "company_name": "Empresa A",
    "subdomain": "empresa-a",
    "email": "admin@empresa-a.com",
    "password": "password123",
    "full_name": "Admin A"
  }'

curl -X POST http://localhost:3000/api/auth/signup-tenant \
  -H "Content-Type: application/json" \
  -d '{
    "company_name": "Empresa B",
    "subdomain": "empresa-b",
    "email": "admin@empresa-b.com",
    "password": "password123",
    "full_name": "Admin B"
  }'

# Login en Empresa A
TOKEN_A=$(curl -X POST http://empresa-a.localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@empresa-a.com","password":"password123"}' \
  | jq -r '.token')

# Crear cliente en Empresa A
curl -X POST http://empresa-a.localhost:3000/api/clients \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_A" \
  -d '{
    "rut": "12345678-9",
    "name": "Cliente A",
    "email": "cliente@empresa-a.com"
  }'

# Login en Empresa B
TOKEN_B=$(curl -X POST http://empresa-b.localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@empresa-b.com","password":"password123"}' \
  | jq -r '.token')

# Verificar que Empresa B NO ve el cliente de Empresa A
curl http://empresa-b.localhost:3000/api/clients \
  -H "Authorization: Bearer $TOKEN_B"

# Debe retornar array vacío: []
```

---

## Próximos Pasos

1. **Convertir tasks.routes.js** (el más grande y crítico)
2. **Actualizar server.js** para usar rutas PostgreSQL
3. **Testing de integración** con frontend
4. **Deployment** a Oracle Cloud con PostgreSQL
