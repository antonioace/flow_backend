import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import {
  ConditionalActionDto,
  PaginationDto,
  QueryActionDto,
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
          dto.query,
        );

      case RecordAction.BULK_INSERT:
        return this.bulkInsert(
          workspaceId,
          idCollection,
          data as Record<string, any>[],
        );

      case RecordAction.COUNT:
        return this.getRecordsCount(
          workspaceId,
          idCollection,
          dto.conditionals,
          dto.query,
        );

      default:
        throw new BadRequestException(
          `Acción "${action as string}" no soportada.`,
        );
    }
  }

  // ─── Operaciones CRUD (un record por fila, data dinámica en JSONB) ───

  /**
   * Valida la data de un record contra el esquema de la colección.
   * - Verifica que no haya campos extra (whitelist).
   * - Verifica que los campos requeridos estén presentes (en creación).
   */
  private async validateRecordData(
    workspaceId: string,
    collectionId: string,
    data: Record<string, unknown>,
    isUpdate = false,
  ): Promise<void> {
    const workspace = await this.workspaceRepo.findOne({
      where: { id: workspaceId },
    });

    if (!workspace) {
      throw new NotFoundException(
        `Workspace con id "${workspaceId}" no encontrado.`,
      );
    }

    const collectionNode = workspace.nodes?.find(
      (node) => node.id === collectionId,
    );
    if (!collectionNode || !collectionNode.data?.fields) {
      throw new NotFoundException(
        `Colección con id "${collectionId}" no encontrada en el workspace.`,
      );
    }

    const fields = collectionNode.data.fields;
    const allowedFields = new Set(fields.map((f) => f.name));
    const requiredFields = fields
      .filter((f) => f.validations?.required && !f.name.startsWith('_'))
      .map((f) => f.name);

    const incomingKeys = Object.keys(data).filter(
      (key) =>
        !['_id', '_createdAt', '_updatedAt'].includes(key) &&
        !key.startsWith('_'),
    );
    const extraFields = incomingKeys.filter((key) => !allowedFields.has(key));

    if (extraFields.length > 0) {
      throw new BadRequestException(
        `Campos no permitidos en la colección "${
          collectionNode.data.label
        }": ${extraFields.join(', ')}`,
      );
    }

    // 2. Verificar campos requeridos (solo en creación o si es bulk insert)
    if (!isUpdate) {
      const missingFields = requiredFields.filter((field) => !(field in data));
      if (missingFields.length > 0) {
        throw new BadRequestException(
          `Campos obligatorios faltantes para "${
            collectionNode.data.label
          }": ${missingFields.join(', ')}`,
        );
      }
    }
  }

  /**
   * CREATE: Inserción nativa de TypeORM.
   * El UUID, createdAt y updatedAt los genera TypeORM automáticamente.
   */
  private async createRecord(
    workspaceId: string,
    collectionId: string,
    data: Record<string, unknown>,
  ) {
    try {
      await this.validateRecordData(workspaceId, collectionId, data, false);

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
        await this.createRelations(
          workspaceId,
          collectionId,
          data,
          savedRecord,
        );
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
    } catch (error) {
      return await this.handleRecordError(
        error,
        workspaceId,
        collectionId,
        'create',
      );
    }
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
    try {
      // Validar data contra esquema (true = es update parcial)
      await this.validateRecordData(workspaceId, collectionId, data, true);

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

      try {
        await this.updateRelations(workspaceId, collectionId, data, idRecord);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Error desconocido';
        this.logger.error(
          `Error al actualizar relaciones para el record ${idRecord}: ${errorMessage}`,
        );
      }

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
    } catch (error) {
      return await this.handleRecordError(
        error,
        workspaceId,
        collectionId,
        'update',
      );
    }
  }

  /**
   * DELETE: Borrado directo por Primary Key.
   */
  private async deleteRecord(
    workspaceId: string,
    collectionId: string,
    idRecord: string,
  ) {
    try {
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
    } catch (error) {
      return await this.handleRecordError(
        error,
        workspaceId,
        collectionId,
        'delete',
      );
    }
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
    try {
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
            const cleanKey = rel.targetNameRecord.replace(
              /^(id_|_id)|_id$/g,
              '',
            );

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
    } catch (error) {
      return await this.handleRecordError(
        error,
        workspaceId,
        collectionId,
        'getOne',
      );
    }
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
    query?: QueryActionDto,
  ) {
    try {
      const qb = this.recordRepo
        .createQueryBuilder('record')
        .where('record."workspaceId" = :workspaceId', { workspaceId })
        .andWhere('record."collectionId" = :collectionId', { collectionId });

      const activeIncludes = include
        ? Object.entries(include)
            .filter(([, v]) => v)
            .map(([k]) => k)
        : [];

      await this.applyFilters(
        qb,
        workspaceId,
        collectionId,
        conditionals,
        query,
      );

      // Ordenamiento (orderBy)
      if (query?.orderBy) {
        const direction: 'ASC' | 'DESC' = query.orderByDirection || 'ASC';

        if (query.orderBy === '_createdAt' || query.orderBy === '_updatedAt') {
          const column =
            query.orderBy === '_createdAt' ? 'createdAt' : 'updatedAt';
          qb.orderBy(`record."${column}"`, direction);
        } else {
          qb.orderBy(`record."data"->>'${query.orderBy}'`, direction);
        }
      }

      // Paginación nativa a nivel SQL
      const page = pagination?.page || 1;
      const limit = pagination?.limit || 10;
      const offset = (page - 1) * limit;

      qb.skip(offset).take(limit);

      const [baseRecords, total] = await qb.getManyAndCount();
      let records = baseRecords;

      if (activeIncludes.length > 0 && records.length > 0) {
        const recordIds = records.map((r) => r.id);

        const qbWithJoins = this.recordRepo
          .createQueryBuilder('record')
          .whereInIds(recordIds)
          .leftJoinAndSelect('record.targetRelations', 'relation')
          .leftJoinAndSelect('relation.targetRecord', 'targetRecord')
          .leftJoinAndSelect('relation.targetUser', 'targetUser')
          .leftJoinAndSelect('relation.linkedRecord', 'linkedRecord');

        if (query?.orderBy) {
          const direction: 'ASC' | 'DESC' = query.orderByDirection || 'ASC';
          if (
            query.orderBy === '_createdAt' ||
            query.orderBy === '_updatedAt'
          ) {
            const column =
              query.orderBy === '_createdAt' ? 'createdAt' : 'updatedAt';
            qbWithJoins.orderBy(`record."${column}"`, direction);
          } else {
            qbWithJoins.orderBy(
              `record."data"->>'${query.orderBy}'`,
              direction,
            );
          }
        }

        records = await qbWithJoins.getMany();
      }

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

              if (rel.targetUser) {
                enrichedData[cleanKey] = {
                  ...UsersService.sanitize(rel.targetUser),
                  _id: rel.targetUser.id,
                };
              } else if (rel.linkedRecord) {
                enrichedData[cleanKey] = rel.linkedRecord.data;
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
    } catch (error) {
      return await this.handleRecordError(
        error,
        workspaceId,
        collectionId,
        'getAllRecords',
      );
    }
  }

  /**
   * COUNT: Retorna el número de registros que coinciden con los filtros.
   */
  private async getRecordsCount(
    workspaceId: string,
    collectionId: string,
    conditionals?: ConditionalActionDto[],
    query?: QueryActionDto,
  ) {
    try {
      const qb = this.recordRepo
        .createQueryBuilder('record')
        .where('record."workspaceId" = :workspaceId', { workspaceId })
        .andWhere('record."collectionId" = :collectionId', { collectionId });

      await this.applyFilters(
        qb,
        workspaceId,
        collectionId,
        conditionals,
        query,
      );

      const total = await qb.getCount();

      return {
        success: true,
        action: 'count',
        message: `Se encontraron ${total} registros.`,
        data: total,
      };
    } catch (error) {
      return await this.handleRecordError(
        error,
        workspaceId,
        collectionId,
        'count',
      );
    }
  }

  /**
   * Aplica filtros dinámicos (conditionals) y búsqueda global a un QueryBuilder.
   */
  private async applyFilters(
    qb: SelectQueryBuilder<WorkspaceRecord>,
    workspaceId: string,
    collectionId: string,
    conditionals?: ConditionalActionDto[],
    query?: QueryActionDto,
  ) {
    // Filtrado dinámico sobre la columna JSONB "data"
    if (conditionals && conditionals.length > 0) {
      conditionals.forEach((condition: ConditionalActionDto, index) => {
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
              {
                [paramName]: String(value),
              },
            );
            break;
          case 'less_than':
            qb.andWhere(
              `(${fieldAccessor})::numeric < :${paramName}::numeric`,
              {
                [paramName]: String(value),
              },
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

    // Búsqueda global (search) sobre campos text y number del esquema
    if (query?.search) {
      const workspace = await this.workspaceRepo.findOne({
        where: { id: workspaceId },
      });
      const collectionNode = workspace?.nodes?.find(
        (node) => node.id === collectionId,
      );
      const searchableFields =
        collectionNode?.data?.fields?.filter(
          (f) => (f.type === 'text' || f.type === 'number') && !f.relation,
        ) ?? [];

      if (searchableFields.length > 0) {
        const searchConditions = searchableFields
          .map((f, i) => {
            if (f.type === 'number') {
              return `(record."data"->>'${f.name}')::text ILIKE :search_${i}`;
            }
            return `record."data"->>'${f.name}' ILIKE :search_${i}`;
          })
          .join(' OR ');

        const searchParams: Record<string, string> = {};
        searchableFields.forEach((_, i) => {
          searchParams[`search_${i}`] = `%${query.search!}%`;
        });

        qb.andWhere(`(${searchConditions})`, searchParams);
      }
    }
  }

  /**
   * BULK_INSERT: Inserción masiva usando el insert nativo de TypeORM.
   * Genera una sola sentencia SQL INSERT optimizada.
   */
  async bulkInsert(
    workspaceId: string,
    collectionId: string,
    data: Record<string, unknown>[],
  ) {
    try {
      // Validar cada item antes de procesar
      for (const item of data) {
        await this.validateRecordData(workspaceId, collectionId, item, false);
      }

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
    } catch (error) {
      return await this.handleRecordError(
        error,
        workspaceId,
        collectionId,
        'bulkInsert',
      );
    }
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

    const incomingRelations =
      workspace?.nodes?.flatMap((node) =>
        node.data?.fields
          ?.filter(
            (f) =>
              f.relation?.targetCollectionId === collectionId &&
              (f?.relation?.countFieldName || f?.relation?.listFieldName),
          )
          .map((f) => ({
            ...f.relation,
            sourceCollectionId: node.id,
            fieldName: f.name,
          })),
      ) || [];

    for (const rel of incomingRelations) {
      if (wantCount && rel.countFieldName) {
        recordData[rel.countFieldName] = await this.recordRepo
          .createQueryBuilder('record')
          .where('record."workspaceId" = :workspaceId', { workspaceId })
          .andWhere('record."collectionId" = :colId', {
            colId: rel.sourceCollectionId,
          })
          .andWhere(`record."data"->>:fName = :recordId`, {
            fName: rel.fieldName,
            recordId,
          })
          .getCount();
      }

      if (wantList && rel.listFieldName) {
        const records = await this.recordRepo
          .createQueryBuilder('record')
          .where('record."workspaceId" = :workspaceId', { workspaceId })
          .andWhere('record."collectionId" = :colId', {
            colId: rel.sourceCollectionId,
          })
          .andWhere(`record."data"->>:fName = :recordId`, {
            fName: rel.fieldName,
            recordId,
          })
          .getMany();

        recordData[rel.listFieldName] = records.map((r) => r.data);
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

    const fieldsWithRelation = collectionNode?.data?.fields?.filter(
      (f) => f.relation?.targetCollectionId || f.isUser,
    );
    if (!fieldsWithRelation) return;
    for (const field of fieldsWithRelation) {
      const value = data[field.name];
      if (!value) continue;
      if (field.isUser) {
        const user = await this.userRepo.findOne({
          where: { id: value as string },
        });
        if (user) {
          await this.relationRepo.save({
            targetUserId: user.id,
            targetNameRecord: field?.name,
            targetRecordId: savedRecord.id,
          });
        }
      } else if (field.relation?.targetCollectionId) {
        const record = await this.recordRepo.findOne({
          where: { id: value as string },
        });
        if (record) {
          await this.relationRepo.save({
            targetRecordId: savedRecord?.id,
            targetNameRecord: field?.name,
            linkedRecordId: value as string,
          });
        }
      }
    }
  }

  /**
   * Identifica campos de relación en la colección y actualiza los registros en
   * la tabla de relaciones de records (borra y recrea para los campos enviados).
   */
  private async updateRelations(
    workspaceId: string,
    collectionId: string,
    data: Record<string, unknown>,
    idRecord: string,
  ) {
    const workspace = await this.workspaceRepo.findOne({
      where: { id: workspaceId },
    });

    if (!workspace || !workspace.nodes) return;

    const nodes = workspace.nodes;
    const collectionNode = nodes.find((node) => node.id === collectionId);

    if (!collectionNode?.data?.fields) return;

    const fieldsWithRelation = collectionNode.data.fields.filter(
      (f) =>
        (f.relation?.targetCollectionId || f.isUser) &&
        Object.prototype.hasOwnProperty.call(data, f.name),
    );

    if (fieldsWithRelation.length === 0) return;

    for (const field of fieldsWithRelation) {
      const value = data[field.name];

      await this.relationRepo.delete({
        targetRecordId: idRecord,
        targetNameRecord: field.name,
      });
      if (!value) continue;

      if (field.isUser) {
        const user = await this.userRepo.findOne({
          where: { id: value as string },
        });
        if (user) {
          await this.relationRepo.save({
            targetUserId: user.id,
            targetNameRecord: field.name,
            targetRecordId: idRecord,
          });
        }
      } else if (field.relation?.targetCollectionId) {
        const record = await this.recordRepo.findOne({
          where: { id: value as string },
        });
        if (record) {
          await this.relationRepo.save({
            targetRecordId: idRecord,
            targetNameRecord: field.name,
            linkedRecordId: value as string,
          });
        }
      }
    }
  }

  /**
   * Helper para formatear y loggear errores incluyendo nombres de Workspace y Collection
   */
  private async handleRecordError(
    error: unknown,
    workspaceId: string,
    collectionId: string,
    action: string,
  ): Promise<never> {
    let nameWorkspace = 'Desconocido';
    let nameCollection = 'Desconocida';

    try {
      const workspace = await this.workspaceRepo.findOne({
        where: { id: workspaceId },
      });
      if (workspace) {
        nameWorkspace = workspace.name || nameWorkspace;
        const collectionNode = workspace.nodes?.find(
          (node) => node.id === collectionId,
        );
        if (collectionNode?.data?.label) {
          nameCollection = collectionNode.data.label;
        }
      }
    } catch {
      // Ignorar error al buscar metadatos para no ocultar el error real
    }

    const errorPayload = {
      typeError: 'collection',
      nameCollection,
      idCollection: collectionId,
      nameWorkspace,
      idWorkspace: workspaceId,
      action,
      detail: error instanceof Error ? error.message : String(error),
    };

    this.logger.error(`Error en "${action}": ${JSON.stringify(errorPayload)}`);
    throw new BadRequestException(errorPayload);
  }
}
