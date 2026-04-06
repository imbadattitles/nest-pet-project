import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: 'smtp.yandex.ru',
      port: 465,           
      secure: true,        
      auth: {
        user: process.env.YANDEX_EMAIL,   
        pass: process.env.YANDEX_PASSWORD, 
      },
    });
  }

  async sendVerificationEmail(to: string, code: string) {
    console.log(process.env.YANDEX_EMAIL);
    console.log(process.env.YANDEX_PASSWORD);
    await this.transporter.sendMail({
      from: `${process.env.YANDEX_EMAIL}`,
      to: to,
      subject: 'Подтверждение регистрации',
      html: `<h1>Ваш код подтверждения: <b>${code}</b></h1><p>Код действителен 15 минут.</p>`,
    });
  }
}