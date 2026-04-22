import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { EmailException } from '../common/expections/custom-exceptions';
import { ErrorCode } from '../common/expections/error-codes';

@Injectable()
export class EmailService {
  private transporter;
  private readonly logger = new Logger(EmailService.name);

  constructor(private configService: ConfigService) {
    const emailUser = this.configService.get<string>('email.user');
    const emailPassword = this.configService.get<string>('email.password');
    const emailHost = this.configService.get<string>('email.host');
    const emailPort = this.configService.get<number>('email.port');
    const emailSecure = this.configService.get<boolean>('email.secure');
    console.log(emailUser, emailPassword, emailHost, emailPort, emailSecure);
    if (!emailUser || !emailPassword) {
      this.logger.error('Email service not configured properly');
      throw new EmailException(
        ErrorCode.EMAIL_SERVICE_NOT_CONFIGURED,
        'Email service not configured properly',
        {
          missingFields: [
            !emailUser ? 'EMAIL_USER' : '',
            !emailPassword ? 'EMAIL_PASSWORD' : '',
          ].filter(Boolean),
        },
      );
    }

    this.transporter = nodemailer.createTransport({
      host: emailHost,
      port: emailPort,
      secure: emailSecure,
      auth: {
        user: emailUser,
        pass: emailPassword,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    });
  }

  async sendVerificationEmail(to: string, code: string): Promise<void> {
    try {
      this.validationHandler(to, code);

      const info = await this.transporter.sendMail({
        from: `"Another App" <${this.configService.get('EMAIL_USER')}>`,
        to: to,
        subject: 'Подтверждение регистрации',
        html: this.getEmailTemplate(code),
        text: `Ваш код подтверждения: ${code}. Код действителен 15 минут.`,
      });

      this.logger.log(`Email sent to ${to}, messageId: ${info.messageId}`);
    } catch (error) {
      this.errorHandler(error);
    }
  }
  async sendResetPasswordEmail(to: string, code: string): Promise<void> {
    try {
      this.validationHandler(to, code);

      const info = await this.transporter.sendMail({
        from: `"Another App" <${this.configService.get('EMAIL_USER')}>`,
        to: to,
        subject: 'Восстановление пароля',
        html: this.getEmailTemplatePassword(code),
        text: `Ваш код подтверждения: ${code}. Код действителен 15 минут.`,
      });

      this.logger.log(`Email sent to ${to}, messageId: ${info.messageId}`);
    } catch (error) {
      this.errorHandler(error);
    }
  }
  private validationHandler(to: string, code: string) {
    if (!to || !this.isValidEmail(to)) {
      throw new EmailException(
        ErrorCode.EMAIL_INVALID_FORMAT,
        'Invalid email format',
        { email: to },
      );
    }

    if (!code || !/^\d{6}$/.test(code)) {
      throw new EmailException(
        ErrorCode.EMAIL_SENDING_FAILED,
        'Invalid verification code format',
        { code },
      );
    }
  }

  private errorHandler(error: any) {
    this.logger.error(`Email sending failed: ${error.message}`);
    if (error instanceof EmailException) {
      throw error;
    }

    if (error.code === 'EAUTH') {
      throw new EmailException(
        ErrorCode.EMAIL_AUTH_FAILED,
        'Authentication failed',
        { originalError: error.message },
      );
    }

    if (error.code === 'EENVELOPE') {
      throw new EmailException(
        ErrorCode.EMAIL_RECIPIENT_REJECTED,
        'Recipient rejected',
        { rejected: error.rejected, originalError: error.message },
      );
    }

    if (error.code === 'ECONNECTION' || error.code === 'ETIMEDOUT') {
      throw new EmailException(
        ErrorCode.EMAIL_CONNECTION_FAILED,
        'Connection failed',
        { originalError: error.message },
      );
    }

    if (error.responseCode === 550) {
      throw new EmailException(
        ErrorCode.EMAIL_POLICY_REJECTION,
        'Policy rejection',
        { originalError: error.message },
      );
    }

    throw new EmailException(ErrorCode.EMAIL_SENDING_FAILED, error.message, {
      originalError: error.message,
    });
  }
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@([^\s@.,]+\.)+[^\s@.,]{2,}$/;
    return emailRegex.test(email);
  }

  private getEmailTemplate(code: string): string {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #333;">Подтверждение регистрации</h2>
        <p>Ваш код подтверждения:</p>
        <div style="font-size: 32px; font-weight: bold; color: #4F46E5; padding: 20px; background: #F3F4F6; text-align: center; border-radius: 8px;">
          ${code}
        </div>
        <p style="color: #666; font-size: 14px; margin-top: 20px;">Код действителен в течение 15 минут.</p>
        <p style="color: #666; font-size: 14px;">Если вы не регистрировались, просто проигнорируйте это письмо.</p>
      </div>
    `;
  }

  private getEmailTemplatePassword(code: string): string {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #333;">Восстановление пароля</h2>
        <p>Ваш код подтверждения:</p>
        <div style="font-size: 32px; font-weight: bold; color: #4F46E5; padding: 20px; background: #F3F4F6; text-align: center; border-radius: 8px;">
          ${code}
        </div>
        <p style="color: #666; font-size: 14px; margin-top: 20px;">Код действителен в течение 15 минут.</p>
        <p style="color: #666; font-size: 14px;">Если вы не пытались восстановить пароль, просто проигнорируйте это письмо.</p>
      </div>
    `;
  }
}
