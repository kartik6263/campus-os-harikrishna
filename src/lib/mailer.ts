import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../env.js';

/**
 * Outgoing mail, over whatever SMTP account the deployment configures
 * (Gmail with an app password, Brevo, Resend, SES…). With none configured,
 * nothing is sent; `mailConfigured` tells callers so they can say so.
 */
export const mailConfigured = Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);

let transport: Transporter | null = null;

function transporter(): Transporter {
  transport ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  return transport;
}

export async function sendMail(to: string, subject: string, text: string, html?: string): Promise<boolean> {
  if (!mailConfigured) return false;
  await transporter().sendMail({ from: env.MAIL_FROM ?? env.SMTP_USER, to, subject, text, html });
  return true;
}
