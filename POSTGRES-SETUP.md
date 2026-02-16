# PostgreSQL Setup - Arch Linux / Garuda Linux

## 🚀 Instalación Rápida (Arch/Garuda/Manjaro)

```bash
# 1. Instalar PostgreSQL
sudo pacman -S postgresql

# 2. Inicializar el cluster de base de datos
sudo -u postgres initdb -D /var/lib/postgres/data

# 3. Iniciar el servicio
sudo systemctl start postgresql
sudo systemctl enable postgresql  # Auto-start on boot

# 4. Verificar que está corriendo
sudo systemctl status postgresql
# Debe mostrar "active (running)" en verde
```

## 🔧 Configuración Inicial

```bash
# 1. Conectarse como usuario postgres
sudo -u postgres psql

# Dentro de psql, ejecuta estos comandos:
```

```sql
-- Crear usuario
CREATE USER operia_user WITH PASSWORD 'operia_secure_2026!';

-- Crear base de datos
CREATE DATABASE operia_production OWNER operia_user;

-- Dar permisos
GRANT ALL PRIVILEGES ON DATABASE operia_production TO operia_user;

-- Dar permisos en el schema public (necesario en PostgreSQL 15+)
\c operia_production
GRANT ALL ON SCHEMA public TO operia_user;
GRANT CREATE ON SCHEMA public TO operia_user;

-- Salir
\q
```

## ✅ Verificar Conexión

```bash
# Probar conexión (desde tu usuario normal, no como postgres)
psql -U operia_user -d operia_production -h localhost

# Si pide contraseña: operia_secure_2026!
# Si conecta exitosamente, verás:
# operia_production=>

# Salir con: \q
```

## 🔐 Configurar .env

Asegúrate de que tu archivo `.env` en `/run/media/juan/D/proyecto/operia/.env` tiene:

```env
DATABASE_URL=postgresql://operia_user:operia_secure_2026!@localhost:5432/operia_production
JWT_SECRET=tu_secreto_jwt_super_seguro_cambiar_en_produccion
APP_URL=http://localhost:3000
APP_DOMAIN=localhost
```

## 🎯 Inicializar Base de Datos de Operia

```bash
# Ir al directorio del proyecto
cd /run/media/juan/D/proyecto/operia

# Inicializar schema (crear tablas)
npm run init:db

# Deberías ver:
# ✅ PostgreSQL schema initialized
# ✅ Demo tenant created: demo.localhost
```

## 🚀 Iniciar Servidor Operia

```bash
# Servidor PostgreSQL multi-tenant
npm run start:postgres

# O en modo desarrollo con auto-reload:
npm run dev:postgres
```

Deberías ver el banner de inicio con información del servidor.

## 🧪 Primer Test Rápido

Una vez el servidor esté corriendo:

```bash
# En otra terminal, crear tu primer tenant
curl -X POST http://localhost:3000/api/auth/signup-tenant \
  -H "Content-Type: application/json" \
  -d '{
    "company_name": "Demo Corp",
    "subdomain": "demo",
    "user_name": "Juan",
    "email": "juan@demo.com",
    "password": "demo123456"
  }'

# Si funciona, verás:
# {"success":true,"tenant_id":1,"subdomain":"demo","token":"..."}
```

## 🐛 Troubleshooting Arch/Garuda

### Error: "could not connect to server"

El servicio PostgreSQL no está corriendo:

```bash
# Iniciar
sudo systemctl start postgresql

# Ver logs si falla
sudo journalctl -u postgresql -n 50
```

### Error: "initdb: directory exists but is not empty"

El cluster ya fue inicializado antes:

```bash
# Solo inicia el servicio, salta el initdb
sudo systemctl start postgresql
```

### Error: "FATAL: Peer authentication failed"

Edita el archivo de configuración:

```bash
sudo nano /var/lib/postgres/data/pg_hba.conf
```

Busca estas líneas:
```
local   all   all   peer
host    all   all   127.0.0.1/32   ident
```

Cámbialas a:
```
local   all   all   md5
host    all   all   127.0.0.1/32   md5
```

Reinicia PostgreSQL:
```bash
sudo systemctl restart postgresql
```

### Error: "role 'operia_user' does not exist"

Créalo manualmente:

```bash
sudo -u postgres createuser -s operia_user
sudo -u postgres psql -c "ALTER USER operia_user WITH PASSWORD 'operia_secure_2026!';"
```

### Error: "database 'operia_production' does not exist"

Créala manualmente:

```bash
sudo -u postgres createdb -O operia_user operia_production
```

## 📊 Verificar Todo Funciona

```bash
# 1. Servicio corriendo
sudo systemctl status postgresql

# 2. Conexión OK
psql -U operia_user -d operia_production -h localhost -c "SELECT NOW();"

# 3. Inicializar tablas
cd /run/media/juan/D/proyecto/operia
npm run init:db

# 4. Verificar tablas creadas
psql -U operia_user -d operia_production -h localhost -c "\dt"
# Deberías ver 14 tablas

# 5. Iniciar servidor
npm run start:postgres
```

## 🎯 Comandos Resumidos (Copy-Paste)

```bash
# Instalación y setup completo
sudo pacman -S postgresql
sudo -u postgres initdb -D /var/lib/postgres/data
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Crear usuario y BD (ejecutar línea por línea en psql)
sudo -u postgres psql << 'EOF'
CREATE USER operia_user WITH PASSWORD 'operia_secure_2026!';
CREATE DATABASE operia_production OWNER operia_user;
GRANT ALL PRIVILEGES ON DATABASE operia_production TO operia_user;
\c operia_production
GRANT ALL ON SCHEMA public TO operia_user;
GRANT CREATE ON SCHEMA public TO operia_user;
EOF

# Verificar conexión
psql -U operia_user -d operia_production -h localhost -c "SELECT NOW();"

# Inicializar y arrancar Operia
cd /run/media/juan/D/proyecto/operia
npm run init:db
npm run start:postgres
```

## 🌐 Configurar Subdominios para Testing

Para testear multi-tenancy local, edita `/etc/hosts`:

```bash
sudo nano /etc/hosts
```

Agrega estas líneas:

```
127.0.0.1  demo.localhost
127.0.0.1  testcorp.localhost
127.0.0.1  empresa-a.localhost
```

**Alternativa más fácil:** Usa `lvh.me` (no requiere configurar nada):
- `http://demo.lvh.me:3000`
- `http://testcorp.lvh.me:3000`

Automáticamente apunta a localhost con soporte wildcard.

## ✅ Listo para Testear

Una vez completados los pasos:
1. Abre `http://localhost:3000/signup`
2. Crea un tenant con subdomain "demo"
3. Serás redirigido a `http://demo.localhost:3000`
4. Sigue la guía completa en `TESTING-LOCAL.md`

¡Todo listo! 🚀
