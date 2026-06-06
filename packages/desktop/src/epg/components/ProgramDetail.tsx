import React from 'react';
import type { EpgProgramme } from '@iptv-player/core';
import { formatTime } from '../types';

interface Props {
  program: EpgProgramme | null;
  onClose: () => void;
}

export function ProgramDetail({ program, onClose }: Props): React.ReactElement | null {
  if (!program) return null;
  return (
    <div
      style={{
        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.8)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        style={{ background: '#1e1e1e', borderRadius: 10, padding: 32, maxWidth: 520, width: '90%' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ color: '#fff', fontSize: 22, fontWeight: 700, marginBottom: 8 }}>{program.title}</div>
        <div style={{ color: '#aaa', fontSize: 14, marginBottom: 14 }}>
          {formatTime(program.start)} – {formatTime(program.stop)}
        </div>
        {program.description && (
          <div style={{ color: '#ccc', fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
            {program.description}
          </div>
        )}
        <button
          onClick={onClose}
          style={{ background: '#e50914', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 20px', cursor: 'pointer', fontSize: 14 }}
        >
          Close
        </button>
      </div>
    </div>
  );
}
