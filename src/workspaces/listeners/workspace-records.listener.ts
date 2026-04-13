import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Workspace } from '../entities/workspace.entity';
import { WorkspaceAction } from '../interfaces/workspaces-action.interface';
import { ActionExecutorService } from '../action-executor.service';
import { ScheduledActionsService } from '../scheduled-actions.service';

export interface WorkspaceRecordPayload {
  workspaceId: string;
  collectionId: string;
  data: {
    _id: string;
    _createdAt: string;
    _updatedAt: string;
    [key: string]: unknown;
  };
}

@Injectable()
export class WorkspaceRecordsListener {
  private readonly logger = new Logger(WorkspaceRecordsListener.name);

  constructor(
    @InjectRepository(Workspace)
    private readonly workspaceRepo: Repository<Workspace>,
    private readonly actionExecutor: ActionExecutorService,
    private readonly scheduledActionsService: ScheduledActionsService,
  ) {}

  @OnEvent('record.created')
  async handleRecordCreated(payload: WorkspaceRecordPayload) {
    const { workspaceId, collectionId, data } = payload;
    this.logger.debug(
      `Listener record.created recibido para ID: ${data._id} en colección ${collectionId}`,
    );

    await this.processActions(workspaceId, collectionId, 'create', data);
  }

  @OnEvent('record.updated')
  async handleRecordUpdated(payload: WorkspaceRecordPayload) {
    const { workspaceId, collectionId, data } = payload;
    this.logger.debug(
      `Listener record.updated recibido para ID: ${data._id} en colección ${collectionId}`,
    );

    await this.processActions(workspaceId, collectionId, 'update', data);
  }

  @OnEvent('record.deleted')
  async handleRecordDeleted(payload: WorkspaceRecordPayload) {
    const { workspaceId, collectionId, data } = payload;
    this.logger.debug(
      `Listener record.deleted recibido para ID: ${data._id} en colección ${collectionId}`,
    );

    await this.processActions(workspaceId, collectionId, 'delete', data);
  }

  /**
   * Procesa las acciones configuradas para una colección y evento específico.
   * Soporta resolución de campos dinámicos (campo_xxx) desde la data del record.
   */
  private async processActions(
    workspaceId: string,
    collectionId: string,
    event: 'create' | 'update' | 'delete',
    recordData: Record<string, unknown>,
  ) {
    const workspace = await this.workspaceRepo.findOne({
      where: { id: workspaceId },
    });

    if (!workspace || !workspace.actions) return;

    const matchedActions = workspace.actions.filter(
      (action) =>
        action.idCollection === collectionId &&
        action.triggerEvent === event &&
        action.active !== false,
    );

    if (matchedActions.length === 0) return;

    this.logger.log(
      `Se encontraron ${matchedActions.length} acciones para el evento "${event}" en colección "${collectionId}".`,
    );

    for (const action of matchedActions) {
      try {
        switch (action.scheduleType) {
          case 'normal':
            await this.actionExecutor.executeAction(action, recordData);
            break;

          case 'scheduled':
            await this.handleScheduledAction(
              workspaceId,
              collectionId,
              action,
              recordData,
            );
            break;

          case 'recurrent':
            await this.handleRecurrentAction(
              workspaceId,
              collectionId,
              action,
              recordData,
            );
            break;

          default:
            this.logger.warn(
              `ScheduleType desconocido: ${action.scheduleType as string}`,
            );
        }
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : 'Error desconocido';
        this.logger.error(
          `Error al procesar acción "${action.name}": ${errorMsg}`,
        );
      }
    }
  }

  /**
   * Maneja acciones con scheduleType "scheduled".
   * Resuelve la fecha de ejecución (estática o dinámica) y programa la acción.
   */
  private async handleScheduledAction(
    workspaceId: string,
    collectionId: string,
    action: WorkspaceAction,
    recordData: Record<string, unknown>,
  ) {
    if (!action.executionTime) {
      this.logger.warn(
        `Acción "${action.name}": no tiene executionTime configurado para tipo "scheduled".`,
      );
      return;
    }

    // Resolver la fecha de ejecución (puede ser dinámica)
    let executionTimeStr: string;
    if (action.isExecutionDynamic) {
      executionTimeStr = this.actionExecutor.resolveDynamicValue(
        action.executionTime,
        recordData,
      );
    } else {
      executionTimeStr = action.executionTime;
    }

    const executeAt = new Date(executionTimeStr);
    if (isNaN(executeAt.getTime())) {
      this.logger.warn(
        `Acción "${action.name}": executionTime "${executionTimeStr}" no es una fecha válida.`,
      );
      return;
    }

    // Si la fecha ya pasó, ejecutar inmediatamente
    if (executeAt <= new Date()) {
      this.logger.log(
        `Acción "${action.name}": la fecha de ejecución ya pasó, ejecutando inmediatamente.`,
      );
      await this.actionExecutor.executeAction(action, recordData);
      return;
    }

    await this.scheduledActionsService.scheduleAction({
      workspaceId,
      collectionId,
      action,
      recordData,
      executeAt,
      isRecurrent: false,
    });
  }

  /**
   * Maneja acciones con scheduleType "recurrent".
   * Calcula la primera fecha de ejecución usando referenceDate + recurrentConfig.
   */
  private async handleRecurrentAction(
    workspaceId: string,
    collectionId: string,
    action: WorkspaceAction,
    recordData: Record<string, unknown>,
  ) {
    if (!action.recurrentConfig) {
      this.logger.warn(
        `Acción "${action.name}": no tiene recurrentConfig configurado para tipo "recurrent".`,
      );
      return;
    }

    // Resolver la fecha de referencia
    let referenceDateStr: string;
    if (action.isReferenceDynamic && action.referenceDate) {
      referenceDateStr = this.actionExecutor.resolveDynamicValue(
        action.referenceDate,
        recordData,
      );
    } else if (action.referenceDate) {
      referenceDateStr = action.referenceDate;
    } else {
      // Si no hay referenceDate, usamos "ahora" como punto de partida
      referenceDateStr = new Date().toISOString();
    }

    const referenceDate = new Date(referenceDateStr);
    if (isNaN(referenceDate.getTime())) {
      this.logger.warn(
        `Acción "${action.name}": referenceDate "${referenceDateStr}" no es una fecha válida.`,
      );
      return;
    }

    // Calcular la primera fecha de ejecución sumando recurrentConfig
    const { days = 0, hours = 0, minutes = 0 } = action.recurrentConfig;
    const firstExecuteAt = new Date(referenceDate);
    firstExecuteAt.setDate(firstExecuteAt.getDate() + days);
    firstExecuteAt.setHours(firstExecuteAt.getHours() + hours);
    firstExecuteAt.setMinutes(firstExecuteAt.getMinutes() + minutes);

    await this.scheduledActionsService.scheduleAction({
      workspaceId,
      collectionId,
      action,
      recordData,
      executeAt: firstExecuteAt,
      isRecurrent: true,
      recurrentConfig: action.recurrentConfig,
    });
  }
}
