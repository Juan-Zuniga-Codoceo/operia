# Migración a PostgreSQL - Guía de Implementación

## ✅ Archivos Creados

### Backend - Base de Datos
- `backend/db-postgres.js` - Nueva conexión PostgreSQL con schema multitenancy
- `backend/middleware/tenant.middleware.js` - Extracción de tenant desde subdomain
- `backend/middleware/planLimits.js` - Límites por plan de suscripción
- `backend/middleware/auth.js` - **Actualizado** para JWT con tenant_id

### Backend - Rutas  
- `backend/routes/auth.routes-postgres.js` - Rutas de autenticación actualizadas

### Scripts
- `scripts/setup-postgresql.sh` - Instalación de PostgreSQL en servidor
- `scripts/migrate-sqlite-to-postgres.js` - Migración de datos existentes

---

## 📋 Pasos para Implementar

### 1. Instalar PostgreSQL en Oracle Cloud

```bash
# Conectar a tu servidor Oracle Cloud via SSH
ssh usuario@tu-servidor-oracle.com

# Ejecutar script de instalación
cd /ruta/a/operia
sudo bash scripts/setup-postgresql.sh
```

Esto instalará PostgreSQL y creará:
- Base de datos: `operia_production`
- Usuario: `operia_user`
- Password: `operia_secure_2026!` (cámbialo por seguridad)

### 2. Actualizar Variables de Entorno

Edita tu archivo `.env`:

```env
# PostgreSQL Connection
DATABASE_URL=postgresql://operia_user:operia_secure_2026!@localhost:5432/operia_production

# Dominio principal (sin http://)
APP_DOMAIN=operia.app

# JWT Secret (mantén el existente o genera uno nuevo)
JWT_SECRET=operia1234

# Email (mantén configuración existente)
RESEND_API_KEY=tu_api_key

# Flow Payment (agregar cuando tengas las credenciales)
FLOW_API_KEY=
FLOW_SECRET_KEY=
FLOW_SANDBOX=true
```

### 3. Inicializar la Base de Datos

```bash
cd /run/media/juan/D/proyecto/operia

# Inicializar schema PostgreSQL
node backend/db-postgres.js
```

Esto creará todas las tablas con multitenancy y un tenant demo.

### 4. (Opcional) Migrar Datos de SQLite

Si tienes datos existentes en SQLite que quieres conservar:

```bash
node scripts/migrate-sqlite-to-postgres.js
```

Esto migrará todos los datos a un tenant llamado "migrated" con subdomain `migrated.operia.app`.

### 5. Actualizar server.js

Reemplaza las referencias al archivo de base de datos:

**Antes:**
```javascript
const db = require('./db');
```

**Después:**
```javascript
const pool = require('./db-postgres');
```

Y actualiza las rutas de auth:

**Antes:**
```javascript
const authRoutes = require('./routes/auth.routes');
```

**Después:**
```javascript
const authRoutes = require('./routes/auth.routes-postgres');
```

### 6. Aplicar Middleware de Tenant

En `backend/server.js`, después de configurar CORS y antes de las rutas:

```javascript
const { extractTenant, optionalTenant } = require('./middleware/tenant.middleware');

// Para rutas que REQUIEREN tenant (la mayoría)
app.use('/api', extractTenant);

// Para rutas públicas (signup, landing), usar optionalTenant
app.use('/api/auth/signup-tenant', optionalTenant);
app.use('/api/auth/check-subdomain', optionalTenant);
```

### 7. Configurar DNS Wildcard

En tu proveedor de DNS (ej: Cloudflare), agrega:

```
Tipo: A
Nombre: *
Destino: [IP de Oracle Cloud]
TTL: Auto
```

Esto permitirá que `cualquier-cosa.operia.app` apunte a tu servidor.

### 8. Configurar SSL Wildcard

Usa certbot para obtener certificado wildcard:

```bash
sudo certbot certonly --manual --preferred-challenges=dns -d "*.operia.app" -d "operia.app"
```

Sigue las instrucciones para agregar registro TXT en tu DNS.

### 9. Actualizar Nginx

Edita `/etc/nginx/sites-available/operia`:

```nginx
server {
    listen 443 ssl http2;
    server_name *.operia.app operia.app;

    ssl_certificate /etc/letsencrypt/live/operia.app/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/operia.app/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# Redirigir HTTP a HTTPS
server {
    listen 80;
    server_name *.operia.app operia.app;
    return 301 https://$host$request_uri;
}
```

Reiniciar Nginx:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 10. Probar el Sistema

**Verificar tenant demo:**
```bash
curl https://demo.operia.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.operia.app","password":"1234"}'
```

**Crear nuevo tenant:**
```bash
curl https://www.operia.app/api/auth/signup-tenant \
  -H "Content-Type: application/json" \
  -d '{
    "company_name": "Test Corp",
    "subdomain": "testcorp",
    "email": "admin@test.com",
    "password": "password123",
    "full_name": "Admin User"
  }'
```

**Verificar subdomain disponible:**
```bash
curl https://www.operia.app/api/auth/check-subdomain/testcorp
```

---

## 🔄 Siguiente Fase: Actualización de Rutas

Una vez que PostgreSQL está funcionando, necesitas actualizar las rutas existentes:

### Rutas a Actualizar:
1. `backend/routes/tasks.routes.js` - Añadir tenant_id a queries
2. `backend/routes/clients.routes.js` - Filtrar por tenant
3. `backend/routes/users.routes.js` - Añadir límites de plan
4. `backend/routes/sheets.routes.js` - Filtrar por tenant
5. `backend/routes/admin.routes.js` - Scope por tenant
6. `backend/routes/labels.routes.js` - Filtrar por tenant
7. `backend/routes/categories.routes.js` - Filtrar por tenant
8. `backend/routes/sender.routes.js` - Config por tenant

### Patrón de Actualización:

**SQLite (antes):**
```javascript
db.get('SELECT * FROM tasks WHERE id = ?', [taskId], (err, task) => {
  // ...
});
```

**PostgreSQL (después):**
```javascript
const result = await pool.query(
  'SELECT * FROM tasks WHERE id = $1 AND tenant_id = $2',
  [taskId, req.tenantId]
);
const task = result.rows[0];
```

---

## ⚠️ Notas Importantes

1. **Backup**: Haz backup de `backend/database.sqlite` antes de migrar
2. **Downtime**: La migración requiere 1-2 horas de downtime
3. **Testing**: Prueba en local primero antes de aplicar en producción
4. **Rollback**: Mantén los archivos SQLite originales por si necesitas revertir

---

## 📞 Siguientes Pasos

Una vez completada esta fase:
- [ ] Fase 2: Sistema de subdominios y registro
- [ ] Fase 3: Integración de pagos con Flow
- [ ] Fase 4: Página de pricing
- [ ] Fase 5: Wizard de onboarding
