import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('members')
export class Member {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 20, unique: true })
  name: string;
}
