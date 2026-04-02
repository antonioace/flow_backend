import { IsObject, IsOptional, IsString } from 'class-validator';

export class CreateWorkspaceHistoryDto {
  @IsString()
  workspaceId: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsObject()
  content: any;
}
