import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { PushNotificationsService } from './push-notifications.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('push-notifications')
export class PushNotificationsController {
  constructor(private readonly pushService: PushNotificationsService) {}

  @UseGuards(JwtAuthGuard)
  @Post('subscribe')
  subscribe(
    @Body() createSubscriptionDto: CreateSubscriptionDto,
    @Request() req,
  ) {
    return this.pushService.addSubscription(
      createSubscriptionDto,
      req.user.userId,
    );
  }
}
