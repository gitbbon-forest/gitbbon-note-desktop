// @ts-check
import tseslint from 'typescript-eslint';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default tseslint.config(
	{
		languageOptions: {
			parserOptions: {
				tsconfigRootDir: __dirname
			}
		}
	},
	...tseslint.configs.recommended,
	{
		files: ['src/**/*.ts'],
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: {
				project: './tsconfig.json',
				tsconfigRootDir: __dirname
			}
		},
		rules: {
			'header/header': 'off'
		}
	},
	{
		files: ['vite.config.ts'],
		languageOptions: {
			parserOptions: {
				tsconfigRootDir: __dirname
			}
		}
	}
);
