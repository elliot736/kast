import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AlertTrigger } from '../../redpanda/redpanda.interfaces';
import type { NotificationResult } from './slack.provider';

@Injectable()
export class EmailProvider {
  private readonly logger = new Logger(EmailProvider.name);

  constructor(private config: ConfigService) {}

  async send(
    destination: string,
    trigger: AlertTrigger,
    config: Record<string, unknown>,
  ): Promise<NotificationResult> {
    // SMTP integration — uses nodemailer when available, otherwise logs
    // For v1, we log the email that would be sent
    this.logger.log(
      `Would send email to ${destination}: ${trigger.monitorName} is down — ${trigger.reason}`,
    );

    // TODO: Add nodemailer integration
    // const transporter = nodemailer.createTransport({ ... });
    // await transporter.sendMail({ to: destination, subject: ..., html: ... });

    return {
      success: true,
      response: { message: 'Email provider not yet configured — logged only' },
    };
  }
}
