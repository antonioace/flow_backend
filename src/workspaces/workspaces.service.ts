import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OpenaiService } from '../openai/openai.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CreateWorkspaceHistoryDto } from './dto/create-workspace-history.dto';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { GenerateSchemaDto } from './dto/generate-schema.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { AISchemaLog } from './entities/ai-schema-log.entity';
import { WorkspaceHistory } from './entities/workspace-history.entity';
import { Workspace } from './entities/workspace.entity';

@Injectable()
export class WorkspacesService {
  private readonly logger = new Logger(WorkspacesService.name);

  constructor(
    @InjectRepository(Workspace)
    private readonly workspaceRepo: Repository<Workspace>,
    @InjectRepository(WorkspaceHistory)
    private readonly historyRepo: Repository<WorkspaceHistory>,
    @InjectRepository(AISchemaLog)
    private readonly aiSchemaLogRepo: Repository<AISchemaLog>,
    private readonly openaiService: OpenaiService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ─── Workspace CRUD ─────────────────────────────────────────────

  async create(userId: string, dto: CreateWorkspaceDto): Promise<Workspace> {
    const workspace = this.workspaceRepo.create({
      ...dto,
      userId,
    });
    return this.workspaceRepo.save(workspace);
  }

  async findAllByUser(userId: string): Promise<Workspace[]> {
    return this.workspaceRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, userId: string): Promise<Workspace> {
    const workspace = await this.workspaceRepo.findOne({ where: { id } });

    if (!workspace) {
      throw new NotFoundException(`Workspace con id "${id}" no encontrado`);
    }

    if (workspace.userId !== userId) {
      throw new ForbiddenException('No tienes acceso a este workspace');
    }

    return workspace;
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateWorkspaceDto,
  ): Promise<Workspace> {
    const workspace = await this.findOne(id, userId);
    Object.assign(workspace, dto);
    return this.workspaceRepo.save(workspace);
  }

  async remove(id: string, userId: string): Promise<void> {
    const workspace = await this.findOne(id, userId);
    await this.workspaceRepo.remove(workspace);
  }

  // ─── Workspace History ──────────────────────────────────────────

  async createHistory(
    userId: string,
    dto: CreateWorkspaceHistoryDto,
  ): Promise<WorkspaceHistory> {
    // Verificar que el usuario sea dueño del workspace
    await this.findOne(dto.workspaceId, userId);

    const history = this.historyRepo.create({
      workspaceId: dto.workspaceId,
      name: dto.name,
      description: dto.description,
      content: dto.content as Record<string, unknown>,
    });
    return this.historyRepo.save(history);
  }

  async getHistoryByWorkspace(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceHistory[]> {
    // Verificar ownership
    await this.findOne(workspaceId, userId);

    return this.historyRepo.find({
      where: { workspaceId },
    });
  }

  async removeHistory(historyId: string, userId: string): Promise<void> {
    const history = await this.historyRepo.findOne({
      where: { id: historyId },
    });

    if (!history) {
      throw new NotFoundException(
        `History con id "${historyId}" no encontrado`,
      );
    }

    // Verificar ownership del workspace al que pertenece
    await this.findOne(history.workspaceId, userId);

    await this.historyRepo.remove(history);
  }

  // ─── Generate Schema (IA) ──────────────────────────────────────

  async generateSchema(generateSchemaDto: GenerateSchemaDto) {
    const { description } = generateSchemaDto;

    if (!description) {
      throw new BadRequestException(
        'La descripción de la aplicación es obligatoria.',
      );
    }

    const systemPrompt = `Eres un diseñador experto de bases de datos. El usuario te describirá una aplicación y tú debes generar el esquema completo de colecciones (tablas) con sus campos, validaciones y relaciones.

DEBES responder ÚNICAMENTE con un JSON válido que siga EXACTAMENTE esta estructura. No agregues explicaciones fuera del JSON.

### ESTRUCTURA OBLIGATORIA

El JSON de salida debe ser un array de colecciones con este formato:

{
  "collections": [
    {
      "label": "Nombre de la Colección",
      "description": "Descripción breve de para qué sirve",
      "fields": [
        {
          "name": "nombre_del_campo",
          "type": "text | number | date | boolean",
          "validations": {
            "required": true/false,
            "optional": true/false,
            "minLength": 0,
            "maxLength": 0,
            "min": 0,
            "max": 0
          },
          "relation": null | {
            "targetCollection": "Nombre de la colección destino",
            "type": "one_to_one | one_to_many | many_to_one"
          },
          "isUser": true/false
        }
      ]
    }
  ]
}

### REGLAS ESTRICTAS

1. Tipos de campo permitidos (solo estos 4): "text", "number", "date", "boolean".
2. Validaciones:
   - required y optional son booleanos opcionales
   - minLength y maxLength SOLO se usan cuando type es "text"
   - min y max SOLO se usan cuando type es "number"
   - No incluyas validaciones que no apliquen al tipo del campo. No uses null, omite la propiedad si no aplica.
3. Relaciones:
   - Si el campo NO tiene relación, usa "relation": null
   - Si tiene relación, targetCollection debe ser el label exacto de otra colección del esquema
   - Los tipos de relación son: "one_to_one", "one_to_many", "many_to_one"
4. Toda colección debe tener un campo "_id" de tipo "text" con "required": true como primer campo.
5. Usa nombres de campos (propiedad "name") siempre en INGLÉS y en snake_case (ej: "full_name"), pero debes respetar exactamente los nombres "_id", "_createdAt" y "_updatedAt".
6. Los campos "label" y "description" deben estar siempre en ESPAÑOL.
7. Incluye siempre campos de auditoría: "_createdAt" (date) y "_updatedAt" (date) en cada colección.
8. **NO generes una colección para 'Usuarios' o 'Users'**, ya que esta entidad ya está definida globalmente en el sistema.
9. Si necesitas asociar datos a un usuario, crea un campo (ej: 'id_user') con una relación 'many_to_one' hacia la colección virtual "Usuarios".
10. Las llaves foráneas (campos que tienen una relación) deben empezar SIEMPRE con el prefijo "id_" seguido del nombre de la entidad en inglés (ej: "id_category", "id_product").
11. Si un campo es una relación hacia la colección virtual "Usuarios", debes establecer la propiedad "isUser": true. Para cualquier otro tipo de campo, omítelo o establécelo en false.

Genera el esquema para la siguiente aplicación descrita por el usuario:
${description}`;

    this.logger.log(`Generando esquema para la descripción: ${description}`);

    try {
      const result = await this.openaiService.generateJSON(
        systemPrompt,
        `{
  "collections": [
    {
      "label": "string",
      "description": "string",
      "fields": [
        {
          "name": "string",
          "type": "text | number | date | boolean",
          "validations": {
            "required": "boolean (opcional)",
            "optional": "boolean (opcional)",
            "minLength": "number (opcional, solo para text)",
            "maxLength": "number (opcional, solo para text)",
            "min": "number (opcional, solo para number)",
            "max": "number (opcional, solo para number)"
          },
          "relation": {
            "targetCollection": "string",
            "type": "one_to_one | one_to_many | many_to_one"
          },
          "isUser": "boolean (opcional)"
        }
      ]
    }
  ]
}`,
      );

      if (!result.success || !result.response) {
        throw new Error(
          result.error || 'No se pudo generar la respuesta del modelo',
        );
      }

      // Parse JSON safely
      const jsonMatch = result.response.match(/\{[\s\S]*\}/);
      const jsonString = jsonMatch ? jsonMatch[0] : result.response;

      const parsedData: Record<string, unknown> = JSON.parse(
        jsonString,
      ) as Record<string, unknown>;

      // Emitir evento para el logger asíncrono
      this.eventEmitter.emit('schema.generated', {
        description,
        prompt: systemPrompt,
        response: result.response,
      });

      return parsedData;
    } catch (error) {
      this.logger.error('Error al generar el esquema con OpenAI', error);
      throw new BadRequestException(
        'No se pudo generar el esquema de base de datos a partir de la descripción.',
      );
    }
  }

  // ─── AI Schema Logs ─────────────────────────────────────────────

  async getAISchemaLogs(pagination: PaginationDto) {
    const { page = 1, limit = 10 } = pagination;
    const skip = (page - 1) * limit;

    const [logs, total] = await this.aiSchemaLogRepo.findAndCount({
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    const totalPages = Math.ceil(total / limit);

    return {
      success: true,
      data: logs,
      meta: {
        total,
        page,
        limit,
        totalPages,
      },
    };
  }
}
