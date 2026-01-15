import * as vscode from 'vscode';

class LogService {
	private outputChannel: vscode.LogOutputChannel | undefined;

	init() {
		this.outputChannel = vscode.window.createOutputChannel('Gitbbon Chat', { log: true });
	}

	trace(message: string, ...args: unknown[]): void {
		this.outputChannel?.trace(message, ...args);
	}

	debug(message: string, ...args: unknown[]): void {
		this.outputChannel?.debug(message, ...args);
	}

	info(message: string, ...args: unknown[]): void {
		this.outputChannel?.info(message, ...args);
	}

	warn(message: string, ...args: unknown[]): void {
		this.outputChannel?.warn(message, ...args);
	}

	error(message: string | Error, ...args: unknown[]): void {
		if (message instanceof Error) {
			this.outputChannel?.error(message.message, ...args);
			if (message.stack) {
				this.outputChannel?.debug(message.stack);
			}
		} else {
			this.outputChannel?.error(message, ...args);
		}
	}

	show(): void {
		this.outputChannel?.show();
	}

	dispose(): void {
		this.outputChannel?.dispose();
	}
}

export const logService = new LogService();
