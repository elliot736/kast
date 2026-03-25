import { Module } from '@nestjs/common';
import { NotifyService } from './notify.service';
import { SlackProvider } from './channels/slack.provider';
import { DiscordProvider } from './channels/discord.provider';
import { EmailProvider } from './channels/email.provider';
import { WebhookProvider } from './channels/webhook.provider';
import { PagerDutyProvider } from './channels/pagerduty.provider';
import { TelegramProvider } from './channels/telegram.provider';

@Module({
  providers: [
    NotifyService,
    SlackProvider,
    DiscordProvider,
    EmailProvider,
    WebhookProvider,
    PagerDutyProvider,
    TelegramProvider,
  ],
})
export class NotifyModule {}
