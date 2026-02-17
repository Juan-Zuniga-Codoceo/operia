# 🔧 INSTRUCCIONES PARA ACTUALIZAR AL PUERTO 4000

## 📋 CONTEXTO

El puerto 3000 está siendo usado por otro servicio (bot de trabajo), por lo que Operia debe usar el puerto **4000**.

## ✅ ARCHIVOS YA ACTUALIZADOS

Los siguientes archivos ya están configurados para puerto 4000:
- ✅ `nginx.conf` - Todas las referencias cambiadas a :4000
- ✅ `ecosystem.config.js` - PORT: 4000
- ✅ `.env.production` - PORT=4000

---

## 🚀 PASOS PARA APLICAR EN EL SERVIDOR

### 1. Copiar nginx.conf actualizado (2 min)

```bash
# En el servidor Oracle Cloud
cd ~/operia

# Copiar la nueva configuración
sudo cp nginx.conf /etc/nginx/sites-available/operia

# Verificar que no hay errores
sudo nginx -t

# Debe mostrar:
# nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
# nginx: configuration file /etc/nginx/nginx.conf test is successful

# Reiniciar Nginx
sudo systemctl restart nginx

# Verificar estado
sudo systemctl status nginx
```

### 2. Actualizar .env en el servidor (1 min)

```bash
cd ~/operia

# Editar .env
nano .env

# Cambiar la línea PORT:
# DE:   PORT=3000
# A:    PORT=4000

# Guardar: Ctrl+O, Enter, Ctrl+X
```

O copiar el archivo .env.production:
```bash
cp .env.production .env
```

### 3. Reiniciar PM2 (1 min)

```bash
# Detener PM2
pm2 delete operia

# Iniciar con ecosystem.config.js actualizado
pm2 start ecosystem.config.js

# Guardar configuración
pm2 save

# Verificar logs
pm2 logs operia --lines 20
```

Debe mostrar:
```
🚀 Operia corriendo en http://0.0.0.0:4000
```

### 4. Verificar que funciona (1 min)

```bash
# Probar localmente
curl http://localhost:4000
# Debe retornar HTML de la landing page

# Probar a través de Nginx
curl http://localhost
# Debe retornar HTML

# Verificar puerto
sudo netstat -tulpn | grep :4000
# Debe mostrar: tcp6  0  0 :::4000  :::*  LISTEN  [PID]/node
```

### 5. Verificar desde fuera (1 min)

```bash
# Desde tu computadora
curl https://operia.cl
# Debe retornar HTML de la landing page

# O abrir en navegador:
# https://operia.cl
```

---

## 📊 VERIFICACIÓN COMPLETA

### Comando de diagnóstico:

```bash
echo "=== PM2 Status ===" && \
pm2 status && \
echo -e "\n=== Nginx Status ===" && \
sudo systemctl status nginx --no-pager && \
echo -e "\n=== Puerto 4000 ===" && \
sudo netstat -tulpn | grep :4000 && \
echo -e "\n=== Test Local ===" && \
curl -s http://localhost:4000 | head -5 && \
echo -e "\n=== Test Nginx ===" && \
curl -s http://localhost | head -5
```

---

## ✅ CHECKLIST

- [ ] nginx.conf copiado a /etc/nginx/sites-available/operia
- [ ] nginx -t sin errores
- [ ] Nginx reiniciado
- [ ] .env actualizado con PORT=4000
- [ ] PM2 reiniciado con ecosystem.config.js
- [ ] PM2 logs muestra puerto 4000
- [ ] curl http://localhost:4000 funciona
- [ ] curl http://localhost funciona
- [ ] curl https://operia.cl funciona
- [ ] Navegador muestra https://operia.cl correctamente

---

## 🐛 TROUBLESHOOTING

### Si Nginx no inicia:

```bash
# Ver logs de error
sudo tail -f /var/log/nginx/error.log

# Verificar configuración
sudo nginx -t

# Verificar que el archivo existe
ls -la /etc/nginx/sites-available/operia
ls -la /etc/nginx/sites-enabled/operia
```

### Si PM2 no inicia:

```bash
# Ver logs
pm2 logs operia --lines 50

# Verificar .env
cat ~/operia/.env | grep PORT

# Verificar ecosystem.config.js
cat ~/operia/ecosystem.config.js | grep PORT
```

### Si el puerto 4000 no responde:

```bash
# Verificar que está escuchando
sudo netstat -tulpn | grep :4000

# Si no aparece, verificar logs de PM2
pm2 logs operia --lines 50

# Reiniciar PM2
pm2 restart operia
```

---

## 🎯 RESUMEN DE CAMBIOS

### Antes (Puerto 3000):
```
PM2:   PORT=3000
Nginx: proxy_pass http://localhost:3000;
```

### Después (Puerto 4000):
```
PM2:   PORT=4000
Nginx: proxy_pass http://localhost:4000;
```

---

## 📞 COMANDOS RÁPIDOS

```bash
# Reiniciar todo
pm2 restart operia && sudo systemctl restart nginx

# Ver logs en tiempo real
pm2 logs operia

# Ver estado
pm2 status && sudo systemctl status nginx --no-pager

# Test completo
curl http://localhost:4000 && curl http://localhost && curl https://operia.cl
```

---

## ⏱️ TIEMPO TOTAL ESTIMADO: 5 minutos

1. Copiar nginx.conf: 2 min
2. Actualizar .env: 1 min
3. Reiniciar PM2: 1 min
4. Verificar: 1 min

---

**Última actualización:** 16 Feb 2026 21:22 PM  
**Puerto:** 4000 (cambiado desde 3000)  
**Razón:** Puerto 3000 ocupado por bot de trabajo  
**Estado:** ✅ Archivos actualizados, listo para aplicar en servidor
