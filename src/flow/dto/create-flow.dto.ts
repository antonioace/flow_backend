import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

// ─── Enums ───────────────────────────────────────────────────────

export enum NodeType {
  TRIGGER = 'trigger',
  ACTION = 'action',
  CONDITIONAL = 'conditional',
}

export enum TriggerType {
  NORMAL = 'NORMAL',
  CRON = 'CRON',
  WEBHOOK = 'WEBHOOK',
}

export enum CronMode {
  EXACT_TIME = 'EXACT_TIME',
  DATE_RANGE = 'DATE_RANGE',
  RECURRING = 'RECURRING',
}

export enum RecurringUnit {
  MINUTES = 'MINUTES',
  HOURS = 'HOURS',
  DAYS = 'DAYS',
}

export enum ActionType {
  SEND_NOTIFICATION = 'SEND_NOTIFICATION',
  SEND_EMAIL = 'SEND_EMAIL',
  WEBHOOK = 'WEBHOOK',
  PROCESS_DATA = 'PROCESS_DATA',
}

export enum VariableType {
  TEXT = 'TEXT',
  NUMBER = 'NUMBER',
  BOOLEAN = 'BOOLEAN',
  DATE = 'DATE',
}

export enum HttpMethod {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  PATCH = 'PATCH',
}

// ─── Shared sub-DTOs ─────────────────────────────────────────────

export class PositionDto {
  @IsNumber()
  x: number;

  @IsNumber()
  y: number;
}

export class MeasuredPositionDto {
  @IsNumber()
  width: number;
  @IsNumber()
  height: number;
}

// ─── Condition ───────────────────────────────────────────────────

export class ConditionDto {
  @IsString()
  id: string;

  @IsString()
  variableId: string;

  @IsString()
  operator: string;

  @IsString()
  value: string;
}

// ─── Action Configs ──────────────────────────────────────────────

export class NotificationConfigDto {
  @IsString()
  title: string;

  @IsString()
  content: string;

  @IsString()
  receiverVariableId: string;
}

export class EmailConfigDto {
  @IsString()
  title: string;

  @IsString()
  content: string;

  @IsString()
  receiverVariableId: string;
}

// ─── Webhook sub-DTOs ────────────────────────────────────────────

export class WebhookHeaderDto {
  @IsString()
  id: string;

  @IsString()
  key: string;

  @IsString()
  value: string;
}

export class WebhookBodyEntryDto {
  @IsString()
  id: string;

  @IsString()
  key: string;

  @IsString()
  value: string;

  @IsBoolean()
  isVariable: boolean;
}

export class WebhookOutputFieldDto {
  @IsString()
  id: string;

  @IsString()
  key: string;

  @IsEnum(VariableType)
  type: VariableType;
}

export class WebhookConfigDto {
  @IsString()
  url: string;

  @IsEnum(HttpMethod)
  method: HttpMethod;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WebhookHeaderDto)
  headers: WebhookHeaderDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WebhookBodyEntryDto)
  body: WebhookBodyEntryDto[];

  @IsBoolean()
  hasOutput: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WebhookOutputFieldDto)
  outputFields: WebhookOutputFieldDto[];
}

// ─── Process Data Config ─────────────────────────────────────────

export class ProcessDataConfigDto {
  @IsString()
  code: string;
}

// ─── Cron Config ─────────────────────────────────────────────────

export class CronConfigDto {
  @IsEnum(CronMode)
  mode?: CronMode;

  @IsOptional()
  @IsString()
  exactTime?: string;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  @IsOptional()
  @IsNumber()
  intervalMinutes?: number;

  @IsOptional()
  @IsNumber()
  recurringValue?: number;

  @IsOptional()
  @IsEnum(RecurringUnit)
  recurringUnit?: RecurringUnit;
}

// ─── Node Data (polymorphic) ─────────────────────────────────────

abstract class BaseNodeDataDto {
  @IsString()
  label: string;
}

export class TriggerNodeDataDto extends BaseNodeDataDto {
  @IsEnum(TriggerType)
  triggerType: TriggerType;

  @IsOptional()
  @ValidateNested()
  @Type(() => CronConfigDto)
  cronConfig?: CronConfigDto;

  @IsOptional()
  @IsString()
  jsonSchema?: string;
}

export class ActionNodeDataDto extends BaseNodeDataDto {
  @IsEnum(ActionType)
  actionType: ActionType;

  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationConfigDto)
  notificationConfig?: NotificationConfigDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => EmailConfigDto)
  emailConfig?: EmailConfigDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => WebhookConfigDto)
  webhookConfig?: WebhookConfigDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ProcessDataConfigDto)
  processDataConfig?: ProcessDataConfigDto;
}

export class ConditionalNodeDataDto extends BaseNodeDataDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConditionDto)
  conditions: ConditionDto[];
}

// ─── Node DTO (discriminated by "type") ──────────────────────────

function transformNodeData(params: {
  value: unknown;
  obj: Record<string, unknown>;
}): TriggerNodeDataDto | ActionNodeDataDto | ConditionalNodeDataDto {
  const { value, obj } = params;
  if (!value || typeof value !== 'object') return value as TriggerNodeDataDto;
  const nodeType = obj.type as NodeType;
  switch (nodeType) {
    case NodeType.TRIGGER:
      return plainToInstance(TriggerNodeDataDto, value);
    case NodeType.ACTION:
      return plainToInstance(ActionNodeDataDto, value);
    case NodeType.CONDITIONAL:
      return plainToInstance(ConditionalNodeDataDto, value);
    default:
      return value as TriggerNodeDataDto;
  }
}

export class FlowNodeDto {
  @IsString()
  id: string;

  @IsEnum(NodeType)
  type: NodeType;

  @ValidateNested()
  @Type(() => PositionDto)
  position: PositionDto;

  @ValidateNested()
  @Type(() => MeasuredPositionDto)
  measured: MeasuredPositionDto;

  @IsOptional()
  @IsBoolean()
  selected?: boolean;

  @IsOptional()
  @IsBoolean()
  dragging?: boolean;

  @ValidateNested()
  @Transform(transformNodeData)
  data: TriggerNodeDataDto | ActionNodeDataDto | ConditionalNodeDataDto;
}

// ─── Edge DTO ────────────────────────────────────────────────────

export class FlowEdgeDto {
  @IsString()
  id: string;

  @IsString()
  source: string;

  @IsOptional()
  @IsString()
  sourceHandle?: string;

  @IsString()
  target: string;

  @IsOptional()
  @IsString()
  targetHandle?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsBoolean()
  animated?: boolean;
}

// ─── Variable DTO ────────────────────────────────────────────────

export class VariableDto {
  @IsString()
  id: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(VariableType)
  type: VariableType;
}

// ─── Create Flow DTO ─────────────────────────────────────────────

export class CreateFlowDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FlowNodeDto)
  nodes?: FlowNodeDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FlowEdgeDto)
  edges?: FlowEdgeDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariableDto)
  variables?: VariableDto[];
}
