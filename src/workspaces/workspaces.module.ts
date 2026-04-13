import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailModule } from '../email/email.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OpenaiModule } from '../openai/openai.module';
import { User } from '../users/entities/user.entity';
import { UsersModule } from '../users/users.module';
import { ActionExecutorService } from './action-executor.service';
import { AISchemaLog } from './entities/ai-schema-log.entity';
import { ScheduledAction } from './entities/scheduled-action.entity';
import { WorkspaceHistory } from './entities/workspace-history.entity';
import { WorkspaceRecordRelation } from './entities/workspace-record-relation.entity';
import { WorkspaceRecord } from './entities/workspace-record.entity';
import { Workspace } from './entities/workspace.entity';
import { WorkspacesEventListener } from './listeners/workspaces.listener';
import { WorkspaceRecordsListener } from './listeners/workspace-records.listener';
import { ScheduledActionsService } from './scheduled-actions.service';
import { WorkspaceRecordsService } from './workspace-records.service';
import { WorkspacesController } from './workspaces.controller';
import { WorkspacesService } from './workspaces.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Workspace,
      WorkspaceHistory,
      WorkspaceRecord,
      WorkspaceRecordRelation,
      AISchemaLog,
      ScheduledAction,
      User,
    ]),
    OpenaiModule,
    EmailModule,
    NotificationsModule,
    UsersModule,
  ],
  controllers: [WorkspacesController],
  providers: [
    WorkspacesService,
    WorkspaceRecordsService,
    WorkspacesEventListener,
    WorkspaceRecordsListener,
    ActionExecutorService,
    ScheduledActionsService,
  ],
  exports: [WorkspacesService],
})
export class WorkspacesModule {}
