import { Resend } from 'resend';

function getMailConfig() {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  const from = String(process.env.EMAIL_FROM || '').trim();

  if (!apiKey || !from) {
    const error = new Error('Email delivery is not configured');
    error.status = 503;
    throw error;
  }

  return { apiKey, from };
}

/**
 * Envía el único tipo de correo transaccional que necesita la cuenta por ahora.
 * El enlace sólo contiene un token aleatorio de un uso; su hash es el único
 * valor persistido en la base de datos.
 */
export async function sendEmailChangeVerification({ to, verificationUrl }) {
  const { apiKey, from } = getMailConfig();
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to: [to],
    subject: 'Confirma tu nuevo correo de The Show Verse',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#18181b">
        <h1 style="font-size:24px">Confirma tu nuevo correo</h1>
        <p>Has solicitado usar esta dirección en tu cuenta de The Show Verse.</p>
        <p>
          <a href="${verificationUrl}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#10b981;color:#04110d;text-decoration:none;font-weight:700">
            Confirmar correo
          </a>
        </p>
        <p style="color:#71717a;font-size:13px">Este enlace caduca en 30 minutos. Si no has solicitado el cambio, puedes ignorar este correo.</p>
      </div>
    `,
    text: `Confirma tu nuevo correo de The Show Verse: ${verificationUrl}\n\nEl enlace caduca en 30 minutos. Si no solicitaste este cambio, ignora este mensaje.`,
  });

  if (error) {
    const sendError = new Error('No se pudo enviar el correo de verificación');
    sendError.status = 502;
    throw sendError;
  }
}
