import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as webPush from 'web-push';
import { PushSubscription } from './entities/push-subscription.entity';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';

@Injectable()
export class PushNotificationsService implements OnModuleInit {
  private readonly logger = new Logger(PushNotificationsService.name);

  constructor(
    @InjectRepository(PushSubscription)
    private readonly subscriptionRepository: Repository<PushSubscription>,
  ) {}

  onModuleInit() {
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      console.warn('VAPID Keys are missing in .env');
      return;
    }
    webPush.setVapidDetails(
      'mailto:antonioacevedocastellanos@gmail.com',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY,
    );
  }

  async addSubscription(dto: CreateSubscriptionDto, userId?: string) {
    const existing = await this.subscriptionRepository.findOne({
      where: { endpoint: dto.endpoint },
    });

    if (existing) {
      if (userId && existing.userId !== userId) {
        existing.userId = userId;
        return this.subscriptionRepository.save(existing);
      }
      return existing;
    }

    const subscription = this.subscriptionRepository.create({
      endpoint: dto.endpoint,
      p256dh: dto.keys.p256dh,
      auth: dto.keys.auth,
      userId,
    });

    return this.subscriptionRepository.save(subscription);
  }

  async sendPush(subscription: any, payload: any) {
    try {
      await webPush.sendNotification(subscription, JSON.stringify(payload));
      return true;
    } catch (error) {
      console.error('Error enviando push', error);
      // If 410 Gone, we should remove the subscription
      if (error.statusCode === 410 && subscription.endpoint) {
        await this.subscriptionRepository.delete({
          endpoint: subscription.endpoint,
        });
      }
      return false;
    }
  }

  async sendNotificationToUser(userId: string, payload: any) {
    const subscriptions = await this.subscriptionRepository.find({
      where: { userId },
    });

    this.logger.log(
      `Sending notification to user ${userId} with ${subscriptions.length} subscriptions`,
    );
    const results = await Promise.all(
      subscriptions.map(async (sub) => {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        };
        const success = await this.sendPush(pushSubscription, payload);
        if (!success) {
          this.logger.warn(
            `Failed to send push to ${sub.endpoint}, removing subscription`,
          );
          // maybe already deleted in sendPush catch
        }
        return success;
      }),
    );
    return results;
  }
}
