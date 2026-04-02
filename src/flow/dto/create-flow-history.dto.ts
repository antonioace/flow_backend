import { IsObject, IsString } from 'class-validator';

export class CreateFlowHistoryDto {
  @IsString()
  flowId: string;

  @IsObject()
  content: any;
}
