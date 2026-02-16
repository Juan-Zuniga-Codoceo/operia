# Operia


Sistema integral de gestión de tareas y colaboración diseñado para optimizar el flujo de trabajo del equipo de Operia.

Operia transforma las responsabilidades diarias en un tablero Kanban visual, centralizando la comunicación, los archivos y la rendición de cuentas en un solo lugar.

---

## ✨ Características Principales

###  Kanban y Gestión de Tareas
* **Tablero Visual:** Organiza las tareas en columnas de "Pendientes", "En Camino" y "Completadas".
* **Asignación Dual:** Define claramente quién es el **Responsable Principal** (el dueño de la tarea) y quiénes son los **Asignados** (los participantes).
* **Prioridades y Fechas:** Establece prioridades (Alta, Media, Baja) y fechas de vencimiento para una organización clara.
* **Archivado Automático:** Las tareas completadas se archivan solas después de 2 días para mantener un tablero limpio y enfocado.

### Colaboración en Equipo
* **Notificaciones en Tiempo Real:** El tablero se actualiza para todos los usuarios al instante sin necesidad de refrescar la página.
* **Comentarios y Menciones:** Discute los detalles dentro de cada tarea y notifica a tus compañeros usando `@menciones`.
* **Archivos Adjuntos:** Sube documentos, PDFs o imágenes directamente a las tareas o a los comentarios.
* **Resúmenes por Correo:** Recibe un email automático cada mañana con las tareas que vencen en el día.

### Módulos Avanzados
* **Biblioteca de Fichas Técnicas:** Un módulo dedicado para subir, categorizar y buscar Fichas Técnicas de productos en formato PDF.
* **Panel de Administración:** Una vista protegida para que los administradores gestionen las cuentas de usuario, roles y permisos del sistema
* **Perfiles de Usuario:** Cada usuario puede personalizar su perfil subiendo un avatar y gestionando sus preferencias de notificación
---

## 🛠️ Stack Tecnológico

* **Backend:** Node.js, Express, y SQLite3
* **Frontend:** Vue.js 3 (CDN Global Build)
* **Tiempo Real:** WebSockets (`ws`)
* **Autenticación:** JWT (JSON Web Tokens) y bcrypt
* **Correos:** Nodemailer
* **Despliegue:** Desplegado en Netlify (Frontend)  y Render (Backend).

---

## 🚀 Cómo Empezar (Desarrollo Local)

### Requisitos
* Node.js (v14 o superior)
* NPM

### Pasos
1.  **Clonar el repositorio**
    ```bash
    git clone https://github.com/Juan-Zuniga-Codoceo/operia
    cd operia
    ```

2.  **Instalar dependencias**
    ```bash
    npm install
    ```

3.  **Configurar el entorno**
    Crea un archivo `.env` en la raíz del proyecto y añade las claves necesarias (como `JWT_SECRET`, `RESEND_API_KEY`, etc.).

4.  **Inicializar la Base de Datos**
    Este comando creará el archivo `database.sqlite` y todas las tablas necesarias.
    ```bash
    npm run init-db
    ```

5.  **Iniciar el servidor de desarrollo**
    Esto utiliza `nodemon` para reiniciar el servidor automáticamente con cada cambio.
    ```bash
    npm run dev
    ```

6.  **Abrir la aplicación**
    Visita `http://localhost:3000` en tu navegador.

### Scripts Útiles
* `npm run dev`: Inicia el servidor en modo desarrollo.
* `npm start`: Inicia el servidor en modo producción.
* `npm run init-db`: Crea o actualiza el esquema de la base de datos local.