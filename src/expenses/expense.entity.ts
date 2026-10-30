import {
  Column, CreateDateColumn, Entity, JoinColumn, ManyToOne,
  PrimaryGeneratedColumn, VersionColumn,
} from 'typeorm';
import { bigintTransformer } from '../common/bigint.transformer';
import { Member } from '../members/member.entity';
import { Week } from '../weeks/week.entity';

export const EXPENSE_CATEGORIES = ['가계부', '지출'] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

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

  // 기존 시트 앱의 cat. API로 넣을 때 생략하면 null
  @Column({ type: 'varchar', length: 10, nullable: true })
  category: ExpenseCategory | null;

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
