import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('workspace_history')
export class WorkspaceHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  name?: string;

  @Column({ nullable: true })
  description?: string;

  @Column()
  workspaceId: string;

  @Column({ type: 'json', nullable: true })
  content: any;

  @Column({ default: true })
  isActive: boolean;
}
