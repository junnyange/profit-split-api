import {
  Column, CreateDateColumn, Entity, OneToMany,
  PrimaryGeneratedColumn, UpdateDateColumn, VersionColumn,
} from 'typeorm';
import { bigintTransformer } from '../common/bigint.transformer';
import { Contribution } from './contribution.entity';
import { Expense } from '../expenses/expense.entity';

@Entity('weeks')
export class Week {
  @PrimaryGeneratedColumn()
  id: number;

  // 그 주의 확정일(화요일). 기존 시트 앱의 key 날짜와 같다
  @Column({ type: 'date', unique: true })
  confirmDate: string;

  @Column({ type: 'bigint', default: 0, transformer: bigintTransformer })
  salesBefore: number;

  @Column({ type: 'bigint', default: 0, transformer: bigintTransformer })
  salesAfter: number;

  @Column({ default: false })
  confirmed: boolean;

  @Column({ type: 'datetime', nullable: true })
  confirmedAt: Date | null;

  @OneToMany(() => Contribution, (c) => c.week)
  contributions: Contribution[];

  @OneToMany(() => Expense, (e) => e.week)
  expenses: Expense[];

  @VersionColumn()
  version: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
