import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { SeedController } from './seed.controller';
import { SeedService } from './seed.service';

@Module({
  imports: [UsersModule, NotificationsModule],
  controllers: [SeedController],
  providers: [SeedService],
})
export class SeedModule {}
