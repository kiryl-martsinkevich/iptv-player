import { getNowNext, EpgProgramme } from '../../src/epg/types';

const PROGS: EpgProgramme[] = [
  { channelId: 'ch1', start: new Date('2024-06-01T10:00:00Z'), stop: new Date('2024-06-01T11:00:00Z'), title: 'Morning Show' },
  { channelId: 'ch1', start: new Date('2024-06-01T11:00:00Z'), stop: new Date('2024-06-01T12:00:00Z'), title: 'Midday News' },
  { channelId: 'ch1', start: new Date('2024-06-01T12:00:00Z'), stop: new Date('2024-06-01T13:00:00Z'), title: 'Afternoon Show' },
  { channelId: 'ch2', start: new Date('2024-06-01T10:00:00Z'), stop: new Date('2024-06-01T11:00:00Z'), title: 'Other Channel' },
];

describe('getNowNext', () => {
  it('returns current and next programme', () => {
    const { now, next } = getNowNext(PROGS, 'ch1', new Date('2024-06-01T10:30:00Z'));
    expect(now?.title).toBe('Morning Show');
    expect(next?.title).toBe('Midday News');
  });

  it('does not bleed programmes from other channels', () => {
    const { now } = getNowNext(PROGS, 'ch2', new Date('2024-06-01T10:30:00Z'));
    expect(now?.title).toBe('Other Channel');
  });

  it('returns undefined now when nothing is currently airing', () => {
    const { now } = getNowNext(PROGS, 'ch1', new Date('2024-06-01T09:00:00Z'));
    expect(now).toBeUndefined();
  });

  it('returns next programme even when nothing is currently airing', () => {
    const { next } = getNowNext(PROGS, 'ch1', new Date('2024-06-01T09:00:00Z'));
    expect(next?.title).toBe('Morning Show');
  });

  it('returns undefined next when the current programme is the last one', () => {
    const { next } = getNowNext(PROGS, 'ch1', new Date('2024-06-01T12:30:00Z'));
    expect(next).toBeUndefined();
  });

  it('returns empty NowNext for unknown channel', () => {
    const { now, next } = getNowNext(PROGS, 'unknown', new Date('2024-06-01T10:30:00Z'));
    expect(now).toBeUndefined();
    expect(next).toBeUndefined();
  });
});
