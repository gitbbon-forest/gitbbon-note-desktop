/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, toDisposable } from '../../../base/common/lifecycle.js';
import * as extHostProtocol from '../common/extHost.protocol.js';
import { IHiddenWebviewService } from '../../services/hiddenWebview/common/hiddenWebview.js';
import { ExtensionIdentifier } from '../../../platform/extensions/common/extensions.js';
import { IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';

export class MainThreadHiddenWebview extends Disposable implements extHostProtocol.MainThreadHiddenWebviewShape {

	private readonly _proxy: extHostProtocol.ExtHostHiddenWebviewShape;
	private readonly _hiddenWebviews = this._register(new DisposableMap<extHostProtocol.WebviewHandle>());

	constructor(
		context: IExtHostContext,
		@IHiddenWebviewService private readonly _hiddenWebviewService: IHiddenWebviewService,
	) {
		super();

		this._proxy = context.getProxy(extHostProtocol.ExtHostContext.ExtHostHiddenWebview);
	}

	public $createHiddenWebview(
		handle: extHostProtocol.WebviewHandle,
		extensionId: ExtensionIdentifier,
		_options: extHostProtocol.IWebviewContentOptions
	): void {
		// Use handle as the identifier (matches registerContent which also uses handle)
		const messageListener = this._hiddenWebviewService.onMessage(handle, (message) => {
			this._proxy.$onMessage(handle, message);
		});

		this._hiddenWebviews.set(handle, toDisposable(() => {
			this._hiddenWebviewService.unregisterContent(handle);
			messageListener.dispose();
		}));
	}

	public $setHtml(handle: extHostProtocol.WebviewHandle, value: string): void {
		// Find the extension ID from handle (handle format: hidden-webview-{id}-{randomStr})
		const extensionIdMatch = handle.match(/^hidden-webview-(.+)-[a-z0-9]+$/);
		if (!extensionIdMatch) {
			console.warn(`[MainThreadHiddenWebview] Invalid handle format: ${handle}`);
			return;
		}

		// For simplicity, use the handle as the extension ID directly
		// The actual extensionId should be stored when creating the webview
		this._hiddenWebviewService.registerContent(handle, value);
	}

	public async $postMessage(handle: extHostProtocol.WebviewHandle, value: unknown): Promise<boolean> {
		try {
			this._hiddenWebviewService.postMessage(handle, value);
			return true;
		} catch (e) {
			console.error('[MainThreadHiddenWebview] Failed to post message:', e);
			return false;
		}
	}

	public $disposeHiddenWebview(handle: extHostProtocol.WebviewHandle): void {
		this._hiddenWebviews.deleteAndDispose(handle);
	}
}
