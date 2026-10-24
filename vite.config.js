import { defineConfig, loadEnv } from 'vite';

export default defineConfig(() => {
  const serverEnv = loadEnv('development', 'server', 'PORT');
  return {
    server: { host: '127.0.0.1', proxy: { '/api': `http://127.0.0.1:${process.env.PORT || serverEnv.PORT || 3001}` } },
    preview: { host: '127.0.0.1', proxy: { '/api': `http://127.0.0.1:${process.env.PORT || serverEnv.PORT || 3001}` } },
  };
});
