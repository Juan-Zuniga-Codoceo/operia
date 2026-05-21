# Guía de Despliegue en Producción - Operia SaaS

Esta guía detalla los pasos y comandos necesarios para realizar la subida a producción del sistema **Operia** en el servidor de nube, incluyendo el uso de llaves SSH, configuración de variables de entorno y comandos de PM2.

---

## 🖥️ Información del Servidor de Producción

* **Servidor:** Oracle Cloud Infrastructure (OCI) ARM Instance (Ubuntu Server).
* **IP Pública:** `165.1.121.121`
* **Usuario:** `ubuntu`
* **Directorio de la Aplicación:** `/home/ubuntu/operia`
* **Base de Datos:** PostgreSQL local en el servidor (`operia_production`, administrada en el puerto predeterminado `5432`).
* **Servidor Web:** Nginx actuando como Proxy Inverso (escucha en puerto `80`/`443` con SSL administrado por Certbot y redirige internamente a la aplicación en el puerto `4000`).

---

## 🔑 Llaves y Credenciales SSH

La llave privada para conectarse al servidor se encuentra en tu máquina local en la siguiente ruta:
`"/home/juan/D/Importantes/Importante servidor/operia/ssh-key-2026-02-16.key"`

> [!IMPORTANT]
> Debido a que esta llave se encuentra en una partición de disco montada con permisos abiertos por defecto (`0777`), SSH de Linux la ignorará a menos que se copie a una carpeta local del sistema de archivos Linux (como `~/.ssh/`) y se le asignen permisos restrictivos (`600`).

### Preparación local de la llave (Ejecutar solo una vez o si borras la copia):
```bash
# 1. Crear el directorio .ssh si no existe
mkdir -p ~/.ssh

# 2. Copiar la llave privada al directorio local .ssh
cp "/home/juan/D/Importantes/Importante servidor/operia/ssh-key-2026-02-16.key" ~/.ssh/oracle_cloud_production.key

# 3. Asignar los permisos seguros requeridos
chmod 600 ~/.ssh/oracle_cloud_production.key
```

---

## 🚀 Proceso de Despliegue Paso a Paso (Puesta en Producción)

Una vez que tengas la llave configurada localmente con los permisos correctos, sigue estos pasos:

### Paso 1: Subir cambios al repositorio de GitHub
Antes de actualizar el servidor, asegúrate de subir todos tus cambios locales a GitHub:
```bash
git add .
git commit -m "feat: descripción de tus cambios"
git push origin main
```

### Paso 2: Conectarse al servidor por SSH
```bash
ssh -i ~/.ssh/oracle_cloud_production.key ubuntu@165.1.121.121
```

### Paso 3: Actualizar el código en el servidor
Dentro de la sesión SSH en el servidor, ejecuta lo siguiente:
```bash
# 1. Navegar a la carpeta del proyecto
cd ~/operia

# 2. Traer el último código de GitHub
# (Si reescribiste el historial de git localmente, usa reset --hard para alinear producción exactamente con origin/main)
git fetch origin
git reset --hard origin/main

# 3. Instalar nuevas dependencias en producción (por ejemplo: zod, @google/generative-ai, etc.)
npm install --production
```

### Paso 4: Cargar Variables de Entorno (Si hubo cambios en el archivo `.env`)
Si añadiste nuevas claves (como `GEMINI_API_KEY`), agrégalas al archivo `.env` del servidor antes de reiniciar:
```bash
# Editar el archivo .env del servidor de producción
nano ~/operia/.env

# Agrega o actualiza las variables necesarias, por ejemplo:
# GEMINI_API_KEY=AIzaSy...
```

### Paso 5: Reiniciar la aplicación en PM2
Para que el servidor tome los cambios en el código y las nuevas variables del `.env`, reinicia las instancias con la bandera `--update-env`:
```bash
pm2 restart operia --update-env
```

### Paso 6: Verificar el estado del despliegue
Monitorea los logs para asegurarte de que el backend haya conectado a la base de datos PostgreSQL sin fallos:
```bash
# Ver los logs de salida y errores en tiempo real
pm2 logs operia --lines 30
```

---

## ⚙️ Configuración del Entorno de Producción (`.env`)

A modo de referencia rápida, el archivo `~/operia/.env` en el servidor contiene:

```env
# Database Configuration
DATABASE_URL=postgresql://operia_user:operia_secure_2026!@localhost:5432/operia_production

# Application Settings
APP_DOMAIN=operia.cl
APP_URL=https://operia.cl
NODE_ENV=production
PORT=4000
HOST=0.0.0.0

# JWT Secret
JWT_SECRET=operia_super_secret_2026

# Email Service (Resend)
RESEND_API_KEY=re_QWXMEvNL_3kM4mMJKsZAeCJfz1fnpsGx7

# Flow Payment Gateway (PRODUCCIÓN)
FLOW_API_KEY=6746B9FF-40AE-41D0-B897-57D9BL53BE55
FLOW_SECRET_KEY=7adde4dce1d693fb9d054e37e5c62dd6c9cecaa5
FLOW_API_URL=https://www.flow.cl/api
FLOW_WEBHOOK_URL=https://operia.cl/api/payments/webhook

# Google Gemini API Key (AI Intake)
GEMINI_API_KEY=AIzaSyBckso65HjUCRJDJ9KG8DPyaQr7cRmq6bs
```
