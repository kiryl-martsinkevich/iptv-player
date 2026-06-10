import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import type { IncomingMessage, ServerResponse } from 'node:http';

// Dev-only CORS proxy: GET /__proxy__/<url> → forwards to <url>.
// Tauri's native shell bypasses CORS entirely; this proxy exists only for plain-browser dev.
//
// Hardening (this dev server is reachable by every page open in the browser):
//  - Reject requests carrying an Origin header: the app itself calls the proxy
//    same-origin via GET, which sends no Origin; any cross-origin (drive-by) fetch does.
//  - Reject non-localhost Host headers (DNS-rebinding guard).
//  - Forward only http:/https: targets.
function corsProxyPlugin() {
  return {
    name: 'cors-proxy',
    configureServer(server: { middlewares: { use: (path: string, fn: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void } }) {
      server.middlewares.use('/__proxy__', async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const target = req.url?.slice(1); // strip leading /
        if (!target) return next();

        if (req.headers.origin) {
          res.statusCode = 403;
          return res.end('Cross-origin use of the dev proxy is not allowed');
        }
        const host = req.headers.host ?? '';
        if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)) {
          res.statusCode = 403;
          return res.end('Dev proxy is localhost-only');
        }

        let parsed: URL;
        try {
          parsed = new URL(target);
        } catch {
          res.statusCode = 400;
          return res.end('Invalid target URL');
        }
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          res.statusCode = 400;
          return res.end('Only http(s) targets are allowed');
        }

        try {
          const upstream = await fetch(parsed, { headers: { 'User-Agent': 'iptv-player-dev' } });
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
