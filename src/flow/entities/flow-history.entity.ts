import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('flows_history')
export class FlowHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  flowId: string;

  @Column({ type: 'json', nullable: true })
  content: any;

  @Column({ default: true })
  isActive: boolean;
}
