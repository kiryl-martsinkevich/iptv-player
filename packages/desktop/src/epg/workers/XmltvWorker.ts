/// <reference lib="webworker" />
import { parseXmltv } from '@iptv-player/core';

export interface WorkerInput {
  xmltvText: string;
}

self.onmessage = (e: MessageEvent<WorkerInput>) => {
  try {
    const result = parseXmltv(e.data.xmltvText);
    self.postMessage({ ok: true, result });
  } catch (err) {
    self.postMessage({ ok: false, error: err instanceof Error ? err.message : 'Parse error' });
  }
};
