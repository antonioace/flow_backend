import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OpenaiModule } from '../openai/openai.module';
import { WorkspaceHistory } from './entities/workspace-history.entity';
import { WorkspaceRecord } from './entities/workspace-record.entity';
import { Workspace } from './entities/workspace.entity';
import { WorkspaceRecordsService } from './workspace-records.service';
import { WorkspacesController } from './workspaces.controller';
import { WorkspacesService } from './workspaces.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Workspace, WorkspaceHistory, WorkspaceRecord]),
    OpenaiModule,
  ],
  controllers: [WorkspacesController],
  providers: [WorkspacesService, WorkspaceRecordsService],
  exports: [WorkspacesService],
})
export class WorkspacesModule {}
