import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateConversationDto {
  @IsUUID()
  @IsOptional()
  recipientId?: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;
}
