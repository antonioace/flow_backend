// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SeedModule } from './seed/seed.module';
import { UsersModule } from './users/users.module';
import { EmailModule } from './email/email.module';
import { DatabaseModule } from './database/database.module';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PushNotificationsModule } from './push-notifications/push-notifications.module';
import { FilesModule } from './files/files.module';
import { S3Module } from './s3/s3.module';
import { OpenaiModule } from './openai/openai.module';
import { AudioModule } from './audio/audio.module';
import { FlowModule } from './flow/flow.module';
import { WorkspacesModule } from './workspaces/workspaces.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    DatabaseModule,
    UsersModule,
    AuthModule,
    NotificationsModule,
    SeedModule,
    EmailModule,
    PushNotificationsModule,
    FilesModule,
    S3Module,
    OpenaiModule,
    AudioModule,
    FlowModule,
    WorkspacesModule,
  ],
})
export class AppModule {}
