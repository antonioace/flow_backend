import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OpenaiModule } from '../openai/openai.module';
import { User } from '../users/entities/user.entity';
import { AISchemaLog } from './entities/ai-schema-log.entity';
import { WorkspaceHistory } from './entities/workspace-history.entity';
import { WorkspaceRecordRelation } from './entities/workspace-record-relation.entity';
import { WorkspaceRecord } from './entities/workspace-record.entity';
import { Workspace } from './entities/workspace.entity';
import { WorkspacesEventListener } from './listeners/workspaces.listener';
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
      User,
    ]),
    OpenaiModule,
  ],
  controllers: [WorkspacesController],
  providers: [
    WorkspacesService,
    WorkspaceRecordsService,
    WorkspacesEventListener,
  ],
  exports: [WorkspacesService],
})
export class WorkspacesModule {}
