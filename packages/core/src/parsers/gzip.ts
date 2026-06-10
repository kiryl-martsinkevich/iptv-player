import { ungzip } from 'pako';

/** True when the buffer starts with the gzip magic bytes (0x1f 0x8b). */
export function isGzip(bytes: Uint8Array): boolean {
  return bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

/**
 * Decode a fetched body to text, transparently gunzipping `.gz` payloads.
 * (Bodies sent with Content-Encoding: gzip are already decompressed by fetch;
 * this handles gzip *files* served as application/gzip.)
 *
 * Uses pako (pure JS) so the same code path runs in the browser, Node/Jest,
 * and React Native — Hermes has no TextDecoder, so plain text falls back to a
 * small UTF-8 decoder when needed.
 */
export function bytesToText(bytes: Uint8Array): string {
  if (isGzip(bytes)) {
    return ungzip(bytes, { to: 'string' });
  }
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder('utf-8').decode(bytes);
  }
  return utf8Decode(bytes);
}

// Minimal UTF-8 decoder for environments without TextDecoder (Hermes).
function utf8Decode(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i++];
    let cp: number;
    if (b0 < 0x80) {
      cp = b0;
    } else if (b0 < 0xe0) {
      cp = ((b0 & 0x1f) << 6) | (bytes[i++] & 0x3f);
    } else if (b0 < 0xf0) {
      cp = ((b0 & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
    } else {
      cp =
        ((b0 & 0x07) << 18) |
        ((bytes[i++] & 0x3f) << 12) |
        ((bytes[i++] & 0x3f) << 6) |
        (bytes[i++] & 0x3f);
    }
    if (cp > 0xffff) {
      cp -= 0x10000;
      out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
    } else {
      out += String.fromCharCode(cp);
    }
  }
  return out;
}
