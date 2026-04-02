import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { RecordAction, RecordActionDto } from './dto/record-action.dto';
import { WorkspaceRecord } from './entities/workspace-record.entity';

export interface InternalRecord {
  _id: string;
  _createdAt: string;
  _updatedAt: string;
  [key: string]: unknown;
}

@Injectable()
export class WorkspaceRecordsService {
  private readonly logger = new Logger(WorkspaceRecordsService.name);

  constructor(
    @InjectRepository(WorkspaceRecord)
    private readonly recordRepo: Repository<WorkspaceRecord>,
  ) {}

  /**
   * Punto de entrada único para manejar todas las acciones de records
   * sobre una colección de un workspace.
   */
  async handleAction(
    workspaceId: string,
    dto: RecordActionDto,
  ): Promise<{
    success: boolean;
    action: string;
    message: string;
    data?: unknown;
  }> {
    const { action, idCollection, idRecord, data } = dto;

    switch (action) {
      case RecordAction.CREATE:
        return this.createRecord(
          workspaceId,
          idCollection,
          data as Record<string, unknown>,
        );

      case RecordAction.UPDATE:
        if (!idRecord) {
          throw new BadRequestException(
            'El idRecord es obligatorio para la acción "update".',
          );
        }
        return this.updateRecord(
          workspaceId,
          idCollection,
          idRecord,
          data as Record<string, unknown>,
        );

      case RecordAction.DELETE:
        if (!idRecord) {
          throw new BadRequestException(
            'El idRecord es obligatorio para la acción "delete".',
          );
        }
        return this.deleteRecord(workspaceId, idCollection, idRecord);

      case RecordAction.GET:
        if (!idRecord) {
          throw new BadRequestException(
            'El idRecord es obligatorio para la acción "obtener".',
          );
        }
        return this.getRecord(workspaceId, idCollection, idRecord);

      case RecordAction.GET_ALL:
        return this.getAllRecords(workspaceId, idCollection);

      default:
        throw new BadRequestException(
          `Acción "${action as string}" no soportada.`,
        );
    }
  }

  // ─── Acciones internas ──────────────────────────────────────────

  private async createRecord(
    workspaceId: string,
    collectionId: string,
    data: Record<string, unknown>,
  ) {
    // Buscar si ya existe un registro para esta colección en este workspace
    let record = await this.recordRepo.findOne({
      where: { workspaceId, collectionId },
    });

    const newEntry: InternalRecord = {
      _id: randomUUID(),
      ...data,
      _createdAt: new Date().toISOString(),
      _updatedAt: new Date().toISOString(),
    };

    if (record) {
      // Agregar al array de records existente
      const currentRecords = Array.isArray(record.records)
        ? (record.records as InternalRecord[])
        : [];
      currentRecords.push(newEntry);
      record.records = currentRecords;
      await this.recordRepo.save(record);
    } else {
      // Crear nuevo registro para esta colección
      record = this.recordRepo.create({
        workspaceId,
        collectionId,
        records: [newEntry],
      });
      await this.recordRepo.save(record);
    }

    this.logger.log(
      `Record creado en colección "${collectionId}" del workspace "${workspaceId}"`,
    );

    return {
      success: true,
      action: 'create',
      message: 'Record creado exitosamente.',
      data: newEntry,
    };
  }

  private async updateRecord(
    workspaceId: string,
    collectionId: string,
    idRecord: string,
    data: Record<string, unknown>,
  ) {
    const record = await this.findCollectionRecord(workspaceId, collectionId);
    const records: InternalRecord[] = Array.isArray(record.records)
      ? (record.records as InternalRecord[])
      : [];

    const index = records.findIndex((r) => r._id === idRecord);
    if (index === -1) {
      throw new NotFoundException(
        `Record con id "${idRecord}" no encontrado en la colección "${collectionId}".`,
      );
    }

    records[index] = {
      ...records[index],
      ...data,
      _id: idRecord, // Mantener el id original
      _updatedAt: new Date().toISOString(),
    };
    record.records = records;
    await this.recordRepo.save(record);

    this.logger.log(
      `Record "${idRecord}" actualizado en colección "${collectionId}"`,
    );

    return {
      success: true,
      action: 'update',
      message: 'Record actualizado exitosamente.',
      data: records[index],
    };
  }

  private async deleteRecord(
    workspaceId: string,
    collectionId: string,
    idRecord: string,
  ) {
    const record = await this.findCollectionRecord(workspaceId, collectionId);
    const records: InternalRecord[] = Array.isArray(record.records)
      ? (record.records as InternalRecord[])
      : [];

    const index = records.findIndex((r) => r._id === idRecord);
    if (index === -1) {
      throw new NotFoundException(
        `Record con id "${idRecord}" no encontrado en la colección "${collectionId}".`,
      );
    }

    const deleted = records.splice(index, 1)[0];
    record.records = records;
    await this.recordRepo.save(record);

    this.logger.log(
      `Record "${idRecord}" eliminado de colección "${collectionId}"`,
    );

    return {
      success: true,
      action: 'delete',
      message: 'Record eliminado exitosamente.',
      data: deleted,
    };
  }

  private async getRecord(
    workspaceId: string,
    collectionId: string,
    idRecord: string,
  ) {
    const record = await this.findCollectionRecord(workspaceId, collectionId);
    const records: InternalRecord[] = Array.isArray(record.records)
      ? (record.records as InternalRecord[])
      : [];

    const found = records.find((r) => r._id === idRecord);
    if (!found) {
      throw new NotFoundException(
        `Record con id "${idRecord}" no encontrado en la colección "${collectionId}".`,
      );
    }

    return {
      success: true,
      action: 'obtener',
      message: 'Record obtenido exitosamente.',
      data: found,
    };
  }

  private async getAllRecords(workspaceId: string, collectionId: string) {
    const record = await this.recordRepo.findOne({
      where: { workspaceId, collectionId },
    });

    const records =
      record && Array.isArray(record.records)
        ? (record.records as InternalRecord[])
        : [];

    return {
      success: true,
      action: 'obtenerTodos',
      message: `Se obtuvieron ${records.length} records de la colección "${collectionId}".`,
      data: records,
    };
  }

  // ─── Helpers ────────────────────────────────────────────────────

  private async findCollectionRecord(
    workspaceId: string,
    collectionId: string,
  ): Promise<WorkspaceRecord> {
    const record = await this.recordRepo.findOne({
      where: { workspaceId, collectionId },
    });

    if (!record) {
      throw new NotFoundException(
        `No se encontraron records para la colección "${collectionId}" en el workspace "${workspaceId}".`,
      );
    }

    return record;
  }
}
