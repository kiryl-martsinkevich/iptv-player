import { serializeEpg, deserializeEpg } from '../../src/epg/cache';
import type { EpgData } from '../../src/epg/types';

const DATA: EpgData = {
  channels: [
    { id: 'cnn.us', displayName: 'CNN', iconUrl: 'http://logo.example.com/cnn.png' },
    { id: 'bbc.uk', displayName: 'BBC' },
  ],
  programmes: [
    {
      channelId: 'cnn.us',
      start: new Date('2024-06-01T12:00:00Z'),
      stop: new Date('2024-06-01T13:00:00Z'),
      title: 'News Hour',
      description: 'World news.',
    },
    {
      channelId: 'bbc.uk',
      start: new Date('2024-06-01T14:00:00Z'),
      stop: new Date('2024-06-01T15:00:00Z'),
      title: 'BBC Report',
    },
  ],
};

describe('EPG cache round-trip', () => {
  it('serializes to a JSON-safe plain object', () => {
    const snap = serializeEpg(DATA);
    expect(() => JSON.stringify(snap)).not.toThrow();
  });

  it('restores channels exactly', () => {
    const { result } = deserializeEpg(serializeEpg(DATA));
    expect(result.channels).toEqual(DATA.channels);
  });

  it('restores programme Dates as Date instances with correct values', () => {
    const { result } = deserializeEpg(serializeEpg(DATA));
    expect(result.programmes[0].start).toBeInstanceOf(Date);
    expect(result.programmes[0].start).toEqual(DATA.programmes[0].start);
    expect(result.programmes[0].stop).toEqual(DATA.programmes[0].stop);
  });

  it('preserves optional description — present and absent', () => {
    const { result } = deserializeEpg(serializeEpg(DATA));
    expect(result.programmes[0].description).toBe('World news.');
    expect(result.programmes[1].description).toBeUndefined();
  });

  it('fetchedAt round-trips as a Date close to now', () => {
    const before = Date.now();
    const { fetchedAt } = deserializeEpg(serializeEpg(DATA));
    expect(fetchedAt).toBeInstanceOf(Date);
    expect(fetchedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(fetchedAt.getTime()).toBeLessThanOrEqual(Date.now() + 100);
  });

  it('snapshot stores start/stop as ISO strings, not Date objects', () => {
    const snap = serializeEpg(DATA);
    expect(typeof snap.programmes[0].start).toBe('string');
    expect(typeof snap.programmes[0].stop).toBe('string');
  });
});
