import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import type { IncomingMessage, ServerResponse } from 'node:http';

// Dev-only CORS proxy: GET /__proxy__/<url> → forwards to <url> with CORS headers.
// Tauri native shell bypasses CORS entirely; this proxy is only needed for plain-browser dev.
function corsProxyPlugin() {
  return {
    name: 'cors-proxy',
    configureServer(server: { middlewares: { use: (path: string, fn: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void } }) {
      server.middlewares.use('/__proxy__', async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const target = req.url?.slice(1); // strip leading /
        if (!target) return next();
        try {
          const upstream = await fetch(target, { headers: { 'User-Agent': 'iptv-player-dev' } });
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'text/plain');
          res.statusCode = upstream.status;
          const buf = await upstream.arrayBuffer();
          res.end(Buffer.from(buf));
        } catch {
          res.statusCode = 502;
          res.end('Proxy error');
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), corsProxyPlugin()],
  resolve: {
    alias: {
      // Desktop UI components can import from 'react-native'; they render as HTML via react-native-web.
      'react-native': 'react-native-web',
    },
  },
});
