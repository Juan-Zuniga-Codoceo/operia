// backend/services/email.service.js
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.resend.com',
  port: 465,
  secure: true,
  auth: {
    user: 'resend',
    pass: process.env.RESEND_API_KEY
  }
});

console.log('📧 Email Service Initialized. API Key Length:', process.env.RESEND_API_KEY ? process.env.RESEND_API_KEY.length : 0);

/**
 * Función para enviar un correo electrónico.
 * @param {string} to - El destinatario del correo.
 * @param {string} subject - El asunto del correo.
 * @param {string} html - El contenido HTML del correo.
 */
const sendEmail = async (to, subject, html) => {
  if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY.length < 5) {
    console.warn('⚠️ RESEND_API_KEY is missing or invalid. Email execution skipped.');
    return;
  }

  const mailOptions = {
    from: '"Operia" <notificaciones@operia.cl>',
    to: to,
    subject: subject,
    html: html
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ Correo enviado exitosamente a: ${to} vía Resend`);
  } catch (error) {
    console.error(`❌ Error al enviar correo a ${to} vía Resend:`, error.message);
    // Do not throw, just log
  }
};

module.exports = { sendEmail };