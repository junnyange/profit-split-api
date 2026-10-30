import { Injectable } from '@nestjs/common';

// 현재 시각을 주입받기 위한 provider. 테스트에서는 { now: () => 고정된 Date }로 바꿔 넣는다
@Injectable()
export class Clock {
  now(): Date {
    return new Date();
  }
}
