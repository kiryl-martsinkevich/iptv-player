// Parsers
export type { M3uChannel } from './parsers/m3u';
export { parseM3u } from './parsers/m3u';

export type { XmltvChannel, XmltvProgramme, XmltvResult } from './parsers/xmltv';
export { parseXmltv } from './parsers/xmltv';

export type { XtreamCredentials, XtreamCategory, XtreamStream, XtreamEpgEntry } from './parsers/xtream';
export { XtreamClient } from './parsers/xtream';

// EPG
export type { EpgChannel, EpgProgramme, EpgData, NowNext } from './epg/types';
export { getNowNext } from './epg/types';

export { buildEpgMapping } from './epg/mapper';

export { matchFavouriteUrls, findFavouriteIndex } from './epg/favouriteMatcher';

export type { EpgSnapshot, SerializedProgramme } from './epg/cache';
export { serializeEpg, deserializeEpg } from './epg/cache';

// Playback
export type { PlaybackStatus, PlaybackController } from './playback/controller';

export type {
  ExoBufferParams,
  AvPlayerBufferParams,
  HlsBufferParams,
  CustomBufferParams,
  BufferProfile,
  Platform,
} from './playback/bufferProfile';
export { toPlatformParams } from './playback/bufferProfile';

export type { ResilienceConfig } from './playback/resilienceConfig';
export { getRetryDelay } from './playback/resilienceConfig';

// Settings
export type { AppSettings } from './settings/appSettings';
export { DEFAULT_SETTINGS, mergeSettings } from './settings/appSettings';
