import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateFlowHistoryDto } from './dto/create-flow-history.dto';
import { CreateFlowDto } from './dto/create-flow.dto';
import { UpdateFlowDto } from './dto/update-flow.dto';
import { FlowHistory } from './entities/flow-history.entity';
import { Flow } from './entities/flow.entity';

@Injectable()
export class FlowService {
  constructor(
    @InjectRepository(Flow)
    private readonly flowRepository: Repository<Flow>,
    @InjectRepository(FlowHistory)
    private readonly flowHistoryRepository: Repository<FlowHistory>,
  ) {}

  async create(userId: string, dto: CreateFlowDto): Promise<Flow> {
    const flow = this.flowRepository.create({
      ...dto,
      userId,
    });
    return this.flowRepository.save(flow);
  }

  /**
   * Find a flow by ID without ownership check (used by webhook execution)
   */
  async findFlowById(id: string): Promise<Flow | null> {
    return this.flowRepository.findOne({ where: { id } });
  }

  async findAllByUser(userId: string): Promise<Flow[]> {
    return this.flowRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, userId: string): Promise<Flow> {
    const flow = await this.flowRepository.findOne({ where: { id } });

    if (!flow) {
      throw new NotFoundException(`Flow con id "${id}" no encontrado`);
    }

    if (flow.userId !== userId) {
      throw new ForbiddenException('No tienes acceso a este flow');
    }

    return flow;
  }

  async update(id: string, userId: string, dto: UpdateFlowDto): Promise<Flow> {
    const flow = await this.findOne(id, userId);
    Object.assign(flow, dto);
    return this.flowRepository.save(flow);
  }

  async remove(id: string, userId: string): Promise<void> {
    const flow = await this.findOne(id, userId);
    await this.flowRepository.remove(flow);
  }

  // ─── Flow History Methods ────────────────────────────────────────

  async createHistory(
    userId: string,
    dto: CreateFlowHistoryDto,
  ): Promise<FlowHistory> {
    // First verify the user owns the flow they are attaching history to
    await this.findOne(dto.flowId, userId);

    const history = this.flowHistoryRepository.create({
      flowId: dto.flowId,
      content: dto.content as Record<string, unknown>,
    });
    return this.flowHistoryRepository.save(history);
  }

  async getHistoryByFlowValidating(
    flowId: string,
    userId: string,
  ): Promise<FlowHistory[]> {
    // Verify ownership
    await this.findOne(flowId, userId);

    return this.flowHistoryRepository.find({
      where: { flowId },
      // Optional: add order if there's a createdAt column, but currently FlowHistory only has id/flowId/content/isActive
    });
  }

  async removeHistory(historyId: string, userId: string): Promise<void> {
    const history = await this.flowHistoryRepository.findOne({
      where: { id: historyId },
    });

    if (!history) {
      throw new NotFoundException(
        `History con id "${historyId}" no encontrado`,
      );
    }

    // Verify ownership of the flow this history belongs to
    await this.findOne(history.flowId, userId);

    await this.flowHistoryRepository.remove(history);
  }
}
