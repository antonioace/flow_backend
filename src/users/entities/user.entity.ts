import { Exclude } from 'class-transformer';
import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Audio } from '../../audio/entities/audio.entity';
import { File } from '../../files/entities/file.entity';
import { Notification } from '../../notifications/entities/notification.entity';
import { WorkspaceRecord } from '../../workspaces/entities/workspace-record.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  profile?: string;

  @Exclude()
  @Column()
  password: string;

  @Column({ default: 'user' })
  role: string;

  @Column({ nullable: true })
  resetPasswordToken?: string;

  @Column({ nullable: true })
  resetPasswordExpires?: Date;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => Notification, (notification) => notification.user)
  notifications: Notification[];

  @OneToMany(() => File, (file) => file.user)
  files: File[];

  @OneToMany(() => Audio, (audio) => audio.user)
  audios: Audio[];

  @OneToMany(() => WorkspaceRecord, (record) => record.user)
  workspaceRecords: WorkspaceRecord[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
