import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
	plugins: [react()],
	build: {
		outDir: 'out/webview',
		emptyOutDir: true,
		rollupOptions: {
			input: {
				index: 'src/webview/index.tsx',
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
	worker: {
		format: 'iife',
		plugins: () => [react()],
	},
	resolve: {
		alias: {
			'@': path.resolve(__dirname, './src'),
		},
	},
});

