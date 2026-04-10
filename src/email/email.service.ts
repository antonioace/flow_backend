import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

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

    const { data, error } = await this.resend.emails.send({
      from,
      to: [to],
      subject,
      text,
      html,
    });

    if (error) {
      console.error('Error sending email with Resend:', error);
      throw new Error(
        error.message || 'Error encountered while sending email with Resend',
      );
    }

    return data;
  }
}
