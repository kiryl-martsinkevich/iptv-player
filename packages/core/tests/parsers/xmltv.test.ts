import { parseXmltv, XmltvChannel } from '../../src/parsers/xmltv';

const FULL_XML = `<?xml version="1.0" encoding="UTF-8"?>
<tv>
  <channel id="cnn.us">
    <display-name>CNN</display-name>
    <icon src="http://logo.example.com/cnn.png" />
  </channel>
  <channel id="bbc.uk">
    <display-name>BBC World</display-name>
  </channel>
  <programme start="20240601120000 +0000" stop="20240601130000 +0000" channel="cnn.us">
    <title>News Hour</title>
    <desc>The latest world news.</desc>
  </programme>
  <programme start="20240601130000 +0000" stop="20240601140000 +0000" channel="cnn.us">
    <title>Business Today</title>
  </programme>
</tv>`;

describe('parseXmltv — channels', () => {
  it('parses channel ids and display names', () => {
    const { channels } = parseXmltv(FULL_XML);
    expect(channels).toHaveLength(2);
    expect(channels[0]).toMatchObject<Partial<XmltvChannel>>({ id: 'cnn.us', displayName: 'CNN' });
    expect(channels[1]).toMatchObject<Partial<XmltvChannel>>({ id: 'bbc.uk', displayName: 'BBC World' });
  });

  it('parses channel icon URL', () => {
    const { channels } = parseXmltv(FULL_XML);
    expect(channels[0].iconUrl).toBe('http://logo.example.com/cnn.png');
  });

  it('leaves iconUrl undefined when icon element is absent', () => {
    const { channels } = parseXmltv(FULL_XML);
    expect(channels[1].iconUrl).toBeUndefined();
  });
});

describe('parseXmltv — programmes', () => {
  it('parses programme count and channel linkage', () => {
    const { programmes } = parseXmltv(FULL_XML);
    expect(programmes).toHaveLength(2);
    expect(programmes[0].channelId).toBe('cnn.us');
  });

  it('parses start and stop as UTC Dates', () => {
    const { programmes } = parseXmltv(FULL_XML);
    expect(programmes[0].start).toEqual(new Date('2024-06-01T12:00:00Z'));
    expect(programmes[0].stop).toEqual(new Date('2024-06-01T13:00:00Z'));
  });

  it('parses title and description', () => {
    const { programmes } = parseXmltv(FULL_XML);
    expect(programmes[0].title).toBe('News Hour');
    expect(programmes[0].description).toBe('The latest world news.');
  });

  it('leaves description undefined when desc element is absent', () => {
    const { programmes } = parseXmltv(FULL_XML);
    expect(programmes[1].description).toBeUndefined();
  });
});

describe('parseXmltv — date parsing', () => {
  function makeProg(start: string, stop: string): string {
    return `<tv>
      <channel id="x"><display-name>X</display-name></channel>
      <programme start="${start}" stop="${stop}" channel="x"><title>T</title></programme>
    </tv>`;
  }

  it('handles positive UTC offset', () => {
    const { programmes } = parseXmltv(makeProg('20240601120000 +0100', '20240601130000 +0100'));
    expect(programmes[0].start).toEqual(new Date('2024-06-01T11:00:00Z'));
  });

  it('handles negative UTC offset', () => {
    const { programmes } = parseXmltv(makeProg('20240601120000 -0500', '20240601130000 -0500'));
    expect(programmes[0].start).toEqual(new Date('2024-06-01T17:00:00Z'));
  });

  it('handles bare UTC timestamps without offset', () => {
    const { programmes } = parseXmltv(makeProg('20240601120000', '20240601130000'));
    expect(programmes[0].start).toEqual(new Date('2024-06-01T12:00:00Z'));
  });
});

describe('parseXmltv — edge cases', () => {
  it('returns empty results for empty tv element', () => {
    const { channels, programmes } = parseXmltv('<tv></tv>');
    expect(channels).toHaveLength(0);
    expect(programmes).toHaveLength(0);
  });

  it('handles a single channel without crashing (no array coercion issue)', () => {
    const xml = `<tv>
      <channel id="only"><display-name>Only</display-name></channel>
    </tv>`;
    const { channels } = parseXmltv(xml);
    expect(channels).toHaveLength(1);
    expect(channels[0].id).toBe('only');
  });
});
