import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Desktop UI components can import from 'react-native'; they render as HTML via react-native-web.
      'react-native': 'react-native-web',
    },
  },
});
