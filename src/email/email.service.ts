import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CreateEmailOptions, Resend } from 'resend';

@Injectable()
export class EmailService {
  private resend: Resend;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    this.resend = new Resend(apiKey);
  }

  async sendEmail(to: string, subject: string, text: string, html?: string) {
    const from =
      this.configService.get<string>('MAIL_FROM') || 'onboarding@resend.dev';

    // Detectar si el texto contiene etiquetas HTML
    const isHtml = /<[a-z][\s\S]*>/i.test(text);

    // Construir el payload de forma que TypeScript reconozca que al menos uno (html o text) está presente
    let payload: CreateEmailOptions;

    if (html || isHtml) {
      payload = {
        from,
        to: [to],
        subject,
        html: html || text,
        text: isHtml && !html ? undefined : text,
      };
    } else {
      payload = {
        from,
        to: [to],
        subject,
        text: text,
      };
    }

    const { data, error } = await this.resend.emails.send(payload);

    if (error) {
      console.error('Error sending email with Resend:', error);
      throw new Error(
        error.message || 'Error encountered while sending email with Resend',
      );
    }

    return data;
  }
}
