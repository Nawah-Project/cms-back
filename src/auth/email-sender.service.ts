import {
  BadRequestException,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import * as net from 'node:net';
import * as tls from 'node:tls';
import { PrismaService } from '../prisma/prisma.service';
import { EmailDeliveryStatus, EmailType } from '@prisma/client';

export interface SendVerificationOtpParams {
  to: string;
  name: string;
  code: string;
  expiresInMinutes?: number;
}

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
}

@Injectable()
export class EmailSenderService {
  private readonly logger = new Logger(EmailSenderService.name);
  public lastSentOtpForTest: { to: string; code: string } | null = null;

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  isSmtpConfigured(): boolean {
    return Boolean(process.env.SMTP_HOST?.trim());
  }

  getSmtpStatus(): {
    configured: boolean;
    host: string | null;
    port: number | null;
    from: string | null;
    user: string | null;
  } {
    const config = this.getSmtpConfig();
    return {
      configured: Boolean(config),
      host: config?.host ?? null,
      port: config?.port ?? null,
      from: config?.from ?? null,
      user: config?.user ?? null,
    };
  }

  private getSmtpConfig(): SmtpConfig | null {
    const host = process.env.SMTP_HOST?.trim();
    if (!host) return null;

    const port = Number(process.env.SMTP_PORT?.trim() || '465');
    const secureEnv = process.env.SMTP_SECURE?.trim().toLowerCase();
    const secure =
      secureEnv === 'true'
        ? true
        : secureEnv === 'false'
          ? false
          : port === 465;
    const user = process.env.SMTP_USER?.trim() || undefined;
    const pass = process.env.SMTP_PASS?.trim() || undefined;
    const from =
      process.env.SMTP_FROM?.trim() ||
      (user
        ? `Nawah Platform <${user}>`
        : 'Nawah Platform <no-reply@nawah.local>');

    return { host, port, secure, user, pass, from };
  }

  async sendVerificationOtp(params: SendVerificationOtpParams): Promise<void> {
    const { to, name, code, expiresInMinutes = 15 } = params;
    if (process.env.NODE_ENV === 'test') this.lastSentOtpForTest = { to, code };

    const smtpConfig = this.getSmtpConfig();
    if (!smtpConfig) {
      if (process.env.NODE_ENV === 'test') return;
      throw new BadRequestException(
        'Email delivery is unavailable. Request a new verification code later.',
      );
    }

    const subject = 'تفعيل حساب نواة | Nawah Verification';
    const textBody = [
      `مرحباً ${name}،`,
      ``,
      `كود تفعيل بريدك الإلكتروني في منصة نواة للتوجيه والتطوير المهني هو:`,
      `${code}`,
      ``,
      `هذا الكود صالح لمدة ${expiresInMinutes} دقيقة. لا تشاركه مع أي شخص.`,
      `---`,
      `Hello ${name},`,
      `Your Nawah Platform email verification code is: ${code}`,
      `This code is valid for ${expiresInMinutes} minutes.`,
    ].join('\r\n');

    const htmlBody = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>تأكيد البريد الإلكتروني - منصة نواة</title>
</head>
<body style="margin:0;padding:24px;background-color:#f8fafc;font-family:'Segoe UI',Tahoma,Arial,sans-serif;color:#0f172a;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
    <div style="text-align:right;direction:rtl;">
      <span style="display:inline-block;background:#e0f2fe;color:#0369a1;padding:4px 12px;border-radius:999px;font-size:12px;font-weight:600;">منصة نواة للتوجيه والتطوير المهني</span>
      <h2 style="margin:16px 0 8px;font-size:22px;color:#0f172a;">تأكيد بريدك الإلكتروني</h2>
      <p style="margin:0 0 20px;font-size:14px;line-height:1.7;color:#475569;">
        مرحباً <strong>${this.escapeHtml(name)}</strong>، أشكرك على انضمامك إلى منصة نواة. يرجى إدخال كود التحقق التالي لتفعيل حسابك:
      </p>
      <div style="background:#f1f5f9;border:2px dashed #cbd5e1;border-radius:12px;padding:18px;text-align:center;margin:24px 0;">
        <span style="font-size:32px;font-weight:700;letter-spacing:8px;color:#0f172a;font-family:monospace;">${code}</span>
      </div>
      <p style="margin:0;font-size:12px;color:#64748b;">
        صلاحية هذا الكود <strong>${expiresInMinutes} دقيقة</strong>. إذا لم تقم بطلب إنشاء حساب، يمكنك تجاهل هذه الرسالة بأمان.
      </p>
    </div>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
    <div style="text-align:left;direction:ltr;font-size:13px;color:#475569;">
      <p style="margin:0 0 8px;">Hello <strong>${this.escapeHtml(name)}</strong>,</p>
      <p style="margin:0;">Your Nawah verification code is <strong>${code}</strong> (valid for ${expiresInMinutes} minutes).</p>
    </div>
  </div>
</body>
</html>`;

    let deliveryStatus: EmailDeliveryStatus = EmailDeliveryStatus.DELIVERED;
    let deliveryError: string | null = null;

    try {
      await this.sendSmtpMail(smtpConfig, {
        to,
        subject,
        text: textBody,
        html: htmlBody,
      });
      this.logger.log(`Sent verification OTP email to ${to}`);
    } catch (error) {
      deliveryStatus = EmailDeliveryStatus.FAILED;
      deliveryError = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to send verification OTP email to ${to} via SMTP (${smtpConfig.host}:${smtpConfig.port})`,
      );
      throw new BadRequestException(
        'Verification email delivery failed. Please retry later.',
      );
    } finally {
      if (this.prisma?.emailDeliveryLog) {
        try {
          await this.prisma.emailDeliveryLog.create({
            data: {
              recipientEmail: to,
              recipientName: name,
              subject,
              bodyText: '[Verification content redacted]',
              bodyHtml: null,
              type: EmailType.VERIFICATION_OTP,
              channel: 'EMAIL',
              status: deliveryStatus,
              errorMessage: deliveryError ? 'SMTP delivery failed' : null,
              sentAt:
                deliveryStatus === EmailDeliveryStatus.DELIVERED
                  ? new Date()
                  : null,
            },
          });
        } catch {
          // Ignore logging failures
        }
      }
    }
  }

  async checkQuotaAndSafeReserve(countToAdd = 1, isOtp = false): Promise<void> {
    if (!this.prisma?.emailDeliveryLog) return;

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const config = await this.prisma.notificationConfig.findUnique({
      where: { id: 'default' },
    });
    const dailyLimit = config?.dailyEmailLimit ?? 100;
    const otpSafeReserve = config?.otpSafeReserve ?? 15;
    const otpSafeReserveEnabled = config?.otpSafeReserveEnabled ?? true;

    const usedToday = await this.prisma.emailDeliveryLog.count({
      where: {
        createdAt: { gte: startOfDay },
        status: { not: EmailDeliveryStatus.FAILED },
      },
    });

    if (usedToday + countToAdd > dailyLimit) {
      throw new BadRequestException(
        `تم استنفاد الحد اليومي لإرسال البريد (${dailyLimit} رسالة). يتجدد الرصيد تلقائياً عند الساعة 12:00 ص.`,
      );
    }

    if (!isOtp && otpSafeReserveEnabled) {
      const nonOtpAllowedLimit = dailyLimit - otpSafeReserve;
      if (usedToday + countToAdd > nonOtpAllowedLimit) {
        throw new BadRequestException(
          `بلغ استهلاك البريد اليومي حد الأمان (${usedToday}/${dailyLimit}). تم إيقاف الإرسال العام لحجز آخر ${otpSafeReserve} رسالة لأكواد التفعيل OTP.`,
        );
      }
    }
  }

  async sendGeneralMail(params: {
    to: string;
    recipientName?: string;
    subject: string;
    text: string;
    html: string;
    type?: EmailType;
    userId?: string;
    channel?: string;
  }): Promise<{ success: boolean; error?: string }> {
    const {
      to,
      recipientName,
      subject,
      text,
      html,
      type = EmailType.SYSTEM_ANNOUNCEMENT,
      userId,
      channel = 'EMAIL',
    } = params;

    const isOtp = type === EmailType.VERIFICATION_OTP;
    await this.checkQuotaAndSafeReserve(1, isOtp);

    const smtpConfig = this.getSmtpConfig();
    let status: EmailDeliveryStatus = EmailDeliveryStatus.DELIVERED;
    let errorMessage: string | null = null;

    if (!smtpConfig) {
      this.logger.warn(
        `[SMTP NOT CONFIGURED] Simulated email send to ${to}: ${subject}`,
      );
      status = EmailDeliveryStatus.DELIVERED;
    } else {
      try {
        await this.sendSmtpMail(smtpConfig, {
          to,
          subject,
          text,
          html,
        });
        this.logger.log(`Sent email (${type}) to ${to}`);
      } catch (error) {
        status = EmailDeliveryStatus.FAILED;
        errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed sending email to ${to}: ${errorMessage}`);
      }
    }

    if (this.prisma?.emailDeliveryLog) {
      try {
        await this.prisma.emailDeliveryLog.create({
          data: {
            userId: userId ?? null,
            recipientEmail: to,
            recipientName: recipientName ?? null,
            subject,
            bodyText: text,
            bodyHtml: html,
            type,
            channel,
            status,
            errorMessage,
            sentAt:
              status === EmailDeliveryStatus.DELIVERED ? new Date() : null,
          },
        });
      } catch (logErr) {
        this.logger.error('Failed to log email delivery', logErr);
      }
    }

    if (status === EmailDeliveryStatus.FAILED) {
      throw new BadRequestException(
        `فشل إرسال البريد إلى ${to}: ${errorMessage}`,
      );
    }

    return { success: true };
  }

  private escapeHtml(input: string): string {
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private extractAddress(raw: string): string {
    const match = /<([^>]+)>/.exec(raw);
    return (match ? match[1] : raw).trim();
  }

  private encodeMimeHeader(value: string): string {
    return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
  }

  private async sendSmtpMail(
    config: SmtpConfig,
    mail: { to: string; subject: string; text: string; html: string },
  ): Promise<void> {
    const timeoutMs = 15_000;
    const fromEnvelope = this.extractAddress(config.from);
    const toEnvelope = this.extractAddress(mail.to);
    const boundary = `nawah_${randomUUID().replace(/-/g, '')}`;

    const rawSocket: net.Socket | tls.TLSSocket = await new Promise(
      (resolve, reject) => {
        const onError = (err: Error) => reject(err);
        const socket = config.secure
          ? tls.connect(
              {
                host: config.host,
                port: config.port,
                servername: config.host,
              },
              () => {
                socket.removeListener('error', onError);
                resolve(socket);
              },
            )
          : net.createConnection(
              { host: config.host, port: config.port },
              () => {
                socket.removeListener('error', onError);
                resolve(socket);
              },
            );
        socket.setTimeout(timeoutMs, () => {
          socket.destroy(new Error('SMTP connection timed out'));
        });
        socket.once('error', onError);
      },
    );

    let activeSocket: net.Socket | tls.TLSSocket = rawSocket;
    let buffer = '';

    const readResponse = (): Promise<{ code: number; message: string }> =>
      new Promise((resolve, reject) => {
        const onData = (chunk: Buffer) => {
          buffer += chunk.toString('utf8');
          const lines = buffer.split('\r\n');
          // Keep the last incomplete line in buffer
          for (let i = 0; i < lines.length - 1; i += 1) {
            const line = lines[i];
            if (/^\d{3} /.test(line)) {
              const consumed = lines.slice(0, i + 1).join('\r\n');
              buffer = lines.slice(i + 1).join('\r\n');
              cleanup();
              resolve({
                code: Number(line.slice(0, 3)),
                message: consumed,
              });
              return;
            }
          }
        };
        const onError = (err: Error) => {
          cleanup();
          reject(err);
        };
        const onClose = () => {
          cleanup();
          reject(new Error('SMTP connection closed unexpectedly'));
        };
        const cleanup = () => {
          activeSocket.removeListener('data', onData);
          activeSocket.removeListener('error', onError);
          activeSocket.removeListener('close', onClose);
        };
        activeSocket.on('data', onData);
        activeSocket.once('error', onError);
        activeSocket.once('close', onClose);
      });

    const sendCommand = async (
      command: string,
      expectedCodes: number[],
    ): Promise<string> => {
      activeSocket.write(`${command}\r\n`);
      const res = await readResponse();
      if (!expectedCodes.includes(res.code)) {
        throw new Error(`SMTP error (${res.code}): ${res.message}`);
      }
      return res.message;
    };

    try {
      const greeting = await readResponse();
      if (greeting.code !== 220) {
        throw new Error(`Unexpected SMTP greeting: ${greeting.message}`);
      }

      const ehloFeatures = await sendCommand(`EHLO localhost`, [250]);

      if (!config.secure && /STARTTLS/i.test(ehloFeatures)) {
        await sendCommand('STARTTLS', [220]);
        activeSocket = await new Promise<tls.TLSSocket>((resolve, reject) => {
          const tlsSocket = tls.connect(
            {
              socket: activeSocket as net.Socket,
              servername: config.host,
            },
            () => resolve(tlsSocket),
          );
          tlsSocket.once('error', reject);
        });
        buffer = '';
        await sendCommand(`EHLO localhost`, [250]);
      }

      if (config.user && config.pass) {
        await sendCommand('AUTH LOGIN', [334]);
        await sendCommand(
          Buffer.from(config.user, 'utf8').toString('base64'),
          [334],
        );
        await sendCommand(
          Buffer.from(config.pass, 'utf8').toString('base64'),
          [235],
        );
      }

      await sendCommand(`MAIL FROM:<${fromEnvelope}>`, [250]);
      await sendCommand(`RCPT TO:<${toEnvelope}>`, [250, 251]);
      await sendCommand('DATA', [354]);

      const messageHeaders = [
        `From: ${config.from}`,
        `To: <${toEnvelope}>`,
        `Subject: ${this.encodeMimeHeader(mail.subject)}`,
        `Message-ID: <${randomUUID()}@nawah.local>`,
        `Date: ${new Date().toUTCString()}`,
        `MIME-Version: 1.0`,
        `Content-Type: multipart/alternative; boundary="${boundary}"`,
        ``,
        `--${boundary}`,
        `Content-Type: text/plain; charset="UTF-8"`,
        `Content-Transfer-Encoding: base64`,
        ``,
        Buffer.from(mail.text, 'utf8')
          .toString('base64')
          .replace(/(.{76})/g, '$1\r\n'),
        ``,
        `--${boundary}`,
        `Content-Type: text/html; charset="UTF-8"`,
        `Content-Transfer-Encoding: base64`,
        ``,
        Buffer.from(mail.html, 'utf8')
          .toString('base64')
          .replace(/(.{76})/g, '$1\r\n'),
        ``,
        `--${boundary}--`,
        `.`,
      ].join('\r\n');

      await sendCommand(messageHeaders, [250]);
      await sendCommand('QUIT', [221]);
    } finally {
      activeSocket.destroy();
    }
  }
}
