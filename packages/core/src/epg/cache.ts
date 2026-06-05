import type { EpgChannel, EpgProgramme, EpgData } from './types';

export interface SerializedProgramme {
  channelId: string;
  start: string;
  stop: string;
  title: string;
  description?: string;
}

export interface EpgSnapshot {
  fetchedAt: string;
  channels: EpgChannel[];
  programmes: SerializedProgramme[];
}

export function serializeEpg(data: EpgData, fetchedAt = new Date()): EpgSnapshot {
  return {
    fetchedAt: fetchedAt.toISOString(),
    channels: data.channels,
    programmes: data.programmes.map((p) => ({
      channelId: p.channelId,
      start: p.start.toISOString(),
      stop: p.stop.toISOString(),
      title: p.title,
      description: p.description,
    })),
  };
}

export function deserializeEpg(snapshot: EpgSnapshot): { result: EpgData; fetchedAt: Date } {
  const programmes: EpgProgramme[] = snapshot.programmes.map((p) => ({
    channelId: p.channelId,
    start: new Date(p.start),
    stop: new Date(p.stop),
    title: p.title,
    description: p.description,
  }));
  return {
    result: { channels: snapshot.channels, programmes },
    fetchedAt: new Date(snapshot.fetchedAt),
  };
}
