/* eslint-disable @typescript-eslint/no-explicit-any */
declare function acquireVsCodeApi(): {
	postMessage(message: any): void;
	getState(): any;
	setState(state: any): void;
};

declare module '*.css' {
	const content: { [className: string]: string };
	export default content;
}
