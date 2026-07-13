import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const pwaHead = {
  name: 'azim-fit-pwa-head',
  transformIndexHtml() {
    return [
      {
        tag: 'link',
        attrs: {
          rel: 'apple-touch-icon',
          href: '/icons/apple-touch-icon.png',
          sizes: '180x180',
        },
        injectTo: 'head',
      },
      {
        tag: 'meta',
        attrs: { name: 'apple-mobile-web-app-capable', content: 'yes' },
        injectTo: 'head',
      },
      {
        tag: 'meta',
        attrs: { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
        injectTo: 'head',
      },
    ];
  },
};

export default defineConfig({
  plugins: [
    react(),
    pwaHead,
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectRegister: false,
      registerType: 'prompt',
      includeManifestIcons: false,
      injectManifest: {
        rollupFormat: 'iife',
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      manifest: {
        id: '/',
        name: 'AZIM.FIT — локальный фитнес-трекер',
        short_name: 'AZIM.FIT',
        description: 'Личный local-first трекер тренировок, прогресса и отдыха.',
        lang: 'ru',
        start_url: '/today',
        scope: '/',
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
        background_color: '#f3f2ee',
        theme_color: '#121d19',
        categories: ['fitness', 'health', 'productivity'],
        icons: [
          {
            src: '/icons/pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/pwa-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        shortcuts: [
          {
            name: 'Сегодня',
            short_name: 'Сегодня',
            description: 'Открыть тренировки на сегодня',
            url: '/today',
            icons: [{ src: '/icons/pwa-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Мой план',
            short_name: 'План',
            description: 'Открыть календарь тренировок',
            url: '/plan',
            icons: [{ src: '/icons/pwa-192.png', sizes: '192x192', type: 'image/png' }],
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  test: {
    include: ['src/**/*.{test,spec}.{js,jsx}'],
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    css: true,
    restoreMocks: true,
  },
});
