/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IHiddenWebviewService = createDecorator<IHiddenWebviewService>('hiddenWebviewService');

/**
 * gitbbon custom: Hidden Webview Service
 *
 * 확장 프로그램이 숨겨진 webview에 HTML/JS를 주입하고 메시지를 주고받을 수 있는 서비스.
 * WebGPU 기반 모델 로딩 등 renderer process에서 실행해야 하는 작업에 사용.
 */
export interface IHiddenWebviewService {
	readonly _serviceBrand: undefined;

	/**
	 * Hidden webview가 준비되었는지 여부
	 */
	readonly isReady: boolean;

	/**
	 * Hidden webview 준비 완료 이벤트
	 */
	readonly onDidReady: Event<void>;

	/**
	 * 확장 프로그램의 HTML 콘텐츠를 hidden webview에 등록
	 * @param extensionId 확장 프로그램 ID
	 * @param html HTML 콘텐츠
	 */
	registerContent(extensionId: string, html: string): void;

	/**
	 * 확장 → Hidden Webview 메시지 전송
	 * @param extensionId 확장 프로그램 ID
	 * @param message 전송할 메시지
	 */
	postMessage(extensionId: string, message: unknown): void;

	/**
	 * Hidden Webview → 확장 메시지 수신
	 * @param extensionId 확장 프로그램 ID
	 * @param callback 메시지 수신 콜백
	 */
	onMessage(extensionId: string, callback: (message: unknown) => void): IDisposable;

	/**
	 * 확장의 hidden webview 콘텐츠 해제
	 * @param extensionId 확장 프로그램 ID
	 */
	unregisterContent(extensionId: string): void;
}
