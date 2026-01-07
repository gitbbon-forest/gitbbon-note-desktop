/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import type * as vscode from 'vscode';
import * as extHostProtocol from './extHost.protocol.js';

/* eslint-disable local/code-no-native-private */

export class ExtHostHiddenWebview extends Disposable implements vscode.HiddenWebview {

	readonly #handle: extHostProtocol.WebviewHandle;
	readonly #proxy: extHostProtocol.MainThreadHiddenWebviewShape;

	readonly #id: string;
	#html: string = '';
	#isDisposed = false;

	constructor(
		handle: extHostProtocol.WebviewHandle,
		proxy: extHostProtocol.MainThreadHiddenWebviewShape,
		id: string,
	) {
		super();
		this.#handle = handle;
		this.#proxy = proxy;
		this.#id = id;
	}

	public override dispose() {
		if (this.#isDisposed) {
			return;
		}

		this.#isDisposed = true;
		this.#onDidDispose.fire();

		this.#proxy.$disposeHiddenWebview(this.#handle);

		super.dispose();
	}

	readonly #onDidDispose = this._register(new Emitter<void>());
	public readonly onDidDispose = this.#onDidDispose.event;

	readonly #onDidReceiveMessage = this._register(new Emitter<any>());
	public readonly onDidReceiveMessage = this.#onDidReceiveMessage.event;

	public get id(): string {
		return this.#id;
	}

	public get html(): string {
		return this.#html;
	}

	public set html(value: string) {
		this.assertNotDisposed();
		if (this.#html !== value) {
			this.#html = value;
			this.#proxy.$setHtml(this.#handle, value);
		}
	}

	public async postMessage(message: any): Promise<boolean> {
		this.assertNotDisposed();
		return this.#proxy.$postMessage(this.#handle, message);
	}

	/* internal */ _onMessage(message: any) {
		this.#onDidReceiveMessage.fire(message);
	}

	private assertNotDisposed() {
		if (this.#isDisposed) {
			throw new Error('HiddenWebview is disposed');
		}
	}
}

export class ExtHostHiddenWebviews implements extHostProtocol.ExtHostHiddenWebviewShape {

	private readonly _proxy: extHostProtocol.MainThreadHiddenWebviewShape;
	private readonly _hiddenWebviews = new Map<extHostProtocol.WebviewHandle, ExtHostHiddenWebview>();

	constructor(
		mainContext: extHostProtocol.IMainContext,
	) {
		this._proxy = mainContext.getProxy(extHostProtocol.MainContext.MainThreadHiddenWebview);
	}

	public createHiddenWebview(
		extension: IExtensionDescription,
		id: string,
		_options?: vscode.HiddenWebviewOptions
	): vscode.HiddenWebview {
		const handle = `hidden-webview-${id}-${Math.random().toString(36).substring(2, 11)}`;
		const hiddenWebview = new ExtHostHiddenWebview(handle, this._proxy, id);

		this._hiddenWebviews.set(handle, hiddenWebview);

		this._proxy.$createHiddenWebview(handle, extension.identifier, {
			allowScripts: true,
		});

		return hiddenWebview;
	}

	async $onMessage(handle: extHostProtocol.WebviewHandle, message: any): Promise<void> {
		const hiddenWebview = this._hiddenWebviews.get(handle);
		if (hiddenWebview) {
			hiddenWebview._onMessage(message);
		}
	}

	async $onDidDispose(handle: extHostProtocol.WebviewHandle): Promise<void> {
		const hiddenWebview = this._hiddenWebviews.get(handle);
		if (hiddenWebview) {
			this._hiddenWebviews.delete(handle);
			hiddenWebview.dispose();
		}
	}
}
