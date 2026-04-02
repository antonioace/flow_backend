import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateFlowHistoryDto } from './dto/create-flow-history.dto';
import { CreateFlowDto } from './dto/create-flow.dto';
import { UpdateFlowDto } from './dto/update-flow.dto';
import { FlowService } from './flow.service';

@Controller('flow')
@UseGuards(JwtAuthGuard)
export class FlowController {
  constructor(private readonly flowService: FlowService) {}

  @Post()
  create(
    @Request() req: { user: { userId: string } },
    @Body() dto: CreateFlowDto,
  ) {
    return this.flowService.create(req.user.userId, dto);
  }

  @Get()
  findAll(@Request() req: { user: { userId: string } }) {
    return this.flowService.findAllByUser(req.user.userId);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @Request() req: { user: { userId: string } },
  ) {
    return this.flowService.findOne(id, req.user.userId);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Request() req: { user: { userId: string } },
    @Body() dto: UpdateFlowDto,
  ) {
    return this.flowService.update(id, req.user.userId, dto);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @Request() req: { user: { userId: string } },
  ) {
    return this.flowService.remove(id, req.user.userId);
  }

  // ─── Flow History Endpoints ────────────────────────────────────

  @Post('history')
  createHistory(
    @Request() req: { user: { userId: string } },
    @Body() dto: CreateFlowHistoryDto,
  ) {
    return this.flowService.createHistory(req.user.userId, dto);
  }

  @Get(':flowId/history')
  getHistory(
    @Param('flowId') flowId: string,
    @Request() req: { user: { userId: string } },
  ) {
    return this.flowService.getHistoryByFlowValidating(flowId, req.user.userId);
  }

  @Delete('history/:historyId')
  removeHistory(
    @Param('historyId') historyId: string,
    @Request() req: { user: { userId: string } },
  ) {
    return this.flowService.removeHistory(historyId, req.user.userId);
  }
}
