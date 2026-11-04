import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: '保存リスト検索マップ',
        short_name: '保存マップ',
        description: 'Googleマップの保存リストを地図とリストで横断検索',
        lang: 'ja',
        theme_color: '#4a6fa5',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            // 場所一覧はネットワーク優先・失敗時はキャッシュ（Phase3のオフライン布石）
            urlPattern: ({ url }) => url.pathname.endsWith('/places'),
            handler: 'NetworkFirst',
            options: { cacheName: 'places-api', networkTimeoutSeconds: 4 },
          },
        ],
      },
    }),
  ],
});
