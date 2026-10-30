import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

// 'YYYY-MM-DD' 형식이면서 실제로 있는 날짜인지 검사 (2099-02-30 같은 값은 400)
@Injectable()
export class ParseDatePipe implements PipeTransform<string, string> {
  transform(value: string): string {
    const valid =
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);
    if (!valid) {
      throw new BadRequestException('confirmDate는 YYYY-MM-DD 형식이어야 합니다');
    }
    return value;
  }
}
