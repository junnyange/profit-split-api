import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Member } from './member.entity';

@Injectable()
export class MembersService {
  constructor(
    @InjectRepository(Member) private readonly members: Repository<Member>,
  ) {}

  findAll(): Promise<Member[]> {
    return this.members.find({ order: { id: 'ASC' } });
  }

  async assertExists(id: number): Promise<void> {
    if (!(await this.members.existsBy({ id }))) {
      throw new NotFoundException(`멤버 ${id}이(가) 없습니다`);
    }
  }
}
