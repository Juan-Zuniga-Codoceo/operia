# 🔧 SOLUCIÓN ERROR 523 - CLOUDFLARE

## 🚨 PROBLEMA

**Error 523:** Origin Is Unreachable  
**Causa:** Cloudflare no puede conectarse al servidor de origen (Oracle Cloud)

## 📊 DIAGNÓSTICO

Según los logs, el servidor está corriendo en el **puerto 4000**, pero Nginx está configurado para el **puerto 3000**.

```
Logs PM2: 🚀 Operia corriendo en http://0.0.0.0:4000
Nginx:    proxy_pass http://localhost:3000;  ← PROBLEMA
```

---

## ✅ SOLUCIONES (3 OPCIONES)

### OPCIÓN 1: Cambiar Nginx al puerto 4000 (RÁPIDO) ⚡

```bash
# En el servidor Oracle Cloud
sudo nano /etc/nginx/sites-available/operia

# Cambiar esta línea:
# DE:   proxy_pass http://localhost:3000;
# A:    proxy_pass http://localhost:4000;

# Buscar TODAS las ocurrencias de :3000 y cambiarlas a :4000
# Hay 3 lugares en el archivo

# Verificar configuración
sudo nginx -t

# Reiniciar Nginx
sudo systemctl restart nginx

# Verificar que funciona
curl http://localhost:4000
```

### OPCIÓN 2: Cambiar PM2 al puerto 3000 (RECOMENDADO) ✅

```bash
# En el servidor Oracle Cloud
cd ~/operia

# Editar .env
nano .env

# Cambiar:
# DE:   PORT=4000
# A:    PORT=3000

# Guardar: Ctrl+O, Enter, Ctrl+X

# Reiniciar PM2
pm2 restart operia --update-env

# Verificar que funciona
curl http://localhost:3000
```

### OPCIÓN 3: Usar ecosystem.config.js (MEJOR PRÁCTICA) 🎯

```bash
# En el servidor Oracle Cloud
cd ~/operia

# Detener PM2
pm2 delete operia

# Editar ecosystem.config.js
nano ecosystem.config.js

# Asegurar que tenga:
env: {
  NODE_ENV: 'production',
  PORT: 3000  // ← Asegurar que sea 3000
}

# Iniciar con ecosystem
pm2 start ecosystem.config.js

# Guardar configuración
pm2 save

# Verificar
pm2 logs operia --lines 20
```

---

## 🔍 VERIFICACIÓN PASO A PASO

### 1. Verificar que el servidor Node.js responde

```bash
# En el servidor
curl http://localhost:3000
# Debe retornar HTML de la landing page

# O si está en puerto 4000
curl http://localhost:4000
```

### 2. Verificar que Nginx está corriendo

```bash
sudo systemctl status nginx
# Debe mostrar: active (running)

# Ver logs de Nginx
sudo tail -f /var/log/nginx/operia_error.log
```

### 3. Verificar firewall Oracle Cloud

**En Oracle Cloud Console:**
1. Ir a: Networking → Virtual Cloud Networks
2. Seleccionar tu VCN
3. Security Lists → Default Security List
4. Verificar Ingress Rules:
   - Puerto 80 (HTTP) - Source: 0.0.0.0/0
   - Puerto 443 (HTTPS) - Source: 0.0.0.0/0

### 4. Verificar UFW en el servidor

```bash
sudo ufw status

# Debe mostrar:
# 80/tcp    ALLOW    Anywhere
# 443/tcp   ALLOW    Anywhere
# 22/tcp    ALLOW    Anywhere

# Si no están permitidos:
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw reload
```

### 5. Verificar Cloudflare SSL Mode

**En Cloudflare Dashboard:**
1. Ir a: SSL/TLS → Overview
2. Verificar que esté en: **Full (strict)**
3. Si está en "Flexible", cambiar a "Full (strict)"

---

## 🚀 SOLUCIÓN COMPLETA PASO A PASO

### Paso 1: Detener PM2

```bash
pm2 delete operia
```

### Paso 2: Editar .env para usar puerto 3000

```bash
cd ~/operia
nano .env
```

Contenido del .env:
```env
DATABASE_URL=postgresql://operia_user:operia_secure_2026!@localhost:5432/operia_production
APP_DOMAIN=operia.cl
APP_URL=https://operia.cl
NODE_ENV=production
PORT=3000  # ← IMPORTANTE: Puerto 3000
HOST=0.0.0.0
JWT_SECRET=operia_super_secret_2026
FLOW_API_KEY=6746B9FF-40AE-41D0-B897-57D9BL53BE55
FLOW_SECRET_KEY=7adde4dce1d693fb9d054e37e5c62dd6c9cecaa5
FLOW_API_URL=https://www.flow.cl/api
FLOW_WEBHOOK_URL=https://operia.cl/api/payments/webhook
```

Guardar: Ctrl+O, Enter, Ctrl+X

### Paso 3: Iniciar con ecosystem.config.js

```bash
pm2 start ecosystem.config.js
pm2 save
```

### Paso 4: Verificar logs

```bash
pm2 logs operia --lines 20
```

Debe mostrar:
```
🚀 Operia corriendo en http://0.0.0.0:3000
```

### Paso 5: Verificar Nginx

```bash
# Verificar configuración
sudo nginx -t

# Si hay errores, editar
sudo nano /etc/nginx/sites-available/operia

# Asegurar que todas las líneas proxy_pass usen puerto 3000:
# proxy_pass http://localhost:3000;

# Reiniciar Nginx
sudo systemctl restart nginx
```

### Paso 6: Probar localmente

```bash
curl http://localhost:3000
# Debe retornar HTML

curl http://localhost
# Debe retornar HTML (a través de Nginx)
```

### Paso 7: Verificar desde fuera

```bash
# Desde tu computadora
curl https://operia.cl
# Debe retornar HTML de la landing page
```

---

## 🐛 TROUBLESHOOTING ADICIONAL

### Si sigue sin funcionar:

#### 1. Verificar que PM2 está usando el puerto correcto

```bash
pm2 describe operia | grep PORT
# Debe mostrar: PORT: 3000

# Si no, reiniciar con variables de entorno
pm2 restart operia --update-env
```

#### 2. Verificar que el puerto 3000 está escuchando

```bash
sudo netstat -tulpn | grep :3000
# Debe mostrar algo como:
# tcp6  0  0 :::3000  :::*  LISTEN  15599/node
```

#### 3. Verificar logs de Nginx en tiempo real

```bash
sudo tail -f /var/log/nginx/operia_access.log
sudo tail -f /var/log/nginx/operia_error.log
```

#### 4. Probar conexión directa al puerto 3000

```bash
# Desde el servidor
curl http://localhost:3000

# Si funciona, el problema está en Nginx
# Si no funciona, el problema está en Node.js
```

#### 5. Reiniciar todo

```bash
# Reiniciar PM2
pm2 restart operia

# Reiniciar Nginx
sudo systemctl restart nginx

# Verificar estado
pm2 status
sudo systemctl status nginx
```

---

## 📝 CHECKLIST DE VERIFICACIÓN

- [ ] PM2 corriendo en puerto 3000
- [ ] Nginx configurado para puerto 3000
- [ ] Firewall Oracle Cloud permite 80 y 443
- [ ] UFW permite 80 y 443
- [ ] Cloudflare SSL en "Full (strict)"
- [ ] curl http://localhost:3000 funciona
- [ ] curl http://localhost funciona
- [ ] curl https://operia.cl funciona

---

## 🎯 COMANDO RÁPIDO DE DIAGNÓSTICO

```bash
# Ejecutar este comando para diagnóstico completo
echo "=== PM2 Status ===" && \
pm2 status && \
echo -e "\n=== Nginx Status ===" && \
sudo systemctl status nginx --no-pager && \
echo -e "\n=== Puerto 3000 ===" && \
sudo netstat -tulpn | grep :3000 && \
echo -e "\n=== Test Local ===" && \
curl -s http://localhost:3000 | head -5 && \
echo -e "\n=== UFW Status ===" && \
sudo ufw status
```

---

## ✅ SOLUCIÓN MÁS PROBABLE

**El problema es que PM2 está corriendo en puerto 4000 pero Nginx busca en puerto 3000.**

**Solución rápida:**
```bash
cd ~/operia
pm2 delete operia
nano .env  # Cambiar PORT=3000
pm2 start ecosystem.config.js
pm2 save
```

**Verificar:**
```bash
pm2 logs operia --lines 5
# Debe mostrar: 🚀 Operia corriendo en http://0.0.0.0:3000
```

---

**Última actualización:** 16 Feb 2026 21:15 PM  
**Error:** 523 Origin Is Unreachable  
**Causa:** Desincronización de puertos entre PM2 y Nginx  
**Solución:** Sincronizar ambos al puerto 3000
