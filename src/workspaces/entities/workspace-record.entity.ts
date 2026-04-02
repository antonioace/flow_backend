import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('workspace_records')
export class WorkspaceRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  workspaceId: string;

  @Column()
  collectionId: string;

  @Column({ type: 'jsonb', nullable: true })
  records: any;

  @Column({ default: true })
  isActive: boolean;
}
