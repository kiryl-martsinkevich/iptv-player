export interface XtreamCredentials {
  /** Base URL of the Xtream Codes server, e.g. "http://provider.example.com:8080" */
  host: string;
  username: string;
  password: string;
}

export interface XtreamCategory {
  categoryId: string;
  categoryName: string;
  parentId: number;
}

export interface XtreamStream {
  num: number;
  name: string;
  streamId: number;
  iconUrl: string;
  epgChannelId?: string;
  categoryId: string;
  /** HLS stream URL: {host}/live/{user}/{pass}/{streamId}.m3u8 */
  streamUrl: string;
}

export interface XtreamEpgEntry {
  id: string;
  /** Raw title value — some Xtream server forks base64-encode this field. */
  title: string;
  start: Date;
  stop: Date;
  description: string;
  channelId: string;
}

// Raw Xtream API response shapes (snake_case as returned by the server).
interface RawCategory {
  category_id: string;
  category_name: string;
  parent_id: number;
}

interface RawStream {
  num: number;
  name: string;
  stream_id: number;
  stream_icon: string;
  epg_channel_id?: string;
  category_id: string;
}

interface RawEpgEntry {
  id: string;
  title: string;
  start: string;  // "YYYY-MM-DD HH:mm:ss" UTC
  end: string;
  description: string;
  channel_id: string;
}

interface RawEpgResponse {
  epg_listings: RawEpgEntry[];
}

export class XtreamClient {
  private readonly apiBase: string;
  private readonly streamBase: string;

  constructor(creds: XtreamCredentials) {
    const host = creds.host.replace(/\/$/, '');
    this.apiBase = `${host}/player_api.php?username=${encodeURIComponent(creds.username)}&password=${encodeURIComponent(creds.password)}`;
    this.streamBase = `${host}/live/${creds.username}/${creds.password}`;
  }

  private async get<T>(action: string): Promise<T> {
    const res = await fetch(`${this.apiBase}&${action}`);
    if (!res.ok) throw new Error(`Xtream API error: ${res.status}`);
    return res.json() as Promise<T>;
  }

  async getLiveCategories(): Promise<XtreamCategory[]> {
    const raw = await this.get<RawCategory[]>('action=get_live_categories');
    return raw.map((c) => ({
      categoryId: String(c.category_id),
      categoryName: c.category_name,
      parentId: c.parent_id,
    }));
  }

  async getLiveStreams(categoryId?: string): Promise<XtreamStream[]> {
    const action = categoryId
      ? `action=get_live_streams&category_id=${categoryId}`
      : 'action=get_live_streams';
    const raw = await this.get<RawStream[]>(action);
    return raw.map((s) => ({
      num: s.num,
      name: s.name,
      streamId: s.stream_id,
      iconUrl: s.stream_icon,
      epgChannelId: s.epg_channel_id || undefined,
      categoryId: String(s.category_id),
      streamUrl: `${this.streamBase}/${s.stream_id}.m3u8`,
    }));
  }

  async getShortEpg(streamId: number, limit = 4): Promise<XtreamEpgEntry[]> {
    const raw = await this.get<RawEpgResponse>(
      `action=get_short_epg&stream_id=${streamId}&limit=${limit}`,
    );
    return raw.epg_listings.map((e) => ({
      id: String(e.id),
      title: e.title,
      start: new Date(`${e.start.replace(' ', 'T')}Z`),
      stop: new Date(`${e.end.replace(' ', 'T')}Z`),
      description: e.description,
      channelId: String(e.channel_id),
    }));
  }
}
