# Operia - Sistema de Gestión Operativa

Operia es una plataforma integral de gestión de tareas, colaboración y automatización diseñada para optimizar los flujos de trabajo de los equipos de alto rendimiento. Transforma requerimientos desestructurados en tareas visuales dentro de un tablero Kanban, centralizando la comunicación, el control documental y la seguridad en un solo lugar.

---

## ✨ Características Principales

### 🤖 Operia AI Intake (Nueva Gran Actualización)
* **Ingesta Inteligente**: Procesa correos, minutas o chats de clientes (texto libre) usando el modelo **Gemini 2.5 Flash** para extraer automáticamente datos operativos (cliente, dirección, descripción, prioridad, etc.).
* **Validación Matemática de RUT**: El backend valida de forma determinista mediante el algoritmo **Módulo 11** los RUTs chilenos antes de registrar al cliente.
* **Flujo HITL (Human-in-the-Loop)**: Una consola interactiva en el frontend permite a los operadores revisar, editar e inspeccionar en Google Maps las direcciones detectadas antes de confirmarlas e insertarlas al Kanban.
* **Cálculo de Fechas Inteligente**: Identificación de fechas límite a partir de expresiones relativas de tiempo (ej. "el próximo lunes" o "para mañana").

### 📋 Kanban y Gestión de Tareas
* **Tablero Visual**: Organiza el flujo de trabajo en columnas dinámicas: *Pendientes*, *En Camino* y *Completadas*.
* **Asignación de Roles**: Define un *Responsable Principal* (dueño de la tarea) y múltiples *Asignados* (colaboradores).
* **Archivado Automático**: Las tareas completadas se archivan automáticamente tras 48 horas de inactividad para mantener limpio el espacio de trabajo.

### 👥 Colaboración en Tiempo Real
* **Mensajería Instantánea y Notificaciones**: Actualización instantánea de cambios en el tablero mediante WebSockets (`ws`).
* **Menciones**: Notificaciones dirigidas usando `@menciones` en comentarios de tareas.
* **Biblioteca Documental**: Módulo protegido para subir, categorizar y buscar Fichas Técnicas de productos en PDF.

### 🛡️ Seguridad y Administración
* **Autenticación Fuerte**: Control de sesiones con JSON Web Tokens (JWT) firmados y hashes bcrypt.
* **Roles y Permisos**: Panel de administración para habilitar/deshabilitar cuentas y modificar permisos de usuario.

---

## 🛠️ Stack Tecnológico

* **Backend**: Node.js, Express, SQLite3 (desarrollo local) y PostgreSQL (producción SaaS).
* **Frontend**: Vue.js 3 (CDN Build), TailwindCSS & Vanilla CSS.
* **Inteligencia Artificial**: API de Google Gemini (`gemini-2.5-flash`).
* **Comunicación en Tiempo Real**: WebSockets (`ws`).
* **Mailing**: Resend API y Nodemailer.

---

## 🚀 Cómo Empezar (Desarrollo Local)

### Requisitos Previos
* Node.js (v16 o superior)
* SQLite3 / PostgreSQL

### Configuración Paso a Paso

1. **Clonar el repositorio**
   ```bash
   git clone https://github.com/Juan-Zuniga-Codoceo/operia.git
   cd operia
   ```

2. **Instalar dependencias**
   ```bash
   npm install
   ```

3. **Configurar el entorno**
   Copia el archivo de ejemplo a tu archivo local `.env`:
   ```bash
   cp .env.example .env
   ```
   Rellena los valores locales de `JWT_SECRET`, `GEMINI_API_KEY`, `RESEND_API_KEY`, etc.

4. **Inicializar la base de datos**
   Crea y puebla el archivo SQLite local:
   ```bash
   npm run init-db
   ```

5. **Iniciar el servidor de desarrollo**
   Inicia la aplicación en modo desarrollo (recarga automática con nodemon):
   ```bash
   npm run dev
   ```
   Abre [http://localhost:4000](http://localhost:4000) en tu navegador.

---

## ⚙️ Scripts de npm Disponibles

* `npm run dev`: Arranca el servidor Express en modo desarrollo en el puerto 4000 con recarga en caliente.
* `npm start`: Inicia el servidor Express en producción.
* `npm run init-db`: Ejecuta los scripts de inicialización del esquema de base de datos.
* `npm run migrate`: Aplica las migraciones correspondientes a PostgreSQL/SQLite.