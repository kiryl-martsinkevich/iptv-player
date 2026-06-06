import React, { useState } from 'react';
import type { EpgProgramme } from '@iptv-player/core';
import type { ChannelEntry } from '../types';
import { cellLeft, cellWidth, formatTime, getGridWindow, GRID_HOURS, PX_PER_MIN } from '../types';
import { ProgramDetail } from './ProgramDetail';

interface Props {
  entries: ChannelEntry[];
  selectedUrl?: string | null;
}

const TRACK_W = GRID_HOURS * 60 * PX_PER_MIN; // 960
const ROW_H = 56;
const LABEL_W = 140;

export function EpgGrid({ entries, selectedUrl }: Props): React.ReactElement {
  const [selected, setSelected] = useState<EpgProgramme | null>(null);
  const { start: windowStart, end: windowEnd } = getGridWindow();
  const now = new Date();
  const nowLeft = LABEL_W + cellLeft(now, windowStart);

  // When a channel is selected on the left, show only that channel's timeline
  const visibleEntries = selectedUrl
    ? entries.filter(e => e.m3uChannel.url === selectedUrl)
    : entries;

  return (
    <div style={{ overflowX: 'auto', position: 'relative', flex: 1 }}>
      {/* Time header */}
      <div style={{ display: 'flex', borderBottom: '1px solid #333', position: 'sticky', top: 0, background: '#111', zIndex: 10 }}>
        <div style={{ width: LABEL_W, flexShrink: 0 }} />
        {Array.from({ length: GRID_HOURS * 2 }).map((_, i) => {
          const t = new Date(windowStart.getTime() + i * 30 * 60 * 1000);
          return (
            <div key={i} style={{ width: 30 * PX_PER_MIN, flexShrink: 0, borderLeft: '1px solid #222', padding: '4px 4px' }}>
              <span style={{ color: '#777', fontSize: 11 }}>{formatTime(t)}</span>
            </div>
          );
        })}
      </div>

      {/* Rows */}
      <div style={{ position: 'relative' }}>
        {/* Now indicator */}
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: nowLeft, width: 2, background: '#e50914', zIndex: 5, pointerEvents: 'none' }} />

        {visibleEntries.map(entry => {
          const visible = entry.programs.filter(
            p => p.stop.getTime() > windowStart.getTime() && p.start.getTime() < windowEnd.getTime(),
          );
          return (
            <div key={entry.m3uChannel.url} style={{ display: 'flex', height: ROW_H, borderBottom: '1px solid #222' }}>
              {/* Channel label */}
              <div style={{ width: LABEL_W, flexShrink: 0, background: '#1a1a1a', padding: '0 8px', display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
                <span style={{ color: '#ccc', fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {entry.m3uChannel.name}
                </span>
              </div>
              {/* Program track */}
              <div style={{ width: TRACK_W, flexShrink: 0, position: 'relative', height: ROW_H }}>
                {visible.map(prog => {
                  const left = cellLeft(prog.start, windowStart);
                  const width = cellWidth(prog.start, prog.stop, windowStart, windowEnd);
                  const isCurrent = prog.start <= now && prog.stop > now;
                  return (
                    <div
                      key={prog.start.toISOString()}
                      onClick={() => setSelected(prog)}
                      style={{
                        position: 'absolute',
                        left,
                        width: Math.max(0, width - 2),
                        top: 4,
                        height: ROW_H - 8,
                        background: isCurrent ? '#1d3a1d' : '#2a2a2a',
                        borderLeft: `3px solid ${isCurrent ? '#4caf50' : '#444'}`,
                        borderRadius: 3,
                        padding: '2px 4px',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        boxSizing: 'border-box',
                      }}
                    >
                      <span style={{ color: '#fff', fontSize: 11, whiteSpace: 'nowrap' }}>{prog.title}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {selected && <ProgramDetail program={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
