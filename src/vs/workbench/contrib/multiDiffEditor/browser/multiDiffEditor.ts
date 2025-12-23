/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { MultiDiffEditorWidget } from '../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorWidget.js';
import { IResourceLabel, IWorkbenchUIElementFactory } from '../../../../editor/browser/widget/multiDiffEditor/workbenchUIElementFactory.js';
import { ITextResourceConfigurationService } from '../../../../editor/common/services/textResourceConfiguration.js';
import { FloatingClickMenu } from '../../../../platform/actions/browser/floatingMenu.js';
import { IMenuService, MenuId } from '../../../../platform/actions/common/actions.js';
import { ISelectOptionItem, SelectBox } from '../../../../base/browser/ui/selectBox/selectBox.js';
import { defaultSelectBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { InstantiationService } from '../../../../platform/instantiation/common/instantiationService.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ResourceLabel } from '../../../browser/labels.js';
import { AbstractEditorWithViewState } from '../../../browser/parts/editor/editorWithViewState.js';
import { ICompositeControl } from '../../../common/composite.js';
import { IEditorOpenContext } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IDocumentDiffItemWithMultiDiffEditorItem, MultiDiffEditorInput } from './multiDiffEditorInput.js';
import { IEditorGroup, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { URI } from '../../../../base/common/uri.js';
import { MultiDiffEditorViewModel } from '../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorViewModel.js';
import { IMultiDiffEditorOptions, IMultiDiffEditorViewState } from '../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorWidgetImpl.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { IDiffEditor } from '../../../../editor/common/editorCommon.js';
import { Range } from '../../../../editor/common/core/range.js';
import { MultiDiffEditorItem } from './multiDiffSourceResolverService.js';
import { IEditorProgressService } from '../../../../platform/progress/common/progress.js';
import { ResourceContextKey } from '../../../common/contextkeys.js';
import { IContextViewService } from '../../../../platform/contextview/browser/contextView.js';

export class MultiDiffEditor extends AbstractEditorWithViewState<IMultiDiffEditorViewState> {
	static readonly ID = 'multiDiffEditor';

	private _multiDiffEditorWidget: MultiDiffEditorWidget | undefined = undefined;
	private _viewModel: MultiDiffEditorViewModel | undefined;
	private _sessionResourceContextKey: ResourceContextKey | undefined;
	private _contentOverlay: MultiDiffEditorContentMenuOverlay | undefined;

	public get viewModel(): MultiDiffEditorViewModel | undefined {
		return this._viewModel;
	}

	constructor(
		group: IEditorGroup,
		@IInstantiationService instantiationService: InstantiationService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IEditorService editorService: IEditorService,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@ITextResourceConfigurationService textResourceConfigurationService: ITextResourceConfigurationService,
		@IEditorProgressService private editorProgressService: IEditorProgressService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextViewService private readonly contextViewService: IContextViewService,
	) {
		super(
			MultiDiffEditor.ID,
			group,
			'multiDiffEditor',
			telemetryService,
			instantiationService,
			storageService,
			textResourceConfigurationService,
			themeService,
			editorService,
			editorGroupService
		);
	}

	private _selectBoxContainer: HTMLElement | undefined;
	private _messageContainer: HTMLElement | undefined;
	private _editorContainer: HTMLElement | undefined;
	private _selectBox: SelectBox | undefined;

	// Responsive breakpoint - matches diffEditor.renderSideBySideInlineBreakpoint
	private static readonly SIDE_BY_SIDE_BREAKPOINT = 900;

	protected createEditor(parent: HTMLElement): void {
		// Create SelectBox Container (Centered at top)
		this._selectBoxContainer = DOM.append(parent, DOM.$('.multi-diff-selectbox-header'));

		// Create SelectBox Options & Map
		const options: ISelectOptionItem[] = [
			{ text: '이전 버전과 비교' },
			{ text: 'Save Point와 비교' },
			{ text: '임시 저장과 비교' }
		];
		const optionIds = ['default', 'savepoint', 'draft'];

		// Create SelectBox
		this._selectBox = this._register(new SelectBox(options, 0, this.contextViewService, defaultSelectBoxStyles));

		// Render SelectBox (Centered)
		const selectBoxWrapper = DOM.append(this._selectBoxContainer, DOM.$('.multi-diff-selectbox-container'));
		this._selectBox.render(selectBoxWrapper);

		// Handle Selection
		this._register(this._selectBox.onDidSelect(e => {
			const selectedId = optionIds[e.index];
			this.instantiationService.invokeFunction(accessor => {
				const commandService = accessor.get(ICommandService);
				if (this.input instanceof MultiDiffEditorInput) {
					const multiDiffSource = this.input.multiDiffSource?.toString();
					commandService.executeCommand('gitbbon.switchComparisonMode', {
						mode: selectedId,
						multiDiffSource: multiDiffSource
					});
				}
			});
		}));

		// Create Message Container (Below SelectBox)
		this._messageContainer = DOM.append(parent, DOM.$('.multi-diff-message-container'));
		this._messageContainer.style.display = 'none'; // Hidden by default

		// Create Editor Container
		this._editorContainer = DOM.append(parent, DOM.$('.multi-diff-editor-container'));
		this._editorContainer.style.position = 'relative';

		this._multiDiffEditorWidget = this._register(this.instantiationService.createInstance(
			MultiDiffEditorWidget,
			this._editorContainer,
			this.instantiationService.createInstance(WorkbenchUIElementFactory),
		));

		this._register(this._multiDiffEditorWidget.onDidChangeActiveControl(() => {
			this._onDidChangeControl.fire();
		}));

		const scopedContextKeyService = this._multiDiffEditorWidget.getContextKeyService();
		const scopedInstantiationService = this._multiDiffEditorWidget.getScopedInstantiationService();
		this._sessionResourceContextKey = this._register(scopedInstantiationService.createInstance(ResourceContextKey));
		this._contentOverlay = this._register(new MultiDiffEditorContentMenuOverlay(
			this._multiDiffEditorWidget.getRootElement(),
			this._sessionResourceContextKey,
			scopedContextKeyService,
			this.menuService,
			scopedInstantiationService,
		));
	}

	override async setInput(input: MultiDiffEditorInput, options: IMultiDiffEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		this._viewModel = await input.getViewModel();
		this._sessionResourceContextKey?.set(input.resource);
		this._contentOverlay?.updateResource(input.resource);
		this._multiDiffEditorWidget?.setViewModel(this._viewModel);

		// Show/hide SelectBox header based on commitMessages presence
		const multiDiffSource = input.multiDiffSource;
		const hasCommitMessages = this.input instanceof MultiDiffEditorInput && !!this.input.commitMessages;

		if (this._selectBoxContainer) {
			if (hasCommitMessages || multiDiffSource?.scheme === 'scm-history-item') {
				this._selectBoxContainer.style.display = 'flex';
				// Only reset to default for initial scm-history-item opens
				if (multiDiffSource?.scheme === 'scm-history-item') {
					this._selectBox?.select(0);
				}
			} else {
				this._selectBoxContainer.style.display = 'none';
			}
		}

		// Commit Messages with Restore Buttons
		if (this.input instanceof MultiDiffEditorInput && this.input.commitMessages && this._messageContainer) {
			const { left, right, leftHash, rightHash } = this.input.commitMessages;
			DOM.clearNode(this._messageContainer);

			const createBox = (label: string, content: string, commitHash: string | undefined, side: 'left' | 'right') => {
				const box = DOM.append(this._messageContainer!, DOM.$(`.message-box.${side}`));

				// Header row with label and restore button
				const header = DOM.append(box, DOM.$('.message-header'));
				DOM.append(header, DOM.$('.message-label')).textContent = label;

				if (commitHash) {
					const restoreBtn = DOM.append(header, DOM.$('button.message-restore-button'));
					DOM.prepend(restoreBtn, DOM.$('.codicon.codicon-history'));
					restoreBtn.appendChild(document.createTextNode('복원'));

					this._register(DOM.addDisposableListener(restoreBtn, DOM.EventType.CLICK, () => {
						this.instantiationService.invokeFunction(accessor => {
							const commandService = accessor.get(ICommandService);
							commandService.executeCommand('gitbbon.restoreToVersion', {
								commitHash: commitHash,
								multiDiffSource: multiDiffSource?.toString()
							});
						});
					}));
				}

				// Content
				DOM.append(box, DOM.$('.message-content')).textContent = content;
			};

			// Show Left (Original) and Right (Modified)
			createBox('Original', left, leftHash, 'left');
			createBox('Modified', right, rightHash, 'right');

			this._messageContainer.style.display = 'flex';
		} else if (this._messageContainer) {
			this._messageContainer.style.display = 'none';
		}

		const viewState = this.loadEditorViewState(input, context);
		if (viewState) {
			this._multiDiffEditorWidget?.setViewState(viewState);
		}
		this._applyOptions(options);
	}

	override setOptions(options: IMultiDiffEditorOptions | undefined): void {
		this._applyOptions(options);
	}

	private _applyOptions(options: IMultiDiffEditorOptions | undefined): void {
		const viewState = options?.viewState;
		if (!viewState || !viewState.revealData) {
			return;
		}
		this._multiDiffEditorWidget?.reveal(viewState.revealData.resource, {
			range: viewState.revealData.range ? Range.lift(viewState.revealData.range) : undefined,
			highlight: true
		});
	}

	override async clearInput(): Promise<void> {
		await super.clearInput();
		this._sessionResourceContextKey?.set(null);
		this._contentOverlay?.updateResource(undefined);
		this._multiDiffEditorWidget?.setViewModel(undefined);
		if (this._selectBoxContainer) {
			this._selectBoxContainer.style.display = 'none';
		}
		if (this._messageContainer) {
			this._messageContainer.style.display = 'none';
		}
	}

	layout(dimension: DOM.Dimension): void {
		const selectBoxHeight = 50;
		let messageHeight = 0;

		// SelectBox container
		if (this._selectBoxContainer && this._selectBoxContainer.style.display !== 'none') {
			this._selectBoxContainer.style.width = `${dimension.width}px`;
		}

		// Message container with 900px responsive breakpoint
		if (this._messageContainer && this._messageContainer.style.display !== 'none') {
			this._messageContainer.style.width = `${dimension.width}px`;

			// Toggle stacked class based on width (matches diffEditor breakpoint)
			if (dimension.width < MultiDiffEditor.SIDE_BY_SIDE_BREAKPOINT) {
				this._messageContainer.classList.add('stacked');
			} else {
				this._messageContainer.classList.remove('stacked');
			}

			messageHeight = this._messageContainer.clientHeight;
		}

		const visibleSelectBoxHeight = (this._selectBoxContainer?.style.display !== 'none') ? selectBoxHeight : 0;
		const editorHeight = Math.max(0, dimension.height - visibleSelectBoxHeight - messageHeight);

		if (this._editorContainer) {
			this._editorContainer.style.height = `${editorHeight}px`;
			this._editorContainer.style.width = `${dimension.width}px`;
		}

		this._multiDiffEditorWidget?.layout(new DOM.Dimension(dimension.width, editorHeight));
	}

	override getControl(): ICompositeControl | undefined {
		return this._multiDiffEditorWidget!.getActiveControl();
	}

	override focus(): void {
		super.focus();

		this._multiDiffEditorWidget?.getActiveControl()?.focus();
	}

	override hasFocus(): boolean {
		return this._multiDiffEditorWidget?.getActiveControl()?.hasTextFocus() || super.hasFocus();
	}

	protected override computeEditorViewState(resource: URI): IMultiDiffEditorViewState | undefined {
		return this._multiDiffEditorWidget!.getViewState();
	}

	protected override tracksEditorViewState(input: EditorInput): boolean {
		return input instanceof MultiDiffEditorInput;
	}

	protected override toEditorViewStateResource(input: EditorInput): URI | undefined {
		return (input as MultiDiffEditorInput).resource;
	}

	public tryGetCodeEditor(resource: URI): { diffEditor: IDiffEditor; editor: ICodeEditor } | undefined {
		return this._multiDiffEditorWidget!.tryGetCodeEditor(resource);
	}

	public findDocumentDiffItem(resource: URI): MultiDiffEditorItem | undefined {
		const i = this._multiDiffEditorWidget!.findDocumentDiffItem(resource);
		if (!i) { return undefined; }
		const i2 = i as IDocumentDiffItemWithMultiDiffEditorItem;
		return i2.multiDiffEditorItem;
	}

	public goToNextChange(): void {
		this._multiDiffEditorWidget?.goToNextChange();
	}

	public goToPreviousChange(): void {
		this._multiDiffEditorWidget?.goToPreviousChange();
	}

	public async showWhile(promise: Promise<unknown>): Promise<void> {
		return this.editorProgressService.showWhile(promise);
	}
}

class MultiDiffEditorContentMenuOverlay extends Disposable {
	private readonly overlayStore = this._register(new MutableDisposable<DisposableStore>());
	private readonly resourceContextKey: ResourceContextKey;
	private currentResource: URI | undefined;
	private readonly rebuild: () => void;

	constructor(
		root: HTMLElement,
		resourceContextKey: ResourceContextKey,
		contextKeyService: IContextKeyService,
		menuService: IMenuService,
		instantiationService: IInstantiationService,
	) {
		super();
		this.resourceContextKey = resourceContextKey;

		const menu = this._register(menuService.createMenu(MenuId.MultiDiffEditorContent, contextKeyService));

		this.rebuild = () => {
			this.overlayStore.clear();

			const container = DOM.h('div.floating-menu-overlay-widget.multi-diff-root-floating-menu');
			root.appendChild(container.root);
			const floatingMenu = instantiationService.createInstance(FloatingClickMenu, {
				container: container.root,
				menuId: MenuId.MultiDiffEditorContent,
				getActionArg: () => this.currentResource,
			});

			const store = new DisposableStore();
			store.add(floatingMenu);
			store.add(toDisposable(() => container.root.remove()));
			this.overlayStore.value = store;
		};

		this.rebuild();
		this._register(menu.onDidChange(() => {
			this.overlayStore.clear();
			this.rebuild();
		}));

		this._register(resourceContextKey);
	}

	public updateResource(resource: URI | undefined): void {
		this.currentResource = resource;
		// Update context key and rebuild so menu arg matches
		this.resourceContextKey.set(resource ?? null);
		this.overlayStore.clear();
		this.rebuild();
	}
}


class WorkbenchUIElementFactory implements IWorkbenchUIElementFactory {
	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) { }

	createResourceLabel(element: HTMLElement): IResourceLabel {
		const label = this._instantiationService.createInstance(ResourceLabel, element, {});
		return {
			setUri(uri, options = {}) {
				if (!uri) {
					label.element.clear();
				} else {
					label.element.setFile(uri, { strikethrough: options.strikethrough });
				}
			},
			dispose() {
				label.dispose();
			}
		};
	}
}
