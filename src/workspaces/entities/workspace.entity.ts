import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { CollectionNode } from '../interfaces/collection-node.interface';
import { WorkspaceAction } from '../interfaces/workspaces-action.interface';

@Entity('workspaces')
export class Workspace {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description?: string;

  @Column()
  userId: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ nullable: true, type: 'json' })
  nodes?: CollectionNode[];

  @Column({ nullable: true, type: 'json' })
  edges?: any;

  @Column({ nullable: true, type: 'json' })
  actions?: WorkspaceAction[];

  @Column({ default: true })
  isActive: boolean;
}
