import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type {
  RecurrentConfig,
  WorkspaceAction,
} from '../interfaces/workspaces-action.interface';

export type ScheduledActionStatus = 'pending' | 'executed' | 'failed';

@Entity('scheduled_actions')
export class ScheduledAction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  workspaceId: string;

  @Column()
  collectionId: string;

  @Column()
  actionId: string;

  @Column({ type: 'jsonb' })
  actionSnapshot: Record<string, unknown>;

  @Column({ type: 'jsonb', default: {} })
  recordData: Record<string, unknown>;

  @Column({ type: 'varchar', default: 'pending' })
  status: string;

  @Column({ type: 'timestamptz' })
  executeAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  executedAt: Date | null;

  @Column({ default: false })
  isRecurrent: boolean;

  @Column({ type: 'json', nullable: true })
  recurrentConfig: Record<string, number> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  /**
   * Helper getters to cast the JSON columns to their proper types.
   */
  get action(): WorkspaceAction {
    return this.actionSnapshot as unknown as WorkspaceAction;
  }

  get recurrence(): RecurrentConfig | null {
    return this.recurrentConfig as unknown as RecurrentConfig | null;
  }
}
