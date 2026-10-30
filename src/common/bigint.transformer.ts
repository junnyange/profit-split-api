import { ValueTransformer } from 'typeorm';

export const bigintTransformer: ValueTransformer = {
  to: (value?: number | null) => value,
  from: (value: string | null) => (value === null ? null : Number(value)),
};
