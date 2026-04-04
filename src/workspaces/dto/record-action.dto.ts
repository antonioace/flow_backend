import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export enum RecordAction {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  GET = 'get',
  GET_ALL = 'getAll',
}

export class ConditionalActionDto {
  @IsString()
  @IsNotEmpty()
  field: string;

  @IsString()
  @IsNotEmpty()
  operator: string;

  @IsOptional()
  value?: any;
}

export class PaginationDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number;
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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConditionalActionDto)
  conditionals?: ConditionalActionDto[];
  @IsOptional()
  @ValidateNested()
  @Type(() => PaginationDto)
  pagination?: PaginationDto;
}
