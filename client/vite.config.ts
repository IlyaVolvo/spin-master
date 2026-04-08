import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const changesetId = (
    env.COMMIT_SHA ||
    env.VITE_CHANGESET_ID ||
    env.RENDER_GIT_COMMIT ||
    env.VERCEL_GIT_COMMIT_SHA ||
    env.SOURCE_VERSION ||
    'devbuild'
  ).slice(0, 7);

  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_CHANGESET_ID': JSON.stringify(changesetId),
    },
    server: {
      host: 'localhost', // Listen on localhost
      port: 3000,
      fs: {
        allow: ['..'],
      },
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          secure: false,
          ws: true, // Enable WebSocket proxying if needed
        },
      },
    },
    build: {
      sourcemap: true, // Enable source maps for debugging
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            // Split vendor libraries into separate chunks
            if (id.includes('node_modules')) {
              // Keep React and react-dom in vendor chunk (don't split separately)
              // This ensures React is always available when needed
              // Split large charting library (recharts) into its own chunk
              if (id.includes('recharts')) {
                return 'recharts';
              }
              // All other node_modules (including React) go to vendor
              return 'vendor';
            }
          },
        },
      },
      // Increase warning limit since we have code splitting in place
      chunkSizeWarningLimit: 600,
    },
    // Enable source maps for development debugging
    css: {
      devSourcemap: true,
    },
  };
});



