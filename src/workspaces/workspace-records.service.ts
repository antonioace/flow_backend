import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import {
  ConditionalActionDto,
  PaginationDto,
  RecordAction,
  RecordActionDto,
} from './dto/record-action.dto';
import { WorkspaceRecordRelation } from './entities/workspace-record-relation.entity';
import { WorkspaceRecord } from './entities/workspace-record.entity';
import { Workspace } from './entities/workspace.entity';

@Injectable()
export class WorkspaceRecordsService {
  private readonly logger = new Logger(WorkspaceRecordsService.name);

  constructor(
    @InjectRepository(WorkspaceRecord)
    private readonly recordRepo: Repository<WorkspaceRecord>,
    @InjectRepository(Workspace)
    private readonly workspaceRepo: Repository<Workspace>,
    @InjectRepository(WorkspaceRecordRelation)
    private readonly relationRepo: Repository<WorkspaceRecordRelation>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly eventEmitter: EventEmitter2,
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
    const { action, idCollection, idRecord, data, include } = dto;

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
        return this.getRecord(
          workspaceId,
          idCollection,
          idRecord,
          include,
          dto.includeAdditionalFields,
        );

      case RecordAction.GET_ALL:
        return this.getAllRecords(
          workspaceId,
          idCollection,
          dto.conditionals,
          dto.pagination,
          include,
          dto.includeAdditionalFields,
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

    // Identificar y crear relaciones basadas en el esquema del workspace
    try {
      await this.createRelations(workspaceId, collectionId, data, savedRecord);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(
        `Error al crear relaciones para el record ${id}: ${errorMessage}`,
      );
    }

    this.logger.log(
      `Record creado en colección "${collectionId}" del workspace "${workspaceId}"`,
    );

    // Emitir evento de creación
    this.eventEmitter.emit('record.created', {
      workspaceId,
      collectionId,
      data: savedRecord.data,
    });

    return {
      success: true,
      action: 'create',
      message: 'Record creado exitosamente.',
      data: savedRecord.data,
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

    // Emitir evento de actualización
    if (updated) {
      this.eventEmitter.emit('record.updated', {
        workspaceId,
        collectionId,
        data: updated.data,
      });
    }

    return {
      success: true,
      action: 'update',
      message: 'Record actualizado exitosamente.',
      data: updated?.data,
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

    // Emitir evento de eliminación
    this.eventEmitter.emit('record.deleted', {
      workspaceId,
      collectionId,
      data: toDelete.data,
    });

    return {
      success: true,
      action: 'delete',
      message: 'Record eliminado exitosamente.',
      data: toDelete.data,
    };
  }

  /**
   * GET: Búsqueda directa por Primary Key + workspace + collection.
   */
  private async getRecord(
    workspaceId: string,
    collectionId: string,
    idRecord: string,
    include?: Record<string, boolean>,
    includeAdditionalFields?: Record<'count' | 'list', boolean>,
  ) {
    const activeIncludes = include
      ? Object.entries(include)
          .filter(([, v]) => v)
          .map(([k]) => k)
      : [];

    const qb = this.recordRepo
      .createQueryBuilder('record')
      .where('record.id = :idRecord', { idRecord })
      .andWhere('record.workspaceId = :workspaceId', { workspaceId })
      .andWhere('record.collectionId = :collectionId', { collectionId });

    if (activeIncludes.length > 0) {
      qb.leftJoinAndSelect('record.targetRelations', 'relation')
        .leftJoinAndSelect('relation.targetRecord', 'targetRecord')
        .leftJoinAndSelect('relation.targetUser', 'targetUser');
    }

    const record = await qb.getOne();

    if (!record) {
      throw new NotFoundException(
        `Record con id "${idRecord}" no encontrado en la colección "${collectionId}".`,
      );
    }

    const finalData = { ...(record.data as Record<string, unknown>) };

    if (activeIncludes.length > 0 && record.targetRelations) {
      record.targetRelations.forEach((rel) => {
        if (activeIncludes.includes(rel.targetNameRecord)) {
          const cleanKey = rel.targetNameRecord.replace(/^(id_|_id)|_id$/g, '');

          if (rel.targetRecord) {
            finalData[cleanKey] = rel.targetRecord.data;
          } else if (rel.targetUser) {
            finalData[cleanKey] = UsersService.sanitize(rel.targetUser);
          }
        }
      });
    }

    // Enriquecer con campos adicionales (count / list) de incoming relations
    if (includeAdditionalFields) {
      await this.enrichWithAdditionalFields(
        workspaceId,
        collectionId,
        finalData,
        includeAdditionalFields,
      );
    }

    return {
      success: true,
      action: 'obtener',
      message: 'Record obtenido exitosamente.',
      data: finalData,
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
    include?: Record<string, boolean>,
    includeAdditionalFields?: Record<'count' | 'list', boolean>,
  ) {
    const qb = this.recordRepo
      .createQueryBuilder('record')
      .where('record."workspaceId" = :workspaceId', { workspaceId })
      .andWhere('record."collectionId" = :collectionId', { collectionId });

    const activeIncludes = include
      ? Object.entries(include)
          .filter(([, v]) => v)
          .map(([k]) => k)
      : [];

    if (activeIncludes.length > 0) {
      qb.leftJoinAndSelect('record.targetRelations', 'relation')
        .leftJoinAndSelect('relation.targetRecord', 'targetRecord')
        .leftJoinAndSelect('relation.targetUser', 'targetUser');
    }

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

    let finalData: Record<string, unknown>[] = records.map(
      (r) => r.data as Record<string, unknown>,
    );

    if (activeIncludes.length > 0) {
      finalData = records.map((record) => {
        const enrichedData: Record<string, unknown> = {
          ...(record.data as Record<string, unknown>),
        };

        record.targetRelations?.forEach((rel) => {
          if (activeIncludes.includes(rel.targetNameRecord)) {
            const cleanKey = rel.targetNameRecord.replace(
              /^(id_|_id)|_id$/g,
              '',
            );

            if (rel.targetRecord) {
              enrichedData[cleanKey] = rel.targetRecord.data;
            } else if (rel.targetUser) {
              enrichedData[cleanKey] = UsersService.sanitize(rel.targetUser);
            }
          }
        });

        return enrichedData;
      });
    }

    // Enriquecer con campos adicionales (count / list) de incoming relations
    if (includeAdditionalFields) {
      for (const item of finalData) {
        await this.enrichWithAdditionalFields(
          workspaceId,
          collectionId,
          item,
          includeAdditionalFields,
        );
      }
    }

    return {
      success: true,
      action: 'obtenerTodos',
      message: `Se obtuvieron ${records.length} records de la colección "${collectionId}".`,
      data: finalData,
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
      return {
        id,
        workspaceId,
        collectionId,
        data: {
          _id: id,
          ...item,
          _createdAt: now,
          _updatedAt: now,
        },
      };
    });

    await this.recordRepo.insert(
      entities as unknown as QueryDeepPartialEntity<WorkspaceRecord>[],
    );

    this.logger.log(
      `Inserción masiva de ${entities.length} records en "${collectionId}" del workspace "${workspaceId}"`,
    );

    return {
      success: true,
      action: 'bulkInsert',
      message: `${entities.length} records insertados exitosamente.`,
      data: entities.map((e) => e.data),
    };
  }

  /**
   * Enriquece un record con campos adicionales de incoming relations.
   * Busca en todas las colecciones del workspace qué campos apuntan
   * a la colección actual y consulta directamente workspace_records
   * filtrando por el campo de relación en la columna JSONB "data".
   */
  private async enrichWithAdditionalFields(
    workspaceId: string,
    collectionId: string,
    recordData: Record<string, unknown>,
    includeAdditionalFields: Record<'count' | 'list', boolean>,
  ) {
    const workspace = await this.workspaceRepo.findOne({
      where: { id: workspaceId },
    });

    if (!workspace || !workspace.nodes) return;

    const recordId = recordData['_id'] as string;
    if (!recordId) return;

    const wantCount = includeAdditionalFields.count === true;
    const wantList = includeAdditionalFields.list === true;

    for (const node of workspace.nodes) {
      if (!node.data?.fields) continue;

      for (const field of node.data.fields) {
        if (!field.relation) continue;
        if (field.relation.targetCollectionId !== collectionId) continue;

        // Este campo en otra colección apunta a nuestra colección.
        // Buscamos directamente en workspace_records donde
        // data->>'fieldName' = recordId y collectionId = sourceCollectionId
        const fieldName = field.name;
        const sourceCollectionId = node.id;

        if (wantCount && field.relation.countFieldName) {
          const count = await this.recordRepo
            .createQueryBuilder('record')
            .where('record."workspaceId" = :workspaceId', { workspaceId })
            .andWhere('record."collectionId" = :sourceCollectionId', {
              sourceCollectionId,
            })
            .andWhere(`record."data"->>:fieldName = :recordId`, {
              fieldName,
              recordId,
            })
            .getCount();

          recordData[field.relation.countFieldName] = count;
        }

        if (wantList && field.relation.listFieldName) {
          const records = await this.recordRepo
            .createQueryBuilder('record')
            .where('record."workspaceId" = :workspaceId', { workspaceId })
            .andWhere('record."collectionId" = :sourceCollectionId', {
              sourceCollectionId,
            })
            .andWhere(`record."data"->>:fieldName = :recordId`, {
              fieldName,
              recordId,
            })
            .getMany();

          recordData[field.relation.listFieldName] = records.map((r) => r.data);
        }
      }
    }
  }

  /**
   * Identifica campos de relación en la colección y crea registros en
   * la tabla de relaciones de records.
   */
  private async createRelations(
    workspaceId: string,
    collectionId: string,
    data: Record<string, unknown>,
    savedRecord: WorkspaceRecord,
  ) {
    const workspace = await this.workspaceRepo.findOne({
      where: { id: workspaceId },
    });

    if (!workspace || !workspace.nodes) return;

    // Casteamos a CollectionNode para acceder a los campos
    const nodes = workspace.nodes;
    const collectionNode = nodes.find((node) => node.id === collectionId);

    if (
      !collectionNode ||
      !collectionNode.data ||
      !collectionNode.data.fields
    ) {
      return;
    }

    const fields = collectionNode.data.fields;

    for (const field of fields) {
      // Si el campo tiene relación y existe la data para ese campo en el objeto enviado
      if (field.relation && data[field.name]) {
        const targetValue = data[field.name];

        // Manejar tanto un ID único como un array de IDs (para one_to_many si se envía así)
        const targetIds = Array.isArray(targetValue)
          ? targetValue
          : [targetValue];

        for (const targetId of targetIds) {
          if (typeof targetId === 'string' && targetId) {
            const relation = this.relationRepo.create({
              targetRecord: savedRecord,
              targetNameRecord: field.name,
              // Si el campo es isUser, poblamos targetUserId en lugar de targetRecordId
              ...(field.isUser
                ? { targetUserId: targetId }
                : { targetRecordId: targetId }),
            });
            await this.relationRepo.save(relation);

            this.logger.debug(
              `Relación creada: ${savedRecord.id} --(${field.name})--> ${targetId} (isUser: ${!!field.isUser})`,
            );
          }
        }
      }
    }
  }
}
