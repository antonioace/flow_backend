import { IsNotEmpty, IsString } from 'class-validator';

export class GenerateSchemaDto {
  @IsString({ message: 'La descripción debe ser texto.' })
  @IsNotEmpty({ message: 'La descripción de la aplicación es obligatoria.' })
  description: string;
}
