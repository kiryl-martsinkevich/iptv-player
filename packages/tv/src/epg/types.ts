import type { EpgProgramme, M3uChannel, NowNext } from '@iptv-player/core';

export interface ChannelEntry {
  m3uChannel: M3uChannel;
  epgChannelId: string | undefined;
  nowNext: NowNext;
  programs: EpgProgramme[]; // pre-filtered for this channel, sorted by start
}

export const PX_PER_MIN = 8;
export const GRID_HOURS = 2;

export function getGridWindow(): { start: Date; end: Date } {
  const start = new Date();
  start.setMinutes(0, 0, 0); // floor to current hour
  const end = new Date(start.getTime() + GRID_HOURS * 60 * 60 * 1000);
  return { start, end };
}

export function cellLeft(progStart: Date, windowStart: Date): number {
  return Math.max(0, (progStart.getTime() - windowStart.getTime()) / 60000 * PX_PER_MIN);
}

export function cellWidth(progStart: Date, progStop: Date, windowStart: Date, windowEnd: Date): number {
  const cs = Math.max(progStart.getTime(), windowStart.getTime());
  const ce = Math.min(progStop.getTime(), windowEnd.getTime());
  return Math.max(0, (ce - cs) / 60000 * PX_PER_MIN);
}

export function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
