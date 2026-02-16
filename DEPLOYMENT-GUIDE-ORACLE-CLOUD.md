# 🚀 GUÍA DE DEPLOYMENT - OPERIA EN ORACLE CLOUD

## 📋 INFORMACIÓN DEL SERVIDOR

**IP Pública:** 165.1.121.121  
**SO:** Ubuntu 22.04 LTS (ARM - aarch64)  
**Usuario:** ubuntu  
**Dominio:** operia.cl  
**DNS:** Cloudflare (Proxied)

**Software Instalado:**
- ✅ Node.js v20.20.0
- ✅ PostgreSQL 14
- ✅ Nginx
- ✅ PM2

---

## 🗄️ CONFIGURACIÓN DE BASE DE DATOS

### Credenciales PostgreSQL
```
Host: localhost
Database: operia_production
User: operia_user
Password: operia_secure_2026!
```

### Crear Base de Datos y Usuario

```bash
# Conectar como postgres
sudo -u postgres psql

# Crear usuario y base de datos
CREATE USER operia_user WITH PASSWORD 'operia_secure_2026!';
CREATE DATABASE operia_production OWNER operia_user;
GRANT ALL PRIVILEGES ON DATABASE operia_production TO operia_user;

# Salir
\q
```

### Ejecutar Migraciones

```bash
# Ir al directorio del proyecto
cd ~/operia

# Instalar dependencias
npm install

# Ejecutar script de migración
node scripts/migrate.js
```

---

## 🔧 VARIABLES DE ENTORNO

### Crear archivo .env en producción

```bash
cd ~/operia
nano .env
```

### Contenido del .env

```env
# Database
DATABASE_URL=postgresql://operia_user:operia_secure_2026!@localhost:5432/operia_production

# Application
APP_DOMAIN=operia.cl
APP_URL=https://operia.cl
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# JWT Secret (IMPORTANTE: Cambiar en producción)
JWT_SECRET=operia_super_secret_2026

# Email Service (Resend)
RESEND_API_KEY=your_resend_api_key_here

# Flow Payment Gateway (PRODUCCIÓN)
FLOW_API_KEY=6746B9FF-40AE-41D0-B897-57D9BL53BE55
FLOW_SECRET_KEY=7adde4dce1d693fb9d054e37e5c62dd6c9cecaa5
FLOW_API_URL=https://www.flow.cl/api
FLOW_WEBHOOK_URL=https://operia.cl/api/payments/webhook
```

**Guardar:** Ctrl+O, Enter, Ctrl+X

---

## 🌐 CONFIGURACIÓN DE NGINX

### Crear archivo de configuración

```bash
sudo nano /etc/nginx/sites-available/operia
```

### Contenido del archivo

```nginx
# Operia - Multi-tenant SaaS
# Soporta subdominios dinámicos: *.operia.cl

server {
    listen 80;
    listen [::]:80;
    server_name operia.cl *.operia.cl;

    # Redirect HTTP to HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name operia.cl *.operia.cl;

    # SSL Configuration (Cloudflare Origin Certificate)
    ssl_certificate /etc/ssl/cloudflare/operia.cl.pem;
    ssl_certificate_key /etc/ssl/cloudflare/operia.cl.key;
    
    # SSL Settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Logs
    access_log /var/log/nginx/operia_access.log;
    error_log /var/log/nginx/operia_error.log;

    # Client max body size (for file uploads)
    client_max_body_size 10M;

    # Proxy settings
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Static files (optional optimization)
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://localhost:3000;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # WebSocket support
    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

### Habilitar el sitio

```bash
# Crear symlink
sudo ln -s /etc/nginx/sites-available/operia /etc/nginx/sites-enabled/

# Eliminar sitio default si existe
sudo rm /etc/nginx/sites-enabled/default

# Verificar configuración
sudo nginx -t

# Reiniciar Nginx
sudo systemctl restart nginx
```

---

## 🔒 CONFIGURACIÓN SSL (CLOUDFLARE ORIGIN CERTIFICATE)

### Opción 1: Usar Cloudflare Origin Certificate (RECOMENDADO)

1. **Ir a Cloudflare Dashboard:**
   - SSL/TLS → Origin Server
   - Create Certificate
   - Seleccionar "Generate private key and CSR with Cloudflare"
   - Hostnames: `operia.cl, *.operia.cl`
   - Validity: 15 years
   - Click "Create"

2. **Guardar certificados en el servidor:**

```bash
# Crear directorio
sudo mkdir -p /etc/ssl/cloudflare

# Crear archivo de certificado
sudo nano /etc/ssl/cloudflare/operia.cl.pem
# Pegar el contenido del "Origin Certificate"
# Guardar: Ctrl+O, Enter, Ctrl+X

# Crear archivo de clave privada
sudo nano /etc/ssl/cloudflare/operia.cl.key
# Pegar el contenido del "Private Key"
# Guardar: Ctrl+O, Enter, Ctrl+X

# Establecer permisos
sudo chmod 600 /etc/ssl/cloudflare/operia.cl.key
sudo chmod 644 /etc/ssl/cloudflare/operia.cl.pem
```

3. **Configurar Cloudflare SSL Mode:**
   - SSL/TLS → Overview
   - Seleccionar: **Full (strict)**

### Opción 2: Usar Let's Encrypt (Alternativa)

```bash
# Instalar certbot
sudo apt update
sudo apt install certbot python3-certbot-nginx -y

# Obtener certificado wildcard (requiere DNS challenge)
sudo certbot certonly --manual --preferred-challenges dns -d operia.cl -d *.operia.cl

# Seguir instrucciones para agregar registros TXT en Cloudflare
```

---

## 🔥 CONFIGURACIÓN DE FIREWALL (ORACLE CLOUD)

### En Oracle Cloud Console:

1. **Ir a:** Networking → Virtual Cloud Networks
2. **Seleccionar:** Tu VCN
3. **Ir a:** Security Lists → Default Security List
4. **Agregar Ingress Rules:**

```
Stateless: No
Source: 0.0.0.0/0
IP Protocol: TCP
Source Port Range: All
Destination Port Range: 80
Description: HTTP

Stateless: No
Source: 0.0.0.0/0
IP Protocol: TCP
Source Port Range: All
Destination Port Range: 443
Description: HTTPS
```

### En el servidor (UFW):

```bash
# Permitir HTTP y HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp  # SSH (si no está permitido)

# Verificar estado
sudo ufw status
```

---

## 🚀 DEPLOYMENT CON PM2

### Crear archivo de configuración PM2

```bash
cd ~/operia
nano ecosystem.config.js
```

### Contenido del archivo

```javascript
module.exports = {
  apps: [{
    name: 'operia',
    script: './backend/server-postgres.js',
    instances: 2,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    max_memory_restart: '500M',
    autorestart: true,
    watch: false
  }]
};
```

### Crear directorio de logs

```bash
mkdir -p ~/operia/logs
```

### Iniciar aplicación

```bash
# Ir al directorio
cd ~/operia

# Instalar dependencias (si no se hizo antes)
npm install --production

# Iniciar con PM2
pm2 start ecosystem.config.js

# Guardar configuración de PM2
pm2 save

# Configurar PM2 para iniciar al boot
pm2 startup
# Ejecutar el comando que PM2 te muestra
```

### Comandos útiles de PM2

```bash
# Ver estado
pm2 status

# Ver logs
pm2 logs operia

# Reiniciar
pm2 restart operia

# Detener
pm2 stop operia

# Eliminar
pm2 delete operia

# Monitorear
pm2 monit
```

---

## 🧪 TESTING POST-DEPLOYMENT

### 1. Verificar que el servidor responde

```bash
# Desde el servidor
curl http://localhost:3000

# Desde tu computadora
curl https://operia.cl
```

### 2. Crear tenant de prueba

```bash
# Ir a https://operia.cl/signup
# Crear organización con subdomain "demo"
# Verificar que funciona en https://demo.operia.cl
```

### 3. Verificar base de datos

```bash
# Conectar a PostgreSQL
psql -U operia_user -d operia_production

# Ver tenants
SELECT id, name, subdomain, plan FROM tenants;

# Salir
\q
```

### 4. Verificar logs

```bash
# Logs de PM2
pm2 logs operia --lines 100

# Logs de Nginx
sudo tail -f /var/log/nginx/operia_access.log
sudo tail -f /var/log/nginx/operia_error.log
```

---

## 🔄 ACTUALIZACIÓN DEL CÓDIGO

### Proceso de actualización

```bash
# Ir al directorio
cd ~/operia

# Pull cambios desde GitHub
git pull origin main

# Instalar nuevas dependencias (si hay)
npm install --production

# Ejecutar migraciones (si hay)
node scripts/migrate.js

# Reiniciar aplicación
pm2 restart operia
```

---

## 📊 MONITOREO Y MANTENIMIENTO

### Backups automáticos de PostgreSQL

```bash
# Crear script de backup
sudo nano /usr/local/bin/backup-operia-db.sh
```

```bash
#!/bin/bash
BACKUP_DIR="/home/ubuntu/backups"
DATE=$(date +%Y%m%d_%H%M%S)
FILENAME="operia_backup_$DATE.sql"

mkdir -p $BACKUP_DIR

pg_dump -U operia_user operia_production > $BACKUP_DIR/$FILENAME

# Comprimir
gzip $BACKUP_DIR/$FILENAME

# Eliminar backups antiguos (más de 7 días)
find $BACKUP_DIR -name "operia_backup_*.sql.gz" -mtime +7 -delete

echo "Backup completado: $FILENAME.gz"
```

```bash
# Dar permisos de ejecución
sudo chmod +x /usr/local/bin/backup-operia-db.sh

# Agregar a crontab (diario a las 2 AM)
crontab -e

# Agregar esta línea:
0 2 * * * /usr/local/bin/backup-operia-db.sh >> /home/ubuntu/backups/backup.log 2>&1
```

### Monitoreo de recursos

```bash
# Ver uso de CPU y memoria
pm2 monit

# Ver uso de disco
df -h

# Ver procesos
htop
```

---

## 🐛 TROUBLESHOOTING

### Problema: Nginx no inicia

```bash
# Verificar configuración
sudo nginx -t

# Ver logs de error
sudo tail -f /var/log/nginx/error.log

# Verificar que el puerto 80/443 no esté en uso
sudo netstat -tulpn | grep :80
sudo netstat -tulpn | grep :443
```

### Problema: Aplicación no responde

```bash
# Ver logs de PM2
pm2 logs operia --lines 100

# Verificar que el proceso está corriendo
pm2 status

# Reiniciar
pm2 restart operia

# Ver si el puerto 3000 está en uso
sudo netstat -tulpn | grep :3000
```

### Problema: Error de conexión a base de datos

```bash
# Verificar que PostgreSQL está corriendo
sudo systemctl status postgresql

# Verificar credenciales en .env
cat ~/operia/.env | grep DATABASE_URL

# Probar conexión manual
psql -U operia_user -d operia_production -h localhost
```

### Problema: SSL no funciona

```bash
# Verificar certificados
sudo ls -la /etc/ssl/cloudflare/

# Verificar configuración de Nginx
sudo nginx -t

# Ver logs de Nginx
sudo tail -f /var/log/nginx/operia_error.log
```

---

## ✅ CHECKLIST FINAL DE DEPLOYMENT

### Pre-deployment
- [ ] Base de datos creada
- [ ] Usuario PostgreSQL creado
- [ ] Migraciones ejecutadas
- [ ] Archivo .env configurado
- [ ] Dependencias instaladas

### Nginx
- [ ] Archivo de configuración creado
- [ ] Symlink creado en sites-enabled
- [ ] Certificados SSL instalados
- [ ] Nginx reiniciado sin errores

### Firewall
- [ ] Puertos 80 y 443 abiertos en Oracle Cloud
- [ ] UFW configurado (si se usa)

### Aplicación
- [ ] PM2 configurado
- [ ] Aplicación iniciada
- [ ] PM2 configurado para auto-start

### Testing
- [ ] Landing page accesible (https://operia.cl)
- [ ] Signup funciona
- [ ] Tenant de prueba creado
- [ ] Subdominio funciona (https://demo.operia.cl)
- [ ] Login funciona
- [ ] Onboarding funciona
- [ ] Pagos con Flow funcionan

### Post-deployment
- [ ] Backups automáticos configurados
- [ ] Monitoreo configurado
- [ ] Logs revisados

---

## 📞 COMANDOS RÁPIDOS DE REFERENCIA

```bash
# Reiniciar todo
pm2 restart operia && sudo systemctl restart nginx

# Ver logs en tiempo real
pm2 logs operia --lines 50

# Backup manual de base de datos
pg_dump -U operia_user operia_production > backup_$(date +%Y%m%d).sql

# Verificar estado general
pm2 status && sudo systemctl status nginx && sudo systemctl status postgresql

# Limpiar logs de PM2
pm2 flush operia
```

---

**Última actualización:** 16 Feb 2026 20:45 PM  
**Servidor:** Oracle Cloud ARM (165.1.121.121)  
**Dominio:** operia.cl  
**Versión:** 2.0.0-postgres-flow
