import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
	build: {
		outDir: 'out/webview',
		emptyOutDir: true,
		rollupOptions: {
			input: {
				modelHost: 'src/modelHost.ts',
			},
			output: {
				format: 'es',
				entryFileNames: '[name].js',
				chunkFileNames: 'assets/[name].js',
				assetFileNames: 'assets/[name].[ext]',
			},
		},
		sourcemap: true,
	},
	resolve: {
		alias: {
			'@': path.resolve(__dirname, './src'),
		},
	},
});

