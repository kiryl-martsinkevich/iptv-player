import {
  XtreamClient,
  XtreamCredentials,
  XtreamCategory,
  XtreamStream,
  XtreamEpgEntry,
} from '../../src/parsers/xtream';

const CREDS: XtreamCredentials = {
  host: 'http://provider.test:8080',
  username: 'testuser',
  password: 'testpass',
};

const mockFetch = jest.fn<Promise<Response>, [string]>();
global.fetch = mockFetch as unknown as typeof fetch;

function mockJson(data: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 401,
    json: async () => data,
  } as unknown as Response;
}

describe('XtreamClient', () => {
  beforeEach(() => mockFetch.mockClear());

  describe('getLiveCategories', () => {
    it('fetches the correct URL and maps category fields', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJson([
          { category_id: '1', category_name: 'Sports', parent_id: 0 },
          { category_id: '2', category_name: 'News', parent_id: 0 },
        ]),
      );

      const client = new XtreamClient(CREDS);
      const categories = await client.getLiveCategories();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://provider.test:8080/player_api.php?username=testuser&password=testpass&action=get_live_categories',
      );
      expect(categories).toHaveLength(2);
      expect(categories[0]).toEqual<XtreamCategory>({
        categoryId: '1',
        categoryName: 'Sports',
        parentId: 0,
      });
    });

    it('throws with the HTTP status on non-OK response', async () => {
      mockFetch.mockResolvedValueOnce(mockJson(null, false));
      const client = new XtreamClient(CREDS);
      await expect(client.getLiveCategories()).rejects.toThrow('401');
    });
  });

  describe('getLiveStreams', () => {
    it('fetches all streams and computes stream URLs', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJson([
          {
            num: 1,
            name: 'ESPN',
            stream_id: 123,
            stream_icon: 'http://logo.png',
            epg_channel_id: 'espn.us',
            category_id: '1',
          },
        ]),
      );

      const client = new XtreamClient(CREDS);
      const streams = await client.getLiveStreams();

      expect(streams).toHaveLength(1);
      expect(streams[0]).toEqual<XtreamStream>({
        num: 1,
        name: 'ESPN',
        streamId: 123,
        iconUrl: 'http://logo.png',
        epgChannelId: 'espn.us',
        categoryId: '1',
        streamUrl: 'http://provider.test:8080/live/testuser/testpass/123.m3u8',
      });
    });

    it('appends category_id to the URL when provided', async () => {
      mockFetch.mockResolvedValueOnce(mockJson([]));
      const client = new XtreamClient(CREDS);
      await client.getLiveStreams('42');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://provider.test:8080/player_api.php?username=testuser&password=testpass&action=get_live_streams&category_id=42',
      );
    });

    it('leaves epgChannelId undefined when stream has no epg_channel_id', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJson([{ num: 2, name: 'BBC', stream_id: 456, stream_icon: '', category_id: '2' }]),
      );
      const client = new XtreamClient(CREDS);
      const [stream] = await client.getLiveStreams();
      expect(stream.epgChannelId).toBeUndefined();
    });
  });

  describe('getShortEpg', () => {
    it('fetches EPG listings with correct URL and maps timestamps', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJson({
          epg_listings: [
            {
              id: '999',
              epg_id: 'espn.us',
              title: 'SportsCenter',
              lang: 'en',
              start: '2024-06-01 12:00:00',
              end: '2024-06-01 13:00:00',
              description: 'Daily sports highlights.',
              channel_id: '123',
              start_timestamp: 1717243200,
              stop_timestamp: 1717246800,
            },
          ],
        }),
      );

      const client = new XtreamClient(CREDS);
      const entries = await client.getShortEpg(123, 4);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://provider.test:8080/player_api.php?username=testuser&password=testpass&action=get_short_epg&stream_id=123&limit=4',
      );
      expect(entries).toHaveLength(1);
      expect(entries[0]).toEqual<XtreamEpgEntry>({
        id: '999',
        title: 'SportsCenter',
        start: new Date('2024-06-01T12:00:00Z'),
        stop: new Date('2024-06-01T13:00:00Z'),
        description: 'Daily sports highlights.',
        channelId: '123',
      });
    });

    it('uses limit=4 by default', async () => {
      mockFetch.mockResolvedValueOnce(mockJson({ epg_listings: [] }));
      const client = new XtreamClient(CREDS);
      await client.getShortEpg(123);
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('limit=4'));
    });
  });

  describe('URL encoding', () => {
    const SPECIAL_CREDS = {
      host: 'http://provider.test:8080',
      username: 'user/name',
      password: 'p&ss?word#1',
    };

    it('encodes credentials in the stream URL path', async () => {
      mockFetch.mockResolvedValueOnce(mockJson([
        { num: 1, name: 'A', stream_id: 7, stream_icon: '', category_id: '1' },
      ]));
      const client = new XtreamClient(SPECIAL_CREDS);
      const [stream] = await client.getLiveStreams();
      expect(stream.streamUrl).toBe(
        'http://provider.test:8080/live/user%2Fname/p%26ss%3Fword%231/7.m3u8',
      );
    });

    it('encodes categoryId in the query string', async () => {
      mockFetch.mockResolvedValueOnce(mockJson([]));
      const client = new XtreamClient(SPECIAL_CREDS);
      await client.getLiveStreams('4&action=server_info');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('category_id=4%26action%3Dserver_info'),
      );
    });
  });
});
