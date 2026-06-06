import { getRetryDelay } from '../../src/playback/resilienceConfig';

describe('getRetryDelay', () => {
  it('returns 1 s on first retry', () => {
    expect(getRetryDelay(0)).toBe(1_000);
  });

  it('doubles on each retry', () => {
    expect(getRetryDelay(1)).toBe(2_000);
    expect(getRetryDelay(2)).toBe(4_000);
    expect(getRetryDelay(3)).toBe(8_000);
  });

  it('caps at 30 s by default', () => {
    expect(getRetryDelay(5)).toBe(30_000);
    expect(getRetryDelay(10)).toBe(30_000);
    expect(getRetryDelay(100)).toBe(30_000);
  });

  it('respects a custom cap', () => {
    expect(getRetryDelay(2, 3_000)).toBe(3_000); // 4000 clamped to 3000
    expect(getRetryDelay(0, 500)).toBe(500);      // 1000 clamped to 500
  });
});
