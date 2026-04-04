import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import {
  ConditionalActionDto,
  PaginationDto,
  RecordAction,
  RecordActionDto,
} from './dto/record-action.dto';
import { WorkspaceRecord } from './entities/workspace-record.entity';

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
    meta?: unknown;
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
        return this.getAllRecords(
          workspaceId,
          idCollection,
          dto.conditionals,
          dto.pagination,
        );

      case RecordAction.BULK_INSERT:
        return this.bulkInsert(
          workspaceId,
          idCollection,
          data as Record<string, any>[],
        );

      default:
        throw new BadRequestException(
          `Acción "${action as string}" no soportada.`,
        );
    }
  }

  // ─── Operaciones CRUD (un record por fila, data dinámica en JSONB) ───

  /**
   * CREATE: Inserción nativa de TypeORM.
   * El UUID, createdAt y updatedAt los genera TypeORM automáticamente.
   */
  private async createRecord(
    workspaceId: string,
    collectionId: string,
    data: Record<string, unknown>,
  ) {
    const id = randomUUID();
    const now = new Date().toISOString();
    const enrichedData = {
      _id: id,
      ...data,
      _createdAt: now,
      _updatedAt: now,
    };

    const newRecord = this.recordRepo.create({
      id,
      workspaceId,
      collectionId,
      data: enrichedData,
    });

    const savedRecord = await this.recordRepo.save(newRecord);

    this.logger.log(
      `Record creado en colección "${collectionId}" del workspace "${workspaceId}"`,
    );

    return {
      success: true,
      action: 'create',
      message: 'Record creado exitosamente.',
      data: savedRecord.data as unknown,
    };
  }

  /**
   * UPDATE: Usa el operador || de PostgreSQL para hacer un merge atómico
   * entre la data JSONB existente y la nueva data enviada.
   */
  private async updateRecord(
    workspaceId: string,
    collectionId: string,
    idRecord: string,
    data: Record<string, unknown>,
  ) {
    const now = new Date().toISOString();
    const updateData = {
      ...data,
      _updatedAt: now,
    };

    const result = await this.recordRepo
      .createQueryBuilder()
      .update(WorkspaceRecord)
      .set({
        data: () => `"data" || :newData::jsonb`,
      })
      .setParameter('newData', JSON.stringify(updateData))
      .where('id = :idRecord', { idRecord })
      .andWhere('"workspaceId" = :workspaceId', { workspaceId })
      .andWhere('"collectionId" = :collectionId', { collectionId })
      .execute();

    if (result.affected === 0) {
      throw new NotFoundException(
        `Record con id "${idRecord}" no encontrado en la colección "${collectionId}".`,
      );
    }

    const updated = await this.recordRepo.findOne({
      where: { id: idRecord, workspaceId, collectionId },
    });

    this.logger.log(
      `Record "${idRecord}" actualizado en colección "${collectionId}"`,
    );

    return {
      success: true,
      action: 'update',
      message: 'Record actualizado exitosamente.',
      data: updated?.data as unknown,
    };
  }

  /**
   * DELETE: Borrado directo por Primary Key.
   */
  private async deleteRecord(
    workspaceId: string,
    collectionId: string,
    idRecord: string,
  ) {
    const toDelete = await this.recordRepo.findOne({
      where: { id: idRecord, workspaceId, collectionId },
    });

    if (!toDelete) {
      throw new NotFoundException(
        `Record con id "${idRecord}" no encontrado en la colección "${collectionId}".`,
      );
    }

    await this.recordRepo.delete(idRecord);

    this.logger.log(
      `Record "${idRecord}" eliminado de colección "${collectionId}"`,
    );

    return {
      success: true,
      action: 'delete',
      message: 'Record eliminado exitosamente.',
      data: toDelete.data as unknown,
    };
  }

  /**
   * GET: Búsqueda directa por Primary Key + workspace + collection.
   */
  private async getRecord(
    workspaceId: string,
    collectionId: string,
    idRecord: string,
  ) {
    const record = await this.recordRepo.findOne({
      where: { id: idRecord, workspaceId, collectionId },
    });

    if (!record) {
      throw new NotFoundException(
        `Record con id "${idRecord}" no encontrado en la colección "${collectionId}".`,
      );
    }

    return {
      success: true,
      action: 'obtener',
      message: 'Record obtenido exitosamente.',
      data: record.data as unknown,
    };
  }

  /**
   * GET_ALL: Paginación y filtrado directo a nivel de SQL usando QueryBuilder.
   * Los filtros se aplican directamente sobre la columna JSONB "data".
   */
  private async getAllRecords(
    workspaceId: string,
    collectionId: string,
    conditionals?: ConditionalActionDto[],
    pagination?: PaginationDto,
  ) {
    const qb = this.recordRepo
      .createQueryBuilder('record')
      .where('record."workspaceId" = :workspaceId', { workspaceId })
      .andWhere('record."collectionId" = :collectionId', { collectionId });

    // Filtrado dinámico sobre la columna JSONB "data"
    if (conditionals && conditionals.length > 0) {
      conditionals.forEach((condition, index) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const { field, operator, value } = condition;
        const paramName = `val_${index}`;
        const fieldAccessor = `record."data"->>'${field}'`;

        switch (operator) {
          case 'equals':
            qb.andWhere(`${fieldAccessor} = :${paramName}`, {
              [paramName]: String(value),
            });
            break;
          case 'not_equals':
            qb.andWhere(
              `(${fieldAccessor} != :${paramName} OR ${fieldAccessor} IS NULL)`,
              { [paramName]: String(value) },
            );
            break;
          case 'contains':
            qb.andWhere(`${fieldAccessor} ILIKE :${paramName}`, {
              [paramName]: `%${String(value)}%`,
            });
            break;
          case 'starts_with':
            qb.andWhere(`${fieldAccessor} ILIKE :${paramName}`, {
              [paramName]: `${String(value)}%`,
            });
            break;
          case 'ends_with':
            qb.andWhere(`${fieldAccessor} ILIKE :${paramName}`, {
              [paramName]: `%${String(value)}`,
            });
            break;
          case 'greater_than':
            qb.andWhere(
              `(${fieldAccessor})::numeric > :${paramName}::numeric`,
              { [paramName]: String(value) },
            );
            break;
          case 'less_than':
            qb.andWhere(
              `(${fieldAccessor})::numeric < :${paramName}::numeric`,
              { [paramName]: String(value) },
            );
            break;
          case 'greater_equal':
            qb.andWhere(
              `(${fieldAccessor})::numeric >= :${paramName}::numeric`,
              { [paramName]: String(value) },
            );
            break;
          case 'less_equal':
            qb.andWhere(
              `(${fieldAccessor})::numeric <= :${paramName}::numeric`,
              { [paramName]: String(value) },
            );
            break;
          case 'before':
            qb.andWhere(
              `(${fieldAccessor})::timestamp < :${paramName}::timestamp`,
              { [paramName]: String(value) },
            );
            break;
          case 'after':
            qb.andWhere(
              `(${fieldAccessor})::timestamp > :${paramName}::timestamp`,
              { [paramName]: String(value) },
            );
            break;
          default:
            break;
        }
      });
    }

    // Paginación nativa a nivel SQL
    const page = pagination?.page || 1;
    const limit = pagination?.limit || 10;
    const offset = (page - 1) * limit;

    qb.skip(offset).take(limit);

    const [records, total] = await qb.getManyAndCount();

    return {
      success: true,
      action: 'obtenerTodos',
      message: `Se obtuvieron ${records.length} records de la colección "${collectionId}".`,
      data: records.map((r) => r.data as unknown),
      meta: {
        total,
        page,
        limit,
      },
    };
  }

  /**
   * BULK_INSERT: Inserción masiva usando el insert nativo de TypeORM.
   * Genera una sola sentencia SQL INSERT optimizada.
   */
  async bulkInsert(
    workspaceId: string,
    collectionId: string,
    data: Record<string, any>[],
  ) {
    const now = new Date().toISOString();

    const entities = data.map((item) => {
      const id = randomUUID();
      return this.recordRepo.create({
        id,
        workspaceId,
        collectionId,
        data: {
          _id: id,
          ...item,
          _createdAt: now,
          _updatedAt: now,
        },
      });
    });

    await this.recordRepo.insert(entities);

    this.logger.log(
      `Inserción masiva de ${entities.length} records en "${collectionId}" del workspace "${workspaceId}"`,
    );

    return {
      success: true,
      action: 'bulkInsert',
      message: `${entities.length} records insertados exitosamente.`,
      data: entities.map((e) => e.data as unknown),
    };
  }
}
