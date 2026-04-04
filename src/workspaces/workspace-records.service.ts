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

export interface InternalRecord {
  _id: string;
  _createdAt: string;
  _updatedAt: string;
  [key: string]: unknown;
}

interface JsonbRecordResult {
  record: InternalRecord | null;
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

      default:
        throw new BadRequestException(
          `Acción "${action as string}" no soportada.`,
        );
    }
  }

  // ─── Acciones internas (QueryBuilder + funciones JSONB de PostgreSQL) ───

  /**
   * CREATE: Usa QueryBuilder .update().set() con el operador JSONB || para
   * concatenar atómicamente. Si no existe la fila, usa .insert().
   */
  private async createRecord(
    workspaceId: string,
    collectionId: string,
    data: Record<string, unknown>,
  ) {
    const newEntry: InternalRecord = {
      _id: randomUUID(),
      ...data,
      _createdAt: new Date().toISOString(),
      _updatedAt: new Date().toISOString(),
    };

    // Append atómico con operador || de JSONB via QueryBuilder
    const result = await this.recordRepo
      .createQueryBuilder()
      .update(WorkspaceRecord)
      .set({
        records: () => `COALESCE("records", '[]'::jsonb) || :newEntry::jsonb`,
      })
      .setParameter('newEntry', JSON.stringify([newEntry]))
      .where('"workspaceId" = :workspaceId', { workspaceId })
      .andWhere('"collectionId" = :collectionId', { collectionId })
      .execute();

    if (result.affected === 0) {
      // No existe la fila → crear con insert del QueryBuilder
      await this.recordRepo
        .createQueryBuilder()
        .insert()
        .into(WorkspaceRecord)
        .values({
          workspaceId,
          collectionId,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          records: [newEntry] as any,
        })
        .execute();
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

  /**
   * UPDATE: Usa QueryBuilder .update().set() con jsonb_agg(CASE WHEN ...)
   * para modificar un elemento del array atómicamente en PostgreSQL.
   * Luego recupera el elemento actualizado con un select + jsonb_array_elements.
   */
  private async updateRecord(
    workspaceId: string,
    collectionId: string,
    idRecord: string,
    data: Record<string, unknown>,
  ) {
    const now = new Date().toISOString();

    // Actualización atómica: jsonb_agg + CASE dentro de .set()
    const result = await this.recordRepo
      .createQueryBuilder()
      .update(WorkspaceRecord)
      .set({
        records: () =>
          `(SELECT jsonb_agg(
              CASE
                WHEN elem->>'_id' = :idRecord
                THEN (elem || :data::jsonb) || jsonb_build_object('_id', :idRecord::text, '_updatedAt', :now::text)
                ELSE elem
              END
            )
            FROM jsonb_array_elements("records") AS elem)`,
      })
      .setParameter('idRecord', idRecord)
      .setParameter('data', JSON.stringify(data))
      .setParameter('now', now)
      .where('"workspaceId" = :workspaceId', { workspaceId })
      .andWhere('"collectionId" = :collectionId', { collectionId })
      .andWhere(
        `EXISTS (SELECT 1 FROM jsonb_array_elements("records") AS e WHERE e->>'_id' = :idRecord)`,
      )
      .execute();

    if (result.affected === 0) {
      throw new NotFoundException(
        `Record con id "${idRecord}" no encontrado en la colección "${collectionId}".`,
      );
    }

    // Obtener el elemento actualizado con select + jsonb_array_elements
    const updated = await this.recordRepo
      .createQueryBuilder('wr')
      .select(
        `(SELECT elem FROM jsonb_array_elements(wr.records) AS elem WHERE elem->>'_id' = :idRecord LIMIT 1)`,
        'record',
      )
      .where('wr.workspaceId = :workspaceId', { workspaceId })
      .andWhere('wr.collectionId = :collectionId', { collectionId })
      .setParameter('idRecord', idRecord)
      .getRawOne<JsonbRecordResult>();

    this.logger.log(
      `Record "${idRecord}" actualizado en colección "${collectionId}"`,
    );

    return {
      success: true,
      action: 'update',
      message: 'Record actualizado exitosamente.',
      data: updated?.record,
    };
  }

  /**
   * DELETE: Primero extrae el elemento a eliminar con select + jsonb_array_elements,
   * luego usa QueryBuilder .update().set() con jsonb_agg filtrando el _id.
   */
  private async deleteRecord(
    workspaceId: string,
    collectionId: string,
    idRecord: string,
  ) {
    // Obtener el elemento antes de eliminarlo
    const toDelete = await this.recordRepo
      .createQueryBuilder('wr')
      .select(
        `(SELECT elem FROM jsonb_array_elements(wr.records) AS elem WHERE elem->>'_id' = :idRecord LIMIT 1)`,
        'record',
      )
      .where('wr.workspaceId = :workspaceId', { workspaceId })
      .andWhere('wr.collectionId = :collectionId', { collectionId })
      .setParameter('idRecord', idRecord)
      .getRawOne<JsonbRecordResult>();

    if (!toDelete?.record) {
      throw new NotFoundException(
        `Record con id "${idRecord}" no encontrado en la colección "${collectionId}".`,
      );
    }

    // Eliminación atómica: jsonb_agg filtrando el elemento
    await this.recordRepo
      .createQueryBuilder()
      .update(WorkspaceRecord)
      .set({
        records: () =>
          `(SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
            FROM jsonb_array_elements("records") AS elem
            WHERE elem->>'_id' != :idRecord)`,
      })
      .setParameter('idRecord', idRecord)
      .where('"workspaceId" = :workspaceId', { workspaceId })
      .andWhere('"collectionId" = :collectionId', { collectionId })
      .execute();

    this.logger.log(
      `Record "${idRecord}" eliminado de colección "${collectionId}"`,
    );

    return {
      success: true,
      action: 'delete',
      message: 'Record eliminado exitosamente.',
      data: toDelete.record,
    };
  }

  /**
   * GET: Usa QueryBuilder .select() con una subquery de jsonb_array_elements
   * para extraer un único elemento sin traer el array completo.
   */
  private async getRecord(
    workspaceId: string,
    collectionId: string,
    idRecord: string,
  ) {
    const result = await this.recordRepo
      .createQueryBuilder('wr')
      .select(
        `(SELECT elem FROM jsonb_array_elements(wr.records) AS elem WHERE elem->>'_id' = :idRecord LIMIT 1)`,
        'record',
      )
      .where('wr.workspaceId = :workspaceId', { workspaceId })
      .andWhere('wr.collectionId = :collectionId', { collectionId })
      .setParameter('idRecord', idRecord)
      .getRawOne<JsonbRecordResult>();

    if (!result?.record) {
      throw new NotFoundException(
        `Record con id "${idRecord}" no encontrado en la colección "${collectionId}".`,
      );
    }

    return {
      success: true,
      action: 'obtener',
      message: 'Record obtenido exitosamente.',
      data: result.record,
    };
  }

  /**
   * GET_ALL: Obtiene todos los records y aplica filtros opcionales.
   * Se mantiene con findOne ya que necesita extraer y filtrar el array completo.
   */
  private async getAllRecords(
    workspaceId: string,
    collectionId: string,
    conditionals?: ConditionalActionDto[],
    pagination?: PaginationDto,
  ) {
    const record = await this.recordRepo.findOne({
      where: { workspaceId, collectionId },
    });

    let records =
      record && Array.isArray(record.records)
        ? (record.records as InternalRecord[])
        : [];

    if (conditionals && conditionals.length > 0) {
      records = records.filter((r) => {
        return conditionals.every((condition) => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          const { field, operator, value } = condition;
          const actualVal = r[field];

          // Manejo de valores nulos o indefinidos
          if (actualVal === undefined || actualVal === null) {
            return operator === 'not_equals';
          }

          // eslint-disable-next-line @typescript-eslint/no-base-to-string
          const actualStr = String(actualVal);
          const expectedStr = String(value);

          switch (operator) {
            case 'equals':
              return actualStr === expectedStr;
            case 'not_equals':
              return actualStr !== expectedStr;
            case 'contains':
              return actualStr.includes(expectedStr);
            case 'starts_with':
              return actualStr.startsWith(expectedStr);
            case 'ends_with':
              return actualStr.endsWith(expectedStr);
            case 'greater_than':
              return Number(actualStr) > Number(expectedStr);
            case 'less_than':
              return Number(actualStr) < Number(expectedStr);
            case 'greater_equal':
              return Number(actualStr) >= Number(expectedStr);
            case 'less_equal':
              return Number(actualStr) <= Number(expectedStr);
            case 'before':
              return new Date(actualStr) < new Date(expectedStr);
            case 'after':
              return new Date(actualStr) > new Date(expectedStr);
            default:
              return false;
          }
        });
      });
    }

    const totalFiltered = records.length;

    if (pagination) {
      const page = pagination.page || 1;
      const limit = pagination.limit || 10;
      const startIndex = (page - 1) * limit;
      records = records.slice(startIndex, startIndex + limit);
    }

    return {
      success: true,
      action: 'obtenerTodos',
      message: `Se obtuvieron ${records.length} records de la colección "${collectionId}".`,
      data: records,
      meta: {
        total: totalFiltered,
        page: pagination?.page || 1,
        limit: pagination?.limit || totalFiltered,
      },
    };
  }
}
