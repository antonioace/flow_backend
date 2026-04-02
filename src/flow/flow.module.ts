import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailModule } from '../email/email.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { FlowHistory } from './entities/flow-history.entity';
import { Flow } from './entities/flow.entity';
import { FlowExecutionService } from './flow-execution.service';
import { FlowWebhookController } from './flow-webhook.controller';
import { FlowController } from './flow.controller';
import { FlowService } from './flow.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Flow, FlowHistory]),
    EmailModule,
    NotificationsModule,
    HttpModule,
  ],
  controllers: [FlowController, FlowWebhookController],
  providers: [FlowService, FlowExecutionService],
  exports: [FlowService],
})
export class FlowModule {}
