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

  // 수동 잠금. true/false = 누가 직접 잠금/해제, null = 자동 (확정일 00:00 KST가 지나면 잠김). lock.ts 참고
  @Column({ type: 'boolean', nullable: true })
  manualLock: boolean | null;

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
