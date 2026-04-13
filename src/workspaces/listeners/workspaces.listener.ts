import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AISchemaLog } from '../entities/ai-schema-log.entity';
import { Workspace } from '../entities/workspace.entity';

@Injectable()
export class WorkspacesEventListener {
  private readonly logger = new Logger(WorkspacesEventListener.name);

  constructor(
    @InjectRepository(AISchemaLog)
    private readonly aiLogRepo: Repository<AISchemaLog>,
  ) {}

  @OnEvent('schema.generated')
  async handleSchemaGeneratedEvent(payload: {
    description: string;
    prompt: string;
    response: string;
    metadata?: Record<string, unknown>;
  }) {
    this.logger.log('Guardando log de generación de esquema IA...');

    try {
      const logEntry = this.aiLogRepo.create({
        description: payload.description,
        prompt: payload.prompt,
        response: payload.response,
        metadata: payload.metadata || {},
      });

      await this.aiLogRepo.save(logEntry);
      this.logger.log(`Log de IA guardado con ID: ${logEntry.id}`);
    } catch (error) {
      this.logger.error(
        'Error al guardar el log de generación de esquema',
        error,
      );
    }
  }

  @OnEvent('workspace.created')
  handleWorkspaceCreated(payload: Workspace) {
    this.logger.debug(
      `Listener workspace.created - ID: ${payload.id}, Name: ${payload.name}`,
    );
  }

  @OnEvent('workspace.updated')
  handleWorkspaceUpdated(payload: Workspace) {
    this.logger.debug(
      `Listener workspace.updated - ID: ${payload.id}, Name: ${payload.name}`,
    );
  }
}
