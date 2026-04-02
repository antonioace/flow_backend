import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateWorkspaceHistoryDto } from './dto/create-workspace-history.dto';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { GenerateSchemaDto } from './dto/generate-schema.dto';
import { RecordActionDto } from './dto/record-action.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { WorkspaceRecordsService } from './workspace-records.service';
import { WorkspacesService } from './workspaces.service';

@Controller('workspaces')
@UseGuards(JwtAuthGuard)
export class WorkspacesController {
  constructor(
    private readonly workspacesService: WorkspacesService,
    private readonly workspaceRecordsService: WorkspaceRecordsService,
  ) {}

  // ─── Workspace CRUD ─────────────────────────────────────────────

  @Post()
  create(
    @Request() req: { user: { userId: string } },
    @Body() dto: CreateWorkspaceDto,
  ) {
    return this.workspacesService.create(req.user.userId, dto);
  }

  @Get()
  findAll(@Request() req: { user: { userId: string } }) {
    return this.workspacesService.findAllByUser(req.user.userId);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @Request() req: { user: { userId: string } },
  ) {
    return this.workspacesService.findOne(id, req.user.userId);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Request() req: { user: { userId: string } },
    @Body() dto: UpdateWorkspaceDto,
  ) {
    return this.workspacesService.update(id, req.user.userId, dto);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @Request() req: { user: { userId: string } },
  ) {
    return this.workspacesService.remove(id, req.user.userId);
  }

  // ─── Workspace History ──────────────────────────────────────────

  @Post('history')
  createHistory(
    @Request() req: { user: { userId: string } },
    @Body() dto: CreateWorkspaceHistoryDto,
  ) {
    return this.workspacesService.createHistory(req.user.userId, dto);
  }

  @Get(':workspaceId/history')
  getHistory(
    @Param('workspaceId') workspaceId: string,
    @Request() req: { user: { userId: string } },
  ) {
    return this.workspacesService.getHistoryByWorkspace(
      workspaceId,
      req.user.userId,
    );
  }

  @Delete('history/:historyId')
  removeHistory(
    @Param('historyId') historyId: string,
    @Request() req: { user: { userId: string } },
  ) {
    return this.workspacesService.removeHistory(historyId, req.user.userId);
  }

  // ─── Workspace Records (single POST action) ────────────────────

  @Post(':workspaceId/records')
  @HttpCode(HttpStatus.OK)
  handleRecordAction(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: RecordActionDto,
  ) {
    return this.workspaceRecordsService.handleAction(workspaceId, dto);
  }

  // ─── Generate Schema (IA) ──────────────────────────────────────

  @Post('generate-schema')
  @HttpCode(HttpStatus.OK)
  generateSchema(@Body() generateSchemaDto: GenerateSchemaDto) {
    return this.workspacesService.generateSchema(generateSchemaDto);
  }
}
