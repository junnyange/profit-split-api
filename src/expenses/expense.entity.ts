import {
  Column, CreateDateColumn, Entity, JoinColumn, ManyToOne,
  PrimaryGeneratedColumn, VersionColumn,
} from 'typeorm';
import { bigintTransformer } from '../common/bigint.transformer';
import { Member } from '../members/member.entity';
import { Week } from '../weeks/week.entity';

@Entity('expenses')
export class Expense {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  weekId: number;

  @ManyToOne(() => Week, (w) => w.expenses, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'weekId' })
  week: Week;

  @Column({ length: 100 })
  item: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  amount: number;

  @Column({ type: 'int', nullable: true })
  buyerId: number | null;

  @ManyToOne(() => Member, { nullable: true })
  @JoinColumn({ name: 'buyerId' })
  buyer: Member | null;

  @Column({ default: false })
  distributed: boolean;

  @VersionColumn()
  version: number;

  @CreateDateColumn()
  createdAt: Date;
}
