/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTrustedTypesPolicy } from '../../../../base/browser/trustedTypes.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IHiddenWebviewService } from '../common/hiddenWebview.js';

/**
 * gitbbon custom: Hidden Webview Service Implementation
 *
 * DOM에 숨겨진 iframe을 생성하여 확장 프로그램이 WebGPU 기반 모델 등을 실행할 수 있게 함.
 */
export class HiddenWebviewService extends Disposable implements IHiddenWebviewService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidReady = this._register(new Emitter<void>());
	readonly onDidReady: Event<void> = this._onDidReady.event;

	private _isReady = false;
	get isReady(): boolean { return this._isReady; }

	private readonly _container: HTMLDivElement;
	private readonly _iframes = new Map<string, HTMLIFrameElement>();
	private readonly _messageListeners = new Map<string, Set<(message: unknown) => void>>();

	constructor(
		@ILogService private readonly logService: ILogService,
	) {
		super();

		// 숨겨진 컨테이너 생성
		this._container = document.createElement('div');
		this._container.id = 'gitbbon-hidden-webview-container';
		this._container.style.cssText = 'position: absolute; width: 0; height: 0; overflow: hidden; visibility: hidden;';
		document.body.appendChild(this._container);

		this._isReady = true;
		this._onDidReady.fire();

		this.logService.info('[HiddenWebviewService] Initialized');
	}

	registerContent(extensionId: string, html: string): void {
		this.logService.info(`[HiddenWebviewService] Registering content for: ${extensionId}`);

		// 기존 iframe이 있으면 제거
		if (this._iframes.has(extensionId)) {
			this.unregisterContent(extensionId);
		}

		// 새 iframe 생성
		const iframe = document.createElement('iframe');
		iframe.id = `hidden-webview-${extensionId}`;
		iframe.style.cssText = 'width: 1px; height: 1px; border: none;';
		iframe.sandbox.add('allow-scripts', 'allow-same-origin');

		// 메시지 수신 핸들러
		const messageHandler = (event: MessageEvent) => {
			// iframe에서 온 메시지인지 확인
			if (event.source !== iframe.contentWindow) {
				return;
			}

			this.logService.info(`[HiddenWebviewService] Message received from ${extensionId}:`, event.data?.type);

			const listeners = this._messageListeners.get(extensionId);
			if (listeners) {
				for (const callback of listeners) {
					try {
						callback(event.data);
					} catch (e) {
						this.logService.error(`[HiddenWebviewService] Error in message callback for ${extensionId}:`, e);
					}
				}
			} else {
				this.logService.warn(`[HiddenWebviewService] No listeners for ${extensionId}`);
			}
		};
		window.addEventListener('message', messageHandler);

		// iframe에 HTML 주입
		this._container.appendChild(iframe);

		// HTML 콘텐츠 설정 (postMessage 브릿지 포함)
		// TrustedTypes 정책을 사용하여 TrustedHTML 생성
		const wrappedHtml = this._wrapHtmlWithBridge(html);

		this._iframes.set(extensionId, iframe);

		// TrustedTypes 정책 생성
		const ttPolicy = createTrustedTypesPolicy('hiddenWebview', { createHTML: value => value });

		// iframe 로드 후 콘텐츠 주입
		setTimeout(() => {
			try {
				if (iframe.contentDocument) {
					iframe.contentDocument.open();
					// TrustedHTML 사용하여 document.write 호출
					if (ttPolicy) {
						// TrustedHTML을 문자열로 캐스팅 (런타임에서는 TrustedHTML 허용)
						iframe.contentDocument.write(ttPolicy.createHTML(wrappedHtml) as unknown as string);
					} else {
						// TrustedTypes가 지원되지 않는 환경에서는 일반 문자열 사용
						iframe.contentDocument.write(wrappedHtml);
					}
					iframe.contentDocument.close();
					this.logService.info(`[HiddenWebviewService] Content written for: ${extensionId}`);
				} else {
					this.logService.warn(`[HiddenWebviewService] No contentDocument for: ${extensionId}`);
				}
			} catch (e) {
				this.logService.error(`[HiddenWebviewService] Failed to write content for ${extensionId}:`, e);
			}
		}, 0);

		// cleanup 등록
		this._register(toDisposable(() => {
			window.removeEventListener('message', messageHandler);
		}));

		this.logService.info(`[HiddenWebviewService] Content registered for: ${extensionId}`);
	}

	postMessage(extensionId: string, message: unknown): void {
		const iframe = this._iframes.get(extensionId);
		if (!iframe?.contentWindow) {
			this.logService.warn(`[HiddenWebviewService] No iframe found for: ${extensionId}`);
			return;
		}

		iframe.contentWindow.postMessage(message, '*');
	}

	onMessage(extensionId: string, callback: (message: unknown) => void): IDisposable {
		let listeners = this._messageListeners.get(extensionId);
		if (!listeners) {
			listeners = new Set();
			this._messageListeners.set(extensionId, listeners);
		}

		listeners.add(callback);

		return toDisposable(() => {
			listeners?.delete(callback);
			if (listeners?.size === 0) {
				this._messageListeners.delete(extensionId);
			}
		});
	}

	unregisterContent(extensionId: string): void {
		const iframe = this._iframes.get(extensionId);
		if (iframe) {
			iframe.remove();
			this._iframes.delete(extensionId);
			this._messageListeners.delete(extensionId);
			this.logService.info(`[HiddenWebviewService] Content unregistered for: ${extensionId}`);
		}
	}

	/**
	 * HTML에 postMessage 브릿지 코드 추가
	 */
	private _wrapHtmlWithBridge(html: string): string {
		const bridgeScript = `
<script>
// gitbbon Hidden Webview Bridge
window.gitbbonBridge = {
	postMessage: function(message) {
		window.parent.postMessage(message, '*');
	}
};

// Extension Host로부터 메시지 수신
window.addEventListener('message', function(event) {
	if (event.source === window.parent) {
		window.dispatchEvent(new CustomEvent('gitbbon-message', { detail: event.data }));
	}
});

console.log('[HiddenWebview] Bridge initialized');
</script>
`;
		// <head> 태그 뒤에 브릿지 스크립트 삽입
		if (html.includes('<head>')) {
			return html.replace('<head>', '<head>' + bridgeScript);
		} else if (html.includes('<html>')) {
			return html.replace('<html>', '<html><head>' + bridgeScript + '</head>');
		} else {
			return bridgeScript + html;
		}
	}

	override dispose(): void {
		// 모든 iframe 제거
		for (const extensionId of this._iframes.keys()) {
			this.unregisterContent(extensionId);
		}
		this._container.remove();
		super.dispose();
	}
}

registerSingleton(IHiddenWebviewService, HiddenWebviewService, InstantiationType.Eager);
