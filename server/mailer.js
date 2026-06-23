import { runtimeConfig } from "./runtimeConfig.js";

function hasEmailProvider() {
  return runtimeConfig.emailProvider === "resend" && runtimeConfig.resendApiKey && runtimeConfig.emailFrom;
}

export function isEmailDeliveryConfigured() {
  return hasEmailProvider();
}

export async function sendPasswordResetEmail({ to, code, expiresAt }) {
  if (!hasEmailProvider()) {
    return { sent: false, reason: "email_not_configured" };
  }

  const subject = "Codigo de recuperacion LIGA TEC";
  const minutes = Math.max(1, Math.round((new Date(expiresAt).getTime() - Date.now()) / 60000));
  const text = [
    "Solicitud de recuperacion de contraseña para LIGA TEC.",
    "",
    `Codigo: ${code}`,
    `Vigencia aproximada: ${minutes} minutos.`,
    "",
    "Si no solicitaste este codigo, ignora este mensaje y avisa al administrador de tu liga."
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
      <h1 style="margin:0 0 12px;color:#06111f">LIGA TEC</h1>
      <p>Solicitud de recuperacion de contraseña.</p>
      <p style="font-size:22px;font-weight:800;letter-spacing:2px">${code}</p>
      <p>Este codigo vence en aproximadamente ${minutes} minutos.</p>
      <p style="color:#6b7280">Si no solicitaste este codigo, ignora este mensaje y avisa al administrador de tu liga.</p>
    </div>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${runtimeConfig.resendApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: runtimeConfig.emailFrom,
      to,
      subject,
      text,
      html
    })
  });

  if (!response.ok) {
    return { sent: false, reason: "email_provider_error" };
  }

  return { sent: true };
}
