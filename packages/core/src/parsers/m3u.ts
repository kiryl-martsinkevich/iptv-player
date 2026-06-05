export interface M3uChannel {
  name: string;
  url: string;
  tvgId?: string;
  tvgName?: string;
  tvgLogo?: string;
  groupTitle?: string;
}

export function parseM3u(content: string): M3uChannel[] {
  const channels: M3uChannel[] = [];
  const lines = content.split(/\r?\n/);
  let pending: Omit<M3uChannel, 'url'> | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#EXTM3U')) continue;

    if (trimmed.startsWith('#EXTINF:')) {
      const commaIdx = trimmed.indexOf(',');
      const name = commaIdx >= 0 ? trimmed.slice(commaIdx + 1).trim() : '';
      const attrStr = commaIdx >= 0 ? trimmed.slice(0, commaIdx) : trimmed;

      const attrs: Record<string, string> = {};
      const re = /(\S+?)="([^"]*)"/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(attrStr)) !== null) {
        attrs[m[1]] = m[2];
      }

      pending = {
        name,
        tvgId: attrs['tvg-id'] || undefined,
        tvgName: attrs['tvg-name'] || undefined,
        tvgLogo: attrs['tvg-logo'] || undefined,
        groupTitle: attrs['group-title'] || undefined,
      };
      continue;
    }

    if (trimmed.startsWith('#')) continue;

    if (pending !== null) {
      channels.push({ ...pending, url: trimmed });
      pending = null;
    }
  }

  return channels;
}
