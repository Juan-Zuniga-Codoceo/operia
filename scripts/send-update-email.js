// Cargar las variables de entorno (¡muy importante para las claves de la API!)
require('dotenv').config();

// Importar los módulos que ya usamos en el proyecto
const db = require('../backend/db');
const { sendEmail } = require('../backend/services/email.service');
const { createEmailTemplate } = require('../backend/services/email-template.service');

// --- Función principal asíncrona para enviar los correos ---
const sendUpdateAnnouncement = async () => {
  console.log('📢 Iniciando envío de correo de actualización a todos los usuarios...');

  try {
    // 1. Obtener todos los usuarios que tienen las notificaciones activadas
    const users = await new Promise((resolve, reject) => {
      // Usamos la columna 'email_notifications' que ya existe en tu tabla 'users'
     const sql = "SELECT name, email FROM users WHERE email = 'zcja.89@gmail.com'";
      db.all(sql, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    if (users.length === 0) {
      console.log('ℹ️ No hay usuarios suscritos para enviar correos. Proceso finalizado.');
      return;
    }

    console.log(`👥 Se encontraron ${users.length} usuarios para notificar.`);

    // 2. Definir el contenido del correo
    const subject = '🚀 ¡Nuevas Funciones y Mejoras en Operia!';
    const mainContentHtml = `
      <p style="color: #34495E; font-size: 16px;">Hemos trabajado en nuevas herramientas para mejorar tu productividad y la colaboración en equipo. Estas son las principales novedades:</p>
      <ul style="padding-left: 20px; color: #34495E;">
          <li style="margin-bottom: 15px;">
              <strong style="color: #049DD9;">Rol de Administrador:</strong>
              <p style="margin: 5px 0 0 0; color: #7F8C8D;">Ahora los superusuarios pueden editar, eliminar y gestionar las tareas de todo el equipo, asegurando que nada quede sin supervisión.</p>
          </li>
          <li style="margin-bottom: 15px;">
              <strong style="color: #049DD9;">Menciones en Comentarios:</strong>
              <p style="margin: 5px 0 0 0; color: #7F8C8D;">Puedes etiquetar a un compañero usando "@Nombre" en cualquier comentario. La persona mencionada recibirá una notificación directa para unirse a la conversación.</p>
          </li>
          <li style="margin-bottom: 15px;">
              <strong style="color: #049DD9;">Corrección General de Errores:</strong>
              <p style="margin: 5px 0 0 0; color: #7F8C8D;">Hemos mejorado la estabilidad de la plataforma y corregido el error que a veces mostraba un creador incorrecto en las tareas.</p>
          </li>
      </ul>
    `;

    // 3. Iterar sobre cada usuario y enviar el correo
    for (const user of users) {
      // Usamos la plantilla de correo que ya tienes
      const finalHtml = createEmailTemplate({
        title: '¡Tenemos Novedades!',
        recipientName: user.name,
        mainContentHtml: mainContentHtml,
        buttonUrl: `${process.env.APP_URL || 'http://localhost:3000'}/tablero`,
        buttonText: 'Explorar las Mejoras'
      });

      await sendEmail(user.email, subject, finalHtml);
      
      // Pequeña pausa para no saturar el servicio de correos
      await new Promise(resolve => setTimeout(resolve, 200)); 
    }

    console.log('✅ Proceso de notificación de actualizaciones finalizado con éxito.');

  } catch (error) {
    console.error('❌ Error fatal durante el envío de correos de actualización:', error);
  } finally {
    // 4. Cerrar la conexión a la base de datos para que el script termine
    db.close((err) => {
      if (err) console.error('Error al cerrar la base de datos', err.message);
    });
  }
};

// --- Ejecutar la función ---
sendUpdateAnnouncement();