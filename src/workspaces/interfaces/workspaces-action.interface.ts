export type ActionType = 'send_notification' | 'send_email';
export type TriggerEvent = 'create' | 'update' | 'delete';
export type ScheduleType = 'normal' | 'scheduled' | 'recurrent';

export interface RecurrentConfig {
  days: number;
  hours: number;
  minutes: number;
}

export interface NotificationConfig {
  title: string;
  content: string;
  recipientEmail?: string;
  isRecipientDynamic?: boolean;
}

export interface EmailConfig {
  subject: string;
  content: string;
  recipientEmail: string;
  isRecipientDynamic?: boolean;
}

export interface WorkspaceAction {
  id: string;
  idCollection: string;
  idWorkspace: string | null;
  name: string;
  actionType: ActionType;
  triggerEvent: TriggerEvent;
  scheduleType: ScheduleType;
  executionTime?: string; // ISO string or campo_ reference
  isExecutionDynamic?: boolean;
  referenceDate?: string; // ISO string or campo_ reference
  isReferenceDynamic?: boolean;
  recurrentConfig?: RecurrentConfig;
  notificationConfig?: NotificationConfig;
  emailConfig?: EmailConfig;
  active?: boolean;
}
