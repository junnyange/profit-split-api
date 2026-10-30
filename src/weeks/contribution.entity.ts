import {
  Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn,
  Unique, UpdateDateColumn, VersionColumn,
} from 'typeorm';
import { bigintTransformer } from '../common/bigint.transformer';
import { Member } from '../members/member.entity';
import { Week } from './week.entity';

@Entity('contributions')
@Unique(['weekId', 'memberId'])
export class Contribution {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  weekId: number;

  @ManyToOne(() => Week, (w) => w.contributions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'weekId' })
  week: Week;

  @Column()
  memberId: number;

  @ManyToOne(() => Member)
  @JoinColumn({ name: 'memberId' })
  member: Member;

  @Column({ type: 'bigint', default: 0, transformer: bigintTransformer })
  materialAmount: number;

  @VersionColumn()
  version: number;

  @UpdateDateColumn()
  updatedAt: Date;
}
