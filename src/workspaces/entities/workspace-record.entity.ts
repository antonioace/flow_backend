import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { WorkspaceRecordRelation } from './workspace-record-relation.entity';
import { Workspace } from './workspace.entity';

@Entity('workspace_records')
export class WorkspaceRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  workspaceId?: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'workspaceId' })
  workspace?: Workspace;

  @Column()
  collectionId: string;

  @Column({ type: 'jsonb', default: {} })
  data: unknown;

  @Column({ nullable: true })
  userId?: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @OneToMany(() => WorkspaceRecordRelation, (relation) => relation.targetRecord)
  targetRelations: WorkspaceRecordRelation[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
