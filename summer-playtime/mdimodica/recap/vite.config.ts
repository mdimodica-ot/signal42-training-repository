import {fileURLToPath, URL} from 'node:url';
import {defineConfig} from 'vite';
import vue from '@vitejs/plugin-vue';

const root = fileURLToPath(new URL('./web', import.meta.url));

export default defineConfig({
	root,
	plugins: [vue()],
	resolve: {
		alias: {
			'@': fileURLToPath(new URL('./web/src', import.meta.url)),
			// The HTTP contract, shared verbatim with the Express server.
			'@shared': fileURLToPath(new URL('./shared', import.meta.url)),
		},
	},
	build: {
		outDir: fileURLToPath(new URL('./web/dist', import.meta.url)),
		emptyOutDir: true,
		// A local tool nobody debugs from a CDN; skip the extra megabyte.
		sourcemap: false,
	},
	server: {
		port: 5173,
		// `npm run dev` serves the SPA from Vite and forwards the API to the
		// Express process started by `npm run dev:server`.
		proxy: {
			'/api': {target: 'http://localhost:4319', changeOrigin: true},
		},
	},
});
