import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { ActionExecutorService } from './action-executor.service';
import { ScheduledAction } from './entities/scheduled-action.entity';
import {
  RecurrentConfig,
  WorkspaceAction,
} from './interfaces/workspaces-action.interface';

@Injectable()
export class ScheduledActionsService {
  private readonly logger = new Logger(ScheduledActionsService.name);

  constructor(
    @InjectRepository(ScheduledAction)
    private readonly scheduledActionRepo: Repository<ScheduledAction>,
    private readonly actionExecutor: ActionExecutorService,
  ) {}

  /**
   * Obtiene todas las acciones programadas de un workspace con paginación opcional.
   */
  async findAllByWorkspace(
    workspaceId: string,
    pagination?: { page?: number; limit?: number },
  ) {
    const page = pagination?.page || 1;
    const limit = pagination?.limit || 10;
    const skip = (page - 1) * limit;

    const [items, total] = await this.scheduledActionRepo.findAndCount({
      where: { workspaceId },
      order: { executeAt: 'DESC' },
      take: limit,
      skip,
    });

    return {
      success: true,
      data: items,
      meta: {
        total,
        page,
        limit,
      },
    };
  }

  /**
   * Programa una acción para ejecución futura.
   */
  async scheduleAction(params: {
    workspaceId: string;
    collectionId: string;
    action: WorkspaceAction;
    recordData: Record<string, unknown>;
    executeAt: Date;
    isRecurrent: boolean;
    recurrentConfig?: RecurrentConfig;
  }): Promise<ScheduledAction> {
    const entity = new ScheduledAction();
    entity.workspaceId = params.workspaceId;
    entity.collectionId = params.collectionId;
    entity.actionId = params.action.id;
    entity.actionSnapshot = params.action as unknown as Record<string, unknown>;
    entity.recordData = params.recordData;
    entity.status = 'pending';
    entity.executeAt = params.executeAt;
    entity.executedAt = null;
    entity.isRecurrent = params.isRecurrent;
    entity.recurrentConfig = params.recurrentConfig
      ? (params.recurrentConfig as unknown as Record<string, number>)
      : null;

    const saved = await this.scheduledActionRepo.save(entity);

    this.logger.log(
      `Acción "${params.action.name}" programada para ${params.executeAt.toISOString()}` +
        (params.isRecurrent ? ' (recurrente)' : ' (una vez)'),
    );

    return saved;
  }

  /**
   * Cada 30 segundos busca acciones pendientes listas para ejecutar.
   */
  @Interval(30000)
  async processScheduledActions() {
    const now = new Date();

    const pendingActions = await this.scheduledActionRepo.find({
      where: {
        status: 'pending',
        executeAt: LessThanOrEqual(now),
      },
      order: { executeAt: 'ASC' },
    });

    if (pendingActions.length === 0) return;

    this.logger.log(
      `Procesando ${pendingActions.length} acciones programadas pendientes.`,
    );

    for (const scheduled of pendingActions) {
      try {
        // Usar los getters del entity para obtener tipos correctos
        const action = scheduled.action;
        const recurrence = scheduled.recurrence;

        // Si la acción no está activa, saltamos la ejecución
        if (action.active === false) {
          this.logger.log(
            `Acción programada "${action.name}" está desactivada, saltando ejecución.`,
          );
        } else {
          await this.actionExecutor.executeAction(action, scheduled.recordData);
        }

        if (scheduled.isRecurrent && recurrence) {
          // Calcular siguiente ejecución
          const nextExecuteAt = this.calculateNextExecution(now, recurrence);

          scheduled.executeAt = nextExecuteAt;
          scheduled.executedAt = now;
          // El status permanece 'pending' para que se vuelva a ejecutar
          await this.scheduledActionRepo.save(scheduled);

          this.logger.log(
            `Acción recurrente "${action.name}" ejecutada. ` +
              `Próxima ejecución: ${nextExecuteAt.toISOString()}`,
          );
        } else {
          // One-time: marcar como ejecutada
          scheduled.status = 'executed';
          scheduled.executedAt = now;
          await this.scheduledActionRepo.save(scheduled);

          this.logger.log(
            `Acción programada "${action.name}" ejecutada exitosamente.`,
          );
        }
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : 'Error desconocido';
        const actionName = scheduled.action?.name ?? 'desconocida';
        this.logger.error(
          `Error al ejecutar acción programada "${String(actionName)}": ${errorMsg}`,
        );

        scheduled.status = 'failed';
        scheduled.executedAt = now;
        await this.scheduledActionRepo.save(scheduled);
      }
    }
  }

  /**
   * Calcula la siguiente fecha de ejecución basándose en la config de recurrencia.
   */
  private calculateNextExecution(
    fromDate: Date,
    config: RecurrentConfig,
  ): Date {
    const next = new Date(fromDate);
    next.setDate(next.getDate() + (config.days || 0));
    next.setHours(next.getHours() + (config.hours || 0));
    next.setMinutes(next.getMinutes() + (config.minutes || 0));
    return next;
  }
}
