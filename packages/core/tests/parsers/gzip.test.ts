import { gzipSync } from 'node:zlib';
import { bytesToText, isGzip } from '../../src/parsers/gzip';

describe('isGzip', () => {
  it('detects the gzip magic bytes', () => {
    expect(isGzip(new Uint8Array(gzipSync(Buffer.from('hello'))))).toBe(true);
  });

  it('rejects plain text', () => {
    expect(isGzip(new TextEncoder().encode('#EXTM3U'))).toBe(false);
  });

  it('rejects buffers shorter than the magic', () => {
    expect(isGzip(new Uint8Array([0x1f]))).toBe(false);
  });
});

describe('bytesToText', () => {
  it('decompresses gzipped UTF-8 content', () => {
    const original = '#EXTM3U\n#EXTINF:-1,Канал Один 📺\nhttp://example.com/1.m3u8';
    const gz = new Uint8Array(gzipSync(Buffer.from(original, 'utf8')));
    expect(bytesToText(gz)).toBe(original);
  });

  it('decodes plain UTF-8 content unchanged', () => {
    const original = '<tv><channel id="x"><display-name>Téle</display-name></channel></tv>';
    expect(bytesToText(new TextEncoder().encode(original))).toBe(original);
  });
});
