import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { WorkspaceRecord } from './workspace-record.entity';

@Entity('workspace_record_relations')
export class WorkspaceRecordRelation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  targetRecordId?: string;

  @Column({ nullable: true })
  targetUserId?: string;

  @Column()
  targetNameRecord: string;

  @ManyToOne(() => WorkspaceRecord, (record) => record.targetRelations, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  targetRecord?: WorkspaceRecord;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  targetUser?: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
