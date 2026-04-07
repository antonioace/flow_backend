import { IsOptional, IsString } from 'class-validator';

export interface UploadFileDto {
  file: any;
  folder?: string;
  fileName?: string;
}

export class UploadFileBodyDto {
  @IsString()
  @IsOptional()
  folder?: string;

  @IsString()
  @IsOptional()
  fileName?: string;
}
