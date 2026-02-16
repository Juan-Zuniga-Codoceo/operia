# Local Testing Guide - PostgreSQL Multi-tenant

Este documento te guía para testear localmente el sistema multi-tenant de Operia.

## 📋 Pre-requisitos

- ✅ PostgreSQL instalado y corriendo
- ✅ Base de datos `operia_production` creada
- ✅ Variables de entorno configuradas en `.env`
- ✅ Node.js 16+ instalado

## 🔧 Paso 1: Configurar Subdominios Locales

### Opción A: Usar /etc/hosts (Recomendado para Linux/Mac)

Edita `/etc/hosts` con permisos root:

```bash
sudo nano /etc/hosts
```

Agrega estas líneas:

```
127.0.0.1  demo.localhost
127.0.0.1  testcorp.localhost
127.0.0.1  empresa-a.localhost
127.0.0.1  empresa-b.localhost
```

Guarda y cierra (Ctrl+X, Y, Enter).

### Opción B: Usar lvh.me (Automático)

`lvh.me` es un dominio que siempre resuelve a `127.0.0.1` con wildcard support:

- `http://demo.lvh.me:3000` ✅
- `http://testcorp.lvh.me:3000` ✅
- `http://cualquier-cosa.lvh.me:3000` ✅

**No necesitas configurar nada**, solo usar este dominio.

### Opción C: Windows hosts file

Edita `C:\Windows\System32\drivers\etc\hosts` como Administrador:

```
127.0.0.1  demo.localhost
127.0.0.1  testcorp.localhost
```

---

## 🗄️ Paso 2: Inicializar Base de Datos

```bash
cd /run/media/juan/D/proyecto/operia

# Inicializar schema PostgreSQL
node backend/db-postgres.js

# (Opcional) Migrar datos existentes de SQLite
node scripts/migrate-sqlite-to-postgres.js
```

Deberías ver:

```
✅ PostgreSQL schema initialized
✅ Demo tenant created: demo.operia.app
```

---

## 🚀 Paso 3: Iniciar Servidor PostgreSQL

```bash
# Desde el directorio raíz del proyecto
node backend/server-postgres.js
```

Deberías ver el banner de inicio:

```
╔══════════════════════════════════════════════════════╗
║           🚀 OPERIA SaaS - PostgreSQL Mode           ║
╚══════════════════════════════════════════════════════╝

🌐 Server:        http://0.0.0.0:3000
🏢 Signup:        http://localhost:3000/signup
📊 Database:      PostgreSQL (localhost:5432/operia_production)
✅ PostgreSQL Connected
```

Si ves `❌ PostgreSQL Connection Failed`, revisa tu `DATABASE_URL` en `.env`.

---

## 🧪 Paso 4: Crear Tu Primer Tenant

### Opción 1: Via Web UI (Recomendado)

1. Abre tu navegador en: `http://localhost:3000/signup`
2. Completa el formulario:
   - **Nombre de la Empresa:** Demo Corp
   - **Subdominio:** `demo` (aparecerá como demo.localhost)
   - **Tu Nombre:** Admin Demo
   - **Email:** admin@democorp.com
   - **Contraseña:** demo123456
3. Click "Crear mi Cuenta Gratis"
4. Serás redirigido a: `http://demo.localhost:3000`

### Opción 2: Via API (cURL)

```bash
curl -X POST http://localhost:3000/api/auth/signup-tenant \
  -H "Content-Type: application/json" \
  -d '{
    "company_name": "Test Corp",
    "subdomain": "testcorp",
    "user_name": "Admin Test",
    "email": "admin@testcorp.com",
    "password": "test123456"
  }'
```

Respuesta esperada:

```json
{
  "success": true,
  "tenant_id": 2,
  "subdomain": "testcorp",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "redirect_url": "http://testcorp.localhost:3000/tablero"
}
```

---

## ✅ Paso 5: Testear Funcionalidades

### 5.1 Login Multi-tenant

Navega a `http://demo.localhost:3000/login`:

- Email: `admin@democorp.com`
- Password: `demo123456`

El sistema validará que el email pertenece al tenant `demo`.

### 5.2 Crear Cliente

En `http://demo.localhost:3000/tablero`:

1. Click "Clientes" en el sidebar
2. Agregar nuevo cliente
3. Nombre: "Cliente Demo"
4. Email: cliente@demo.com

**Validar:** El cliente se crea con `tenant_id = 1` (demo).

### 5.3 Crear Tarea

1. Click "Nueva Tarea"
2. Título: "Tarea de Prueba"
3. Descripción: "Testing multi-tenancy"
4. Prioridad: Alta
5. Asignar a ti mismo

**Validar:** La tarea aparece solo en `demo.localhost`, no en otros tenants.

### 5.4 Crear Segundo Tenant (Aislamiento)

1. Abre una ventana de incógnito
2. Ve a `http://localhost:3000/signup`
3. Crea tenant "empresa-a" con email `admin@empresa-a.com`
4. Login en `http://empresa-a.localhost:3000`

**Validar:** 
- No ves los clientes de `demo`
- No ves las tareas de `demo`
- Aislamiento total de datos ✅

---

## 🔍 Paso 6: Verificar Aislamiento de Datos

### Via psql (CLI)

```bash
psql -U operia_user -d operia_production
```

Queries de validación:

```sql
-- Ver todos los tenants
SELECT id, company_name, subdomain, plan, created_at FROM tenants;

-- Ver usuarios por tenant
SELECT t.subdomain, u.name, u.email 
FROM users u 
JOIN tenants t ON u.tenant_id = t.id 
ORDER BY t.subdomain, u.name;

-- Ver clientes por tenant
SELECT t.subdomain, c.nombre, c.email 
FROM clients c 
JOIN tenants t ON c.tenant_id = t.id 
ORDER BY t.subdomain;

-- Ver tareas por tenant
SELECT t.subdomain, ta.human_id, ta.title, ta.status 
FROM tasks ta 
JOIN tenants t ON ta.tenant_id = t.id 
ORDER BY t.subdomain, ta.created_at DESC;
```

**Resultado esperado:** Cada tenant solo ve sus propios datos.

---

## 🐛 Troubleshooting

### Problema: "Tenant not found"

**Causa:** El subdomain no existe en la tabla `tenants`.

**Solución:**
```sql
-- Ver tenants existentes
SELECT subdomain FROM tenants;

-- Crear tenant manualmente si es necesario
INSERT INTO tenants (company_name, subdomain, plan, subscription_status)
VALUES ('Test Company', 'test', 'starter', 'trial');
```

### Problema: "PostgreSQL Connection Failed"

**Causa:** DATABASE_URL incorrecto en `.env`.

**Solución:**
```bash
# Verificar .env
cat .env | grep DATABASE_URL

# Formato correcto:
# DATABASE_URL=postgresql://operia_user:operia_secure_2026!@localhost:5432/operia_production

# Probar conexión manualmente
psql -U operia_user -d operia_production -c "SELECT NOW();"
```

### Problema: Subdomain no resuelve

**Opción 1:** Usa lvh.me en vez de .localhost:
- `http://demo.lvh.me:3000`

**Opción 2:** Verifica /etc/hosts:
```bash
cat /etc/hosts | grep localhost
```

Debe incluir:
```
127.0.0.1  demo.localhost
```

### Problema: "Cannot read property 'tenantId' of undefined"

**Causa:** El middleware `extractTenant` no encontró el tenant.

**Solución:**
1. Verifica que el subdomain existe en la BD
2. Revisa logs del servidor para ver qué subdomain se está extrayendo
3. Asegúrate de acceder via `subdomain.localhost:3000`, no solo `localhost:3000`

---

## 📊 Checklist de Testing Completo

- [ ] PostgreSQL conecta correctamente
- [ ] Crear tenant via signup UI
- [ ] Login con credenciales del tenant
- [ ] Crear cliente en tenant A
- [ ] Crear tarea en tenant A
- [ ] Crear segundo tenant B
- [ ] Login en tenant B (ventana incógnito)
- [ ] Verificar que tenant B NO ve datos de tenant A
- [ ] Verificar que tenant A NO ve datos de tenant B
- [ ] Subir ficha técnica PDF (límite de storage)
- [ ] Crear etiquetas y categorías
- [ ] Actualizar perfil de usuario
- [ ] Ver notificaciones

---

## 🎯 Siguientes Pasos Después del Testing

Una vez que confirmes que:
1. ✅ Signup funciona
2. ✅ Login multi-tenant funciona
3. ✅ Aislamiento de datos funciona
4. ✅ Operaciones CRUD funcionan

Puedes proceder con:

**Opción A:** Completar Tasks Part 2 (comentarios, adjuntos)
**Opción B:** Crear wizard de onboarding
**Opción C:** Deployment a Oracle Cloud

---

## 💡 Tips de Testing

### Limpiar y Empezar de Nuevo

```bash
# Borrar todos los datos (⚠️ CUIDADO)
psql -U operia_user -d operia_production -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

# Reinicializar
node backend/db-postgres.js
```

### Ver Logs en Tiempo Real

```bash
# Terminal 1: Servidor
node backend/server-postgres.js

# Terminal 2: Logs de PostgreSQL (si lo instalaste con systemd)
journalctl -u postgresql -f
```

### Probar Límites de Plan

```javascript
// En browser console (tablero de demo.localhost)
// Intentar crear 101 clientes (límite Starter = 100)
for (let i = 1; i <= 101; i++) {
  await fetch('/api/clients', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    },
    body: JSON.stringify({
      nombre: `Cliente ${i}`,
      email: `cliente${i}@demo.com`,
      telefono: '123456789'
    })
  });
}
// El cliente 101 debería fallar con "Plan limit exceeded"
```

---

## 📞 Soporte

Si encuentras algún error durante el testing:

1. Revisa los logs del servidor
2. Revisa los logs de PostgreSQL
3. Verifica la tabla `tenants` en psql
4. Comparte el error exacto y los pasos para reproducirlo

¡Listo para testear! 🚀
