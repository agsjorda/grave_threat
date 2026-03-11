import { defineConfig } from 'vite';
import viteCompression from 'vite-plugin-compression2';

const phasermsg = () => {
    return {
        name: 'phasermsg',
        buildStart() {
            process.stdout.write(`Building for production...\n`);
        },
        buildEnd() {
            const line = "---------------------------------------------------------";
            const msg = `❤️❤️❤️ Tell us about your game! - games@phaser.io ❤️❤️❤️`;
            process.stdout.write(`${line}\n${msg}\n${line}\n`);
            
            process.stdout.write(`✨ Done ✨\n`);
        }
    }
}   

export default defineConfig({
    base: './',
    logLevel: 'warning',
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
        minify: 'terser',
        terserOptions: {
            compress: {
                passes: 2
            },
            mangle: true,
            format: {
                comments: false
            }
        }
    },
    server: {
        port: 8080,
        host: true,
        allowedHosts: ['minium.dev.fybtech.xyz', 'dev-games.dijoker.com']
    },
    plugins: [
        phasermsg(),
        // Precompress text assets to Brotli
        viteCompression({
            algorithm: 'brotliCompress',
            ext: '.br',
            deleteOriginalAssets: false,
            threshold: 1024,
            filter: (file) => /\.(js|css|html|svg|json|ttf|woff2?)$/i.test(file)
        }),
        // Also generate gzip as fallback
        viteCompression({
            algorithm: 'gzip',
            ext: '.gz',
            deleteOriginalAssets: false,
            threshold: 1024,
            filter: (file) => /\.(js|css|html|svg|json|ttf|woff2?)$/i.test(file)
        })
    ]
});
