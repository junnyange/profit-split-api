import { ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { HealthController } from './health.controller';

function controller(query: jest.Mock) {
  return new HealthController({ query } as unknown as DataSource);
}

describe('HealthController', () => {
  it('DB가 응답하면 ok', async () => {
    const query = jest.fn().mockResolvedValue([{ 1: 1 }]);
    await expect(controller(query).check()).resolves.toEqual({ status: 'ok', db: 'up' });
    expect(query).toHaveBeenCalledWith('SELECT 1');
  });

  it('DB 쿼리가 실패하면 503', async () => {
    const query = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(controller(query).check()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
