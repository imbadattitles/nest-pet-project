import * as nodemailer from 'nodemailer';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmailService {
  private transporter;
  private readonly logger = new Logger(EmailService.name);

  constructor(private configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get('EMAIL_HOST', 'smtp.yandex.ru'),
      port: this.configService.get('EMAIL_PORT', 587),
      secure: this.configService.get('EMAIL_SECURE', false),
      auth: {
        user: this.configService.get('EMAIL_USER'),
        pass: this.configService.get('EMAIL_PASSWORD'),
      },
      // Таймауты для предотвращения зависаний
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    });
  }

  async sendVerificationEmail(to: string, code: string): Promise<void> {
    try {
      // 1. Валидация входных данных
      if (!to || !this.isValidEmail(to)) {
        throw new Error('Invalid recipient email address');
      }
      
      if (!code || !/^\d{6}$/.test(code)) {
        throw new Error('Invalid verification code format');
      }

      // 2. Проверяем конфигурацию
      if (!this.configService.get('EMAIL_USER') || !this.configService.get('EMAIL_PASSWORD')) {
        throw new Error('Email service not configured properly');
      }

      // 3. Проверяем соединение перед отправкой
      const isVerified = await this.verifyConnection();
      if (!isVerified) {
        throw new Error('SMTP connection verification failed');
      }

      // 4. Отправляем письмо
      const info = await this.transporter.sendMail({
        from: `"Blog App" <${this.configService.get('EMAIL_USER')}>`,
        to: to,
        subject: 'Подтверждение регистрации',
        html: this.getEmailTemplate(code),
        text: `Ваш код подтверждения: ${code}. Код действителен 15 минут.`,
      });

      this.logger.log(`Email sent successfully to ${to}, messageId: ${info.messageId}`);
      
    } catch (error) {
      // 5. Детальная обработка ошибок
      this.handleEmailError(error, to);
    }
  }

  private async verifyConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch (error: any) {
      this.logger.error(`SMTP connection failed: ${error.message}`);
      return false;
    }
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

  private handleEmailError(error: any, recipient: string): never {
    // Логируем полную информацию об ошибке
    this.logger.error({
      message: 'Failed to send verification email',
      error: error.message,
      stack: error.stack,
      recipient,
      code: error.code,
      command: error.command,
      responseCode: error.responseCode,
    });

    // Классификация ошибок
    if (error.code === 'EAUTH') {
      throw new Error('Ошибка аутентификации почтового сервера. Пожалуйста, проверьте настройки.');
    }
    
    if (error.code === 'EENVELOPE') {
      if (error.rejected && error.rejected.length > 0) {
        throw new Error(`Не удалось отправить письмо на адрес ${error.rejected.join(', ')}. Проверьте правильность email.`);
      }
      throw new Error('Ошибка в адресе получателя или отправителя.');
    }
    
    if (error.code === 'ECONNECTION' || error.code === 'ETIMEDOUT') {
      throw new Error('Не удалось подключиться к почтовому серверу. Проверьте интернет-соединение.');
    }
    
    if (error.responseCode === 550) {
      throw new Error('Почтовый сервер отклонил отправку. Возможно, email адрес не существует или заблокирован.');
    }
    
    if (error.responseCode === 535) {
      throw new Error('Ошибка авторизации на почтовом сервере. Проверьте логин и пароль.');
    }

    // Общая ошибка
    throw new Error(`Не удалось отправить письмо подтверждения: ${error.message}`);
  }
}