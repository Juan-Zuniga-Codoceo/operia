const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.production') }); // Force load production env first

const { sendEmail } = require('../services/email.service');
const { createEmailTemplate } = require('../services/email-template.service');

const testEmail = async () => {
    const recipient = 'zcja.1989@gmail.com'; // Default test email (or user's email if known)

    console.log('--- TEST DE CORREO (RESEND) ---');
    console.log('API Key length:', process.env.RESEND_API_KEY ? process.env.RESEND_API_KEY.length : 'NULL');
    console.log('Enviando a:', recipient);

    const emailHtml = createEmailTemplate({
        title: 'Prueba de Sistema - Operia',
        recipientName: 'Administrador',
        mainContentHtml: '<p>Si ves este correo, el sistema de envío de emails está funcionando correctamente con la nueva API Key.</p>',
        buttonUrl: 'https://operia.cl',
        buttonText: 'Ir a Operia'
    });

    try {
        await sendEmail(recipient, 'Test de Correo Operia', emailHtml);
        console.log('✅ Correo enviado (revisar bandeja de entrada/spam)');
    } catch (error) {
        console.error('❌ Error fatal:', error);
    }
};

testEmail();
