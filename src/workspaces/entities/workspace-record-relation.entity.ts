import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WorkspaceRecord } from './workspace-record.entity';

@Entity('workspace_record_relations')
export class WorkspaceRecordRelation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  targetRecordId: string;

  @Column()
  targetNameRecord: string;

  @ManyToOne(() => WorkspaceRecord, (record) => record.targetRelations, {
    onDelete: 'CASCADE',
  })
  targetRecord: WorkspaceRecord;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
