import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
	plugins: [react()],
	build: {
		outDir: 'out/webview',
		emptyOutDir: true,
		rollupOptions: {
			input: 'src/webview/index.tsx',
			output: {
				format: 'iife',
				entryFileNames: 'index.js',
				chunkFileNames: 'assets/[name].js',
				assetFileNames: 'assets/[name].[ext]',
				inlineDynamicImports: true,
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

