import { defineConfig } from 'vite';

export default defineConfig({
    base: './',
    resolve: {
        dedupe: ['phaser']
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks: {
                    phaser: ['phaser']
                }
            }
        },
    },
    server: {
        port: 8080,
        host: true,
        allowedHosts: ['minium.dev.fybtech.xyz', 'dev-games.dijoker.com']
    }
});
