export interface EpgChannel {
  id: string;
  displayName: string;
  iconUrl?: string;
}

export interface EpgProgramme {
  channelId: string;
  start: Date;
  stop: Date;
  title: string;
  description?: string;
}

export interface EpgData {
  channels: EpgChannel[];
  programmes: EpgProgramme[];
}

export interface NowNext {
  now?: EpgProgramme;
  next?: EpgProgramme;
}

export function getNowNext(
  programmes: ReadonlyArray<EpgProgramme>,
  channelId: string,
  now = new Date(),
): NowNext {
  const sorted = programmes
    .filter((p) => p.channelId === channelId)
    .slice()
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const nowProg = sorted.find((p) => p.start <= now && p.stop > now);
  const nextProg = nowProg
    ? sorted.find((p) => p.start >= nowProg.stop)
    : sorted.find((p) => p.start > now);

  return { now: nowProg, next: nextProg };
}
