import { parseSeedMembers } from './seed-members';

describe('parseSeedMembers', () => {
  it('쉼표로 나누고 공백과 빈 칸을 버린다', () => {
    expect(parseSeedMembers(' A, B ,,C ')).toEqual(['A', 'B', 'C']);
  });

  it('없거나 비어 있으면 빈 배열 (seed 건너뜀)', () => {
    expect(parseSeedMembers(undefined)).toEqual([]);
    expect(parseSeedMembers(' , ')).toEqual([]);
  });

  it('겹치는 이름, 20자 넘는 이름은 에러', () => {
    expect(() => parseSeedMembers('A,B,A')).toThrow('두 번');
    expect(() => parseSeedMembers('x'.repeat(21))).toThrow('20자');
  });
});
