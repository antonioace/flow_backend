import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export enum RecordAction {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  GET = 'get',
  GET_ALL = 'getAll',
}

export class RecordActionDto {
  @IsEnum(RecordAction, {
    message:
      'La acción debe ser: create, update, delete, obtener u obtenerTodos.',
  })
  action: RecordAction;

  @IsString()
  @IsNotEmpty({ message: 'El idCollection es obligatorio.' })
  idCollection: string;

  @IsOptional()
  @IsString()
  idRecord?: string;

  @IsOptional()
  data?: unknown;
}
