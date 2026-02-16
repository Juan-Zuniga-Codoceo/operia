// backend/services/email-template.service.js
// Email template generator with invitation template
const createEmailTemplate = ({ title, recipientName, mainContentHtml, buttonUrl, buttonText, footerText }) => {
  return `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title || 'Operia'}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
        <tr>
            <td style="padding: 40px 20px;">
                <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto; background-color: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 40px 30px; text-align: center; background: linear-gradient(135deg, #006837 0%, #00a651 100%); border-radius: 8px 8px 0 0;">
                            <h1 style="margin: 0; color: white; font-size: 28px; font-weight: bold;">Operia</h1>
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px;">
                            ${recipientName ? `<p style="margin: 0 0 20px; font-size: 16px; color: #333;">Hola ${recipientName},</p>` : ''}
                            ${mainContentHtml}
                        </td>
                    </tr>
                    
                    <!-- Button -->
                    ${buttonUrl ? `
                    <tr>
                        <td style="padding: 0 40px 40px; text-align: center;">
                            <a href="${buttonUrl}" style="display: inline-block; padding: 14px 32px; background-color: #006837; color: white; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: bold;">${buttonText || 'Ver más'}</a>
                        </td>
                    </tr>
                    ` : ''}
                    
                    <!-- Footer -->
                    <tr>
                        <td style="padding: 30px 40px; background-color: #f9f9f9; border-radius: 0 0 8px 8px; text-align: center; border-top: 1px solid #eee;">
                            <p style="margin: 0; font-size: 14px; color: #7f8c8d;">
                                ${footerText || 'Este es un correo automático de Operia. Por favor, no respondas a este email.'}
                            </p>
                            <p style="margin: 10px 0 0; font-size: 12px; color: #95a5a6;">
                                © ${new Date().getFullYear()} Operia. Todos los derechos reservados.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
  `;
};

/**
 * Create invitation email template
 */
const createInvitationEmail = ({ recipientEmail, inviterName, companyName, invitationUrl, expiresInDays = 7 }) => {
  return createEmailTemplate({
    title: `Invitación a ${companyName}`,
    recipientName: recipientEmail.split('@')[0], // Use email username if no name provided
    mainContentHtml: `
      <p style="margin: 0 0 20px; font-size: 16px; color: #333; line-height: 1.6;">
        <strong>${inviterName}</strong> te ha invitado a unirte al equipo de <strong>${companyName}</strong> en Operia.
      </p>
      <p style="margin: 0 0 20px; font-size: 16px; color: #333; line-height: 1.6;">
        Operia es una plataforma integral de gestión operativa que te permite:
      </p>
      <ul style="margin: 0 0 20px 20px; font-size: 16px; color: #333; line-height: 1.8;">
        <li>Gestionar tareas y proyectos del equipo</li>
        <li>Administrar clientes y seguimientos</li>
        <li>Colaborar con tu equipo en tiempo real</li>
        <li>Organizar documentación técnica</li>
      </ul>
      <p style="margin: 0 0 10px; font-size: 16px; color: #333; line-height: 1.6;">
        Haz clic en el botón de abajo para aceptar la invitación y crear tu cuenta.
      </p>
      <p style="margin: 0; font-size: 14px; color: #7f8c8d;">
        <em>Esta invitación expira en ${expiresInDays} días.</em>
      </p>
    `,
    buttonUrl: invitationUrl,
    buttonText: 'Aceptar Invitación',
    footerText: `Si no esperabas esta invitación, puedes ignorar este correo.`
  });
};

module.exports = {
  createEmailTemplate,
  createInvitationEmail
};