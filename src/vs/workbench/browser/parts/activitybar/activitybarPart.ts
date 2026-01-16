/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/activitybarpart.css';
import './media/activityaction.css';
import { localize, localize2 } from '../../../../nls.js';
import { ActionsOrientation } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { Part } from '../../part.js';
import { ActivityBarPosition, IWorkbenchLayoutService, LayoutSettings, Parts, Position } from '../../../services/layout/browser/layoutService.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IDisposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ToggleSidebarPositionAction, ToggleSidebarVisibilityAction } from '../../actions/layoutActions.js';
import { IThemeService, IColorTheme, registerThemingParticipant } from '../../../../platform/theme/common/themeService.js';
import { ACTIVITY_BAR_BACKGROUND, ACTIVITY_BAR_BORDER, ACTIVITY_BAR_FOREGROUND, ACTIVITY_BAR_ACTIVE_BORDER, ACTIVITY_BAR_BADGE_BACKGROUND, ACTIVITY_BAR_BADGE_FOREGROUND, ACTIVITY_BAR_INACTIVE_FOREGROUND, ACTIVITY_BAR_ACTIVE_BACKGROUND, ACTIVITY_BAR_DRAG_AND_DROP_BORDER, ACTIVITY_BAR_ACTIVE_FOCUS_BORDER } from '../../../common/theme.js';
import { activeContrastBorder, contrastBorder, focusBorder, buttonBackground, buttonForeground } from '../../../../platform/theme/common/colorRegistry.js';
import { addDisposableListener, append, EventType, isAncestor, $, clearNode } from '../../../../base/browser/dom.js';
import { assertReturnsDefined } from '../../../../base/common/types.js';
import { CustomMenubarControl } from '../titlebar/menubarControl.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { getMenuBarVisibility, MenuSettings } from '../../../../platform/window/common/window.js';
import { IAction, Separator, SubmenuAction, toAction } from '../../../../base/common/actions.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { GestureEvent } from '../../../../base/browser/touch.js';
import { IPaneCompositePart } from '../paneCompositePart.js';
import { IPaneCompositeBarOptions, PaneCompositeBar } from '../paneCompositeBar.js';
import { GlobalCompositeBar } from '../globalCompositeBar.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { Action2, IMenuService, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { getContextMenuActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IViewDescriptorService, ViewContainerLocation, ViewContainerLocationToString } from '../../../common/views.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { SwitchCompositeViewAction } from '../compositeBarActions.js';

// gitbbon custom: Project Bar imports
import { IFileService } from '../../../../platform/files/common/files.js';
import { IPathService } from '../../../services/path/common/pathService.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';

interface IProject {
	name: string;
	title: string;
	path: string;
	initials: string;
	ctime: number;
	remoteUrl?: string; // gitbbon custom: remote URL for opening GitHub
}

// gitbbon custom: Convert Git URL to web URL (GitHub, GitLab, etc.)
function convertGitUrlToWebUrl(gitUrl: string): string | undefined {
	// SSH format: git@github.com:user/repo.git
	const sshMatch = gitUrl.match(/^git@([^:]+):(.+?)(?:\.git)?$/);
	if (sshMatch) {
		return `https://${sshMatch[1]}/${sshMatch[2]}`;
	}

	// HTTPS format: https://github.com/user/repo.git
	const httpsMatch = gitUrl.match(/^https?:\/\/([^/]+)\/(.+?)(?:\.git)?$/);
	if (httpsMatch) {
		return `https://${httpsMatch[1]}/${httpsMatch[2]}`;
	}

	return undefined;
}

// gitbbon custom: Parse .git/config to extract remote origin URL
function parseGitConfigForRemoteUrl(configContent: string): string | undefined {
	const lines = configContent.split('\n');
	let inRemoteOrigin = false;

	for (const line of lines) {
		const trimmedLine = line.trim();

		if (trimmedLine === '[remote "origin"]') {
			inRemoteOrigin = true;
			continue;
		}

		if (inRemoteOrigin) {
			if (trimmedLine.startsWith('[')) {
				// End of remote "origin" section
				break;
			}
			const urlMatch = trimmedLine.match(/^url\s*=\s*(.+)$/);
			if (urlMatch) {
				return urlMatch[1].trim();
			}
		}
	}

	return undefined;
}
// gitbbon custom end

export class ActivitybarPart extends Part {

	static readonly ACTION_HEIGHT = 48;

	static readonly pinnedViewContainersKey = 'workbench.activity.pinnedViewlets2';
	static readonly placeholderViewContainersKey = 'workbench.activity.placeholderViewlets';
	static readonly viewContainersWorkspaceStateKey = 'workbench.activity.viewletsWorkspaceState';

	//#region IView

	readonly minimumWidth: number = 48;
	readonly maximumWidth: number = 48;
	readonly minimumHeight: number = 0;
	readonly maximumHeight: number = Number.POSITIVE_INFINITY;

	//#endregion

	//#endregion

	// gitbbon custom: Replace CompositeBar with ProjectBar
	// private readonly compositeBar = this._register(new MutableDisposable<PaneCompositeBar>());
	private readonly projectBar = this._register(new MutableDisposable<ProjectBar>());
	// gitbbon custom end
	private content: HTMLElement | undefined;

	constructor(
		paneCompositePart: IPaneCompositePart,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		// gitbbon custom: dependencies for project scanning
		@IFileService fileService: IFileService,
		@IPathService pathService: IPathService,
		@IHostService hostService: IHostService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
		@ICommandService commandService: ICommandService,
		@IQuickInputService quickInputService: IQuickInputService,
		@IContextMenuService contextMenuService: IContextMenuService,
		// gitbbon custom end
	) {
		super(Parts.ACTIVITYBAR_PART, { hasTitle: false }, themeService, storageService, layoutService);
	}

	// gitbbon custom: Create ProjectBar instead of CompositeBar
	private createProjectBar(): ProjectBar {
		return this.instantiationService.createInstance(ProjectBar, {
			orientation: ActionsOrientation.VERTICAL,
			colors: (theme: IColorTheme) => ({
				activeForegroundColor: theme.getColor(ACTIVITY_BAR_FOREGROUND),
				inactiveForegroundColor: theme.getColor(ACTIVITY_BAR_INACTIVE_FOREGROUND),
				activeBorderColor: theme.getColor(ACTIVITY_BAR_ACTIVE_BORDER),
				activeBackground: theme.getColor(ACTIVITY_BAR_ACTIVE_BACKGROUND),
				badgeBackground: theme.getColor(ACTIVITY_BAR_BADGE_BACKGROUND),
				badgeForeground: theme.getColor(ACTIVITY_BAR_BADGE_FOREGROUND),
				dragAndDropBorder: theme.getColor(ACTIVITY_BAR_DRAG_AND_DROP_BORDER),
				activeBackgroundColor: undefined, inactiveBackgroundColor: undefined, activeBorderBottomColor: undefined,
			}),
			activityHoverOptions: {
				position: () => this.layoutService.getSideBarPosition() === Position.LEFT ? HoverPosition.RIGHT : HoverPosition.LEFT,
			}
		});
	}
	// gitbbon custom end

	protected override createContentArea(parent: HTMLElement): HTMLElement {
		this.element = parent;
		this.content = append(this.element, $('.content'));

		if (this.layoutService.isVisible(Parts.ACTIVITYBAR_PART)) {
			this.show();
		}

		// gitbbon custom: force show if not visible (though LayoutService controls this, we want to ensure content is built)
		if (!this.projectBar.value) {
			this.show();
		}

		return this.content;
	}

	getPinnedPaneCompositeIds(): string[] {
		return []; // gitbbon custom: No pinned viewlets in Activity Bar
	}

	getVisiblePaneCompositeIds(): string[] {
		return []; // gitbbon custom
	}

	getPaneCompositeIds(): string[] {
		return []; // gitbbon custom
	}

	focus(): void {
		// this.projectBar.value?.focus(); // TODO: Implement focus in ProjectBar
	}

	override updateStyles(): void {
		super.updateStyles();

		const container = assertReturnsDefined(this.getContainer());
		const background = this.getColor(ACTIVITY_BAR_BACKGROUND) || '';
		container.style.backgroundColor = background;

		const borderColor = this.getColor(ACTIVITY_BAR_BORDER) || this.getColor(contrastBorder) || '';
		container.classList.toggle('bordered', !!borderColor);
		container.style.borderColor = borderColor ? borderColor : '';
	}

	show(focus?: boolean): void {
		if (!this.content) {
			return;
		}

		if (!this.projectBar.value) {
			this.projectBar.value = this.createProjectBar();
			this.projectBar.value.create(this.content);

			if (this.dimension) {
				this.layout(this.dimension.width, this.dimension.height);
			}
		}

		if (focus) {
			this.focus();
		}
	}

	hide(): void {
		if (!this.projectBar.value) {
			return;
		}

		this.projectBar.clear();

		if (this.content) {
			clearNode(this.content);
		}
	}

	override layout(width: number, height: number): void {
		super.layout(width, height, 0, 0);

		if (!this.projectBar.value) {
			return;
		}

		// Layout contents
		const contentAreaSize = super.layoutContents(width, height).contentSize;

		// Layout composite bar
		this.projectBar.value.layout(width, contentAreaSize.height);
	}

	toJSON(): object {
		return {
			type: Parts.ACTIVITYBAR_PART
		};
	}
}

export class ActivityBarCompositeBar extends PaneCompositeBar {

	private element: HTMLElement | undefined;

	private readonly menuBar = this._register(new MutableDisposable<CustomMenubarControl>());
	private menuBarContainer: HTMLElement | undefined;
	private compositeBarContainer: HTMLElement | undefined;
	private readonly globalCompositeBar: GlobalCompositeBar | undefined;

	private readonly keyboardNavigationDisposables = this._register(new DisposableStore());

	constructor(
		options: IPaneCompositeBarOptions,
		part: Parts,
		paneCompositePart: IPaneCompositePart,
		showGlobalActivities: boolean,
		@IInstantiationService instantiationService: IInstantiationService,
		@IStorageService storageService: IStorageService,
		@IExtensionService extensionService: IExtensionService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IViewsService viewService: IViewsService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IMenuService private readonly menuService: IMenuService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
	) {
		super({
			...options,
			fillExtraContextMenuActions: (actions, e) => {
				options.fillExtraContextMenuActions(actions, e);
				this.fillContextMenuActions(actions, e);
			}
		}, part, paneCompositePart, instantiationService, storageService, extensionService, viewDescriptorService, viewService, contextKeyService, environmentService, layoutService);

		if (showGlobalActivities) {
			this.globalCompositeBar = this._register(instantiationService.createInstance(GlobalCompositeBar, () => this.getContextMenuActions(), (theme: IColorTheme) => this.options.colors(theme), this.options.activityHoverOptions));
		}

		// Register for configuration changes
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(MenuSettings.MenuBarVisibility)) {
				if (getMenuBarVisibility(this.configurationService) === 'compact') {
					this.installMenubar();
				} else {
					this.uninstallMenubar();
				}
			}
		}));
	}

	private fillContextMenuActions(actions: IAction[], e?: MouseEvent | GestureEvent) {
		// Menu
		const menuBarVisibility = getMenuBarVisibility(this.configurationService);
		if (menuBarVisibility === 'compact' || menuBarVisibility === 'hidden' || menuBarVisibility === 'toggle') {
			actions.unshift(...[toAction({ id: 'toggleMenuVisibility', label: localize('menu', "Menu"), checked: menuBarVisibility === 'compact', run: () => this.configurationService.updateValue(MenuSettings.MenuBarVisibility, menuBarVisibility === 'compact' ? 'toggle' : 'compact') }), new Separator()]);
		}

		if (menuBarVisibility === 'compact' && this.menuBarContainer && e?.target) {
			if (isAncestor(e.target as Node, this.menuBarContainer)) {
				actions.unshift(...[toAction({ id: 'hideCompactMenu', label: localize('hideMenu', "Hide Menu"), run: () => this.configurationService.updateValue(MenuSettings.MenuBarVisibility, 'toggle') }), new Separator()]);
			}
		}

		// Global Composite Bar
		if (this.globalCompositeBar) {
			actions.push(new Separator());
			actions.push(...this.globalCompositeBar.getContextMenuActions());
		}
		actions.push(new Separator());
		actions.push(...this.getActivityBarContextMenuActions());
	}

	private uninstallMenubar() {
		if (this.menuBar.value) {
			this.menuBar.value = undefined;
		}

		if (this.menuBarContainer) {
			this.menuBarContainer.remove();
			this.menuBarContainer = undefined;
		}
	}

	private installMenubar() {
		if (this.menuBar.value) {
			return; // prevent menu bar from installing twice #110720
		}

		this.menuBarContainer = $('.menubar');

		const content = assertReturnsDefined(this.element);
		content.prepend(this.menuBarContainer);

		// Menubar: install a custom menu bar depending on configuration
		this.menuBar.value = this._register(this.instantiationService.createInstance(CustomMenubarControl));
		this.menuBar.value.create(this.menuBarContainer);

	}

	private registerKeyboardNavigationListeners(): void {
		this.keyboardNavigationDisposables.clear();

		// Up/Down or Left/Right arrow on compact menu
		if (this.menuBarContainer) {
			this.keyboardNavigationDisposables.add(addDisposableListener(this.menuBarContainer, EventType.KEY_DOWN, e => {
				const kbEvent = new StandardKeyboardEvent(e);
				if (kbEvent.equals(KeyCode.DownArrow) || kbEvent.equals(KeyCode.RightArrow)) {
					this.focus();
				}
			}));
		}

		// Up/Down on Activity Icons
		if (this.compositeBarContainer) {
			this.keyboardNavigationDisposables.add(addDisposableListener(this.compositeBarContainer, EventType.KEY_DOWN, e => {
				const kbEvent = new StandardKeyboardEvent(e);
				if (kbEvent.equals(KeyCode.DownArrow) || kbEvent.equals(KeyCode.RightArrow)) {
					this.globalCompositeBar?.focus();
				} else if (kbEvent.equals(KeyCode.UpArrow) || kbEvent.equals(KeyCode.LeftArrow)) {
					this.menuBar.value?.toggleFocus();
				}
			}));
		}

		// Up arrow on global icons
		if (this.globalCompositeBar) {
			this.keyboardNavigationDisposables.add(addDisposableListener(this.globalCompositeBar.element, EventType.KEY_DOWN, e => {
				const kbEvent = new StandardKeyboardEvent(e);
				if (kbEvent.equals(KeyCode.UpArrow) || kbEvent.equals(KeyCode.LeftArrow)) {
					this.focus(this.getVisiblePaneCompositeIds().length - 1);
				}
			}));
		}
	}

	override create(parent: HTMLElement): HTMLElement {
		this.element = parent;

		// Install menubar if compact
		if (getMenuBarVisibility(this.configurationService) === 'compact') {
			this.installMenubar();
		}

		// View Containers action bar
		this.compositeBarContainer = super.create(this.element);

		// Global action bar
		if (this.globalCompositeBar) {
			this.globalCompositeBar.create(this.element);
		}

		// Keyboard Navigation
		this.registerKeyboardNavigationListeners();

		return this.compositeBarContainer;
	}

	override layout(width: number, height: number): void {
		if (this.menuBarContainer) {
			if (this.options.orientation === ActionsOrientation.VERTICAL) {
				height -= this.menuBarContainer.clientHeight;
			} else {
				width -= this.menuBarContainer.clientWidth;
			}
		}
		if (this.globalCompositeBar) {
			if (this.options.orientation === ActionsOrientation.VERTICAL) {
				height -= (this.globalCompositeBar.size() * ActivitybarPart.ACTION_HEIGHT);
			} else {
				width -= this.globalCompositeBar.element.clientWidth;
			}
		}
		super.layout(width, height);
	}

	getActivityBarContextMenuActions(): IAction[] {
		const activityBarPositionMenu = this.menuService.getMenuActions(MenuId.ActivityBarPositionMenu, this.contextKeyService, { shouldForwardArgs: true, renderShortTitle: true });
		const positionActions = getContextMenuActions(activityBarPositionMenu).secondary;
		const actions = [
			new SubmenuAction('workbench.action.panel.position', localize('activity bar position', "Activity Bar Position"), positionActions),
			toAction({ id: ToggleSidebarPositionAction.ID, label: ToggleSidebarPositionAction.getLabel(this.layoutService), run: () => this.instantiationService.invokeFunction(accessor => new ToggleSidebarPositionAction().run(accessor)) }),
		];

		if (this.part === Parts.SIDEBAR_PART) {
			actions.push(toAction({ id: ToggleSidebarVisibilityAction.ID, label: ToggleSidebarVisibilityAction.LABEL, run: () => this.instantiationService.invokeFunction(accessor => new ToggleSidebarVisibilityAction().run(accessor)) }));
		}

		return actions;
	}

}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.activityBarLocation.default',
			title: {
				...localize2('positionActivityBarDefault', 'Move Activity Bar to Side'),
				mnemonicTitle: localize({ key: 'miDefaultActivityBar', comment: ['&& denotes a mnemonic'] }, "&&Default"),
			},
			shortTitle: localize('default', "Default"),
			category: Categories.View,
			toggled: ContextKeyExpr.equals(`config.${LayoutSettings.ACTIVITY_BAR_LOCATION}`, ActivityBarPosition.DEFAULT),
			menu: [{
				id: MenuId.ActivityBarPositionMenu,
				order: 1
			}, {
				id: MenuId.CommandPalette,
				when: ContextKeyExpr.notEquals(`config.${LayoutSettings.ACTIVITY_BAR_LOCATION}`, ActivityBarPosition.DEFAULT),
			}]
		});
	}
	run(accessor: ServicesAccessor): void {
		const configurationService = accessor.get(IConfigurationService);
		configurationService.updateValue(LayoutSettings.ACTIVITY_BAR_LOCATION, ActivityBarPosition.DEFAULT);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.activityBarLocation.top',
			title: {
				...localize2('positionActivityBarTop', 'Move Activity Bar to Top'),
				mnemonicTitle: localize({ key: 'miTopActivityBar', comment: ['&& denotes a mnemonic'] }, "&&Top"),
			},
			shortTitle: localize('top', "Top"),
			category: Categories.View,
			toggled: ContextKeyExpr.equals(`config.${LayoutSettings.ACTIVITY_BAR_LOCATION}`, ActivityBarPosition.TOP),
			menu: [{
				id: MenuId.ActivityBarPositionMenu,
				order: 2
			}, {
				id: MenuId.CommandPalette,
				when: ContextKeyExpr.notEquals(`config.${LayoutSettings.ACTIVITY_BAR_LOCATION}`, ActivityBarPosition.TOP),
			}]
		});
	}
	run(accessor: ServicesAccessor): void {
		const configurationService = accessor.get(IConfigurationService);
		configurationService.updateValue(LayoutSettings.ACTIVITY_BAR_LOCATION, ActivityBarPosition.TOP);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.activityBarLocation.bottom',
			title: {
				...localize2('positionActivityBarBottom', 'Move Activity Bar to Bottom'),
				mnemonicTitle: localize({ key: 'miBottomActivityBar', comment: ['&& denotes a mnemonic'] }, "&&Bottom"),
			},
			shortTitle: localize('bottom', "Bottom"),
			category: Categories.View,
			toggled: ContextKeyExpr.equals(`config.${LayoutSettings.ACTIVITY_BAR_LOCATION}`, ActivityBarPosition.BOTTOM),
			menu: [{
				id: MenuId.ActivityBarPositionMenu,
				order: 3
			}, {
				id: MenuId.CommandPalette,
				when: ContextKeyExpr.notEquals(`config.${LayoutSettings.ACTIVITY_BAR_LOCATION}`, ActivityBarPosition.BOTTOM),
			}]
		});
	}
	run(accessor: ServicesAccessor): void {
		const configurationService = accessor.get(IConfigurationService);
		configurationService.updateValue(LayoutSettings.ACTIVITY_BAR_LOCATION, ActivityBarPosition.BOTTOM);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.activityBarLocation.hide',
			title: {
				...localize2('hideActivityBar', 'Hide Activity Bar'),
				mnemonicTitle: localize({ key: 'miHideActivityBar', comment: ['&& denotes a mnemonic'] }, "&&Hidden"),
			},
			shortTitle: localize('hide', "Hidden"),
			category: Categories.View,
			toggled: ContextKeyExpr.equals(`config.${LayoutSettings.ACTIVITY_BAR_LOCATION}`, ActivityBarPosition.HIDDEN),
			menu: [{
				id: MenuId.ActivityBarPositionMenu,
				order: 4
			}, {
				id: MenuId.CommandPalette,
				when: ContextKeyExpr.notEquals(`config.${LayoutSettings.ACTIVITY_BAR_LOCATION}`, ActivityBarPosition.HIDDEN),
			}]
		});
	}
	run(accessor: ServicesAccessor): void {
		const configurationService = accessor.get(IConfigurationService);
		configurationService.updateValue(LayoutSettings.ACTIVITY_BAR_LOCATION, ActivityBarPosition.HIDDEN);
	}
});

MenuRegistry.appendMenuItem(MenuId.MenubarAppearanceMenu, {
	submenu: MenuId.ActivityBarPositionMenu,
	title: localize('positionActivituBar', "Activity Bar Position"),
	group: '3_workbench_layout_move',
	order: 2
});

MenuRegistry.appendMenuItem(MenuId.ViewContainerTitleContext, {
	submenu: MenuId.ActivityBarPositionMenu,
	title: localize('positionActivituBar', "Activity Bar Position"),
	when: ContextKeyExpr.or(
		ContextKeyExpr.equals('viewContainerLocation', ViewContainerLocationToString(ViewContainerLocation.Sidebar)),
		ContextKeyExpr.equals('viewContainerLocation', ViewContainerLocationToString(ViewContainerLocation.AuxiliaryBar))
	),
	group: '3_workbench_layout_move',
	order: 1
});

registerAction2(class extends SwitchCompositeViewAction {
	constructor() {
		super({
			id: 'workbench.action.previousSideBarView',
			title: localize2('previousSideBarView', 'Previous Primary Side Bar View'),
			category: Categories.View,
			f1: true
		}, ViewContainerLocation.Sidebar, -1);
	}
});

registerAction2(class extends SwitchCompositeViewAction {
	constructor() {
		super({
			id: 'workbench.action.nextSideBarView',
			title: localize2('nextSideBarView', 'Next Primary Side Bar View'),
			category: Categories.View,
			f1: true
		}, ViewContainerLocation.Sidebar, 1);
	}
});

registerAction2(
	class FocusActivityBarAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.focusActivityBar',
				title: localize2('focusActivityBar', 'Focus Activity Bar'),
				category: Categories.View,
				f1: true
			});
		}

		async run(accessor: ServicesAccessor): Promise<void> {
			const layoutService = accessor.get(IWorkbenchLayoutService);
			layoutService.focusPart(Parts.ACTIVITYBAR_PART);
		}
	});

registerThemingParticipant((theme, collector) => {

	const activityBarActiveBorderColor = theme.getColor(ACTIVITY_BAR_ACTIVE_BORDER);
	if (activityBarActiveBorderColor) {
		collector.addRule(`
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked .active-item-indicator:before {
				border-left-color: ${activityBarActiveBorderColor};
			}
		`);
	}

	const activityBarActiveFocusBorderColor = theme.getColor(ACTIVITY_BAR_ACTIVE_FOCUS_BORDER);
	if (activityBarActiveFocusBorderColor) {
		collector.addRule(`
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked:focus::before {
				visibility: hidden;
			}

			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked:focus .active-item-indicator:before {
				visibility: visible;
				border-left-color: ${activityBarActiveFocusBorderColor};
			}
		`);
	}

	const activityBarActiveBackgroundColor = theme.getColor(ACTIVITY_BAR_ACTIVE_BACKGROUND);
	if (activityBarActiveBackgroundColor) {
		collector.addRule(`
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked .active-item-indicator {
				z-index: 0;
				background-color: ${activityBarActiveBackgroundColor};
			}
		`);
	}

	// Styling with Outline color (e.g. high contrast theme)
	const outline = theme.getColor(activeContrastBorder);
	if (outline) {
		collector.addRule(`
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item .action-label::before{
				padding: 6px;
			}

			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.active .action-label::before,
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.active:hover .action-label::before,
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked .action-label::before,
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked:hover .action-label::before {
				outline: 1px solid ${outline};
			}

			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item:hover .action-label::before {
				outline: 1px dashed ${outline};
			}

			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item:focus .active-item-indicator:before {
				border-left-color: ${outline};
			}
		`);
	}

	// Styling without outline color
	else {
		const focusBorderColor = theme.getColor(focusBorder);
		if (focusBorderColor) {
			collector.addRule(`
				.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item:focus .active-item-indicator::before {
						border-left-color: ${focusBorderColor};
					}
				`);
		}
	}
});

// gitbbon custom: New ProjectBar class
class ProjectBar extends DisposableStore {
	private element: HTMLElement | undefined;
	private projects: IProject[] = [];
	private loadProjectsTimer: ReturnType<typeof setTimeout> | undefined;
	private isLoadingProjects = false;

	protected _register<T extends IDisposable>(o: T): T {
		return this.add(o);
	}

	constructor(
		options: {
			orientation: ActionsOrientation;
			colors: (theme: IColorTheme) => any;
			activityHoverOptions: { position: () => HoverPosition };
		},
		@IFileService private readonly fileService: IFileService,
		@IPathService private readonly pathService: IPathService,
		@IHostService private readonly hostService: IHostService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@ICommandService private readonly commandService: ICommandService,

		@IThemeService private readonly themeService: IThemeService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IDialogService private readonly dialogService: IDialogService,
		@IOpenerService private readonly openerService: IOpenerService,
	) {
		super();
		this.loadProjects();
		this.add(this.themeService.onDidColorThemeChange(() => this.render()));
		this.registerListeners();
	}

	private async registerListeners(): Promise<void> {
		const userHome = await this.pathService.userHome();
		const gitbbonNotesUri = URI.joinPath(userHome, 'Documents', 'Gitbbon_Notes');

		// Watch for changes in the directory
		const watcher = this.fileService.watch(gitbbonNotesUri, { recursive: true, excludes: [], includes: ['*/', '*/.gitbbon.json'] });
		this._register(watcher);

		this._register(this.fileService.onDidFilesChange(e => {
			if (e.affects(gitbbonNotesUri)) {
				this.scheduleLoadProjects();
			}
		}));
	}

	private scheduleLoadProjects(): void {
		if (this.loadProjectsTimer) {
			clearTimeout(this.loadProjectsTimer);
		}
		this.loadProjectsTimer = setTimeout(() => {
			this.loadProjectsTimer = undefined;
			this.loadProjects();
		}, 100);
	}

	create(parent: HTMLElement): void {
		this.element = append(parent, $('.project-bar'));
		this.element.style.display = 'flex';
		this.element.style.flexDirection = 'column';
		this.element.style.alignItems = 'center';
		this.element.style.paddingTop = '10px';
		this.element.style.width = '100%';
		this.element.style.height = '100%';
		this.element.style.overflowY = 'auto'; // Enable vertical scrolling
		this.element.style.overflowX = 'hidden';

		// Hide scrollbar
		this.element.style.scrollbarWidth = 'none'; // Firefox
		// @ts-ignore
		this.element.style.msOverflowStyle = 'none'; // IE and Edge
		this.render();
	}

	layout(width: number, height: number): void {
		if (this.element) {
			this.element.style.height = `${height}px`;
		}
	}

	override clear(): void {
		if (this.element) {
			clearNode(this.element);
		}
		super.clear();
	}

	private async loadProjects(): Promise<void> {
		if (this.isLoadingProjects) {
			// 이미 실행 중이면 다시 스케줄링
			this.scheduleLoadProjects();
			return;
		}
		this.isLoadingProjects = true;
		try {
			const userHome = await this.pathService.userHome();
			const gitbbonNotesUri = URI.joinPath(userHome, 'Documents', 'Gitbbon_Notes');

			if (!(await this.fileService.exists(gitbbonNotesUri))) {
				this.isLoadingProjects = false;
				return;
			}

			const stat = await this.fileService.resolve(gitbbonNotesUri, { resolveMetadata: true });
			if (!stat.children) {
				return;
			}

			this.projects = [];
			for (const child of stat.children) {
				if (!child.isDirectory) {
					continue;
				}
				if (await this.fileService.exists(URI.joinPath(child.resource, '.git'))) {
					let title = child.name;
					const gitbbonJsonUri = URI.joinPath(child.resource, '.gitbbon.json');
					try {
						if (await this.fileService.exists(gitbbonJsonUri)) {
							const content = await this.fileService.readFile(gitbbonJsonUri);
							const json = JSON.parse(content.value.toString());
							if (json.title) {
								title = json.title;
							}
						}
					} catch (e) {
						// ignore error
					}

					// gitbbon custom: Read remote URL from .git/config
					let remoteUrl: string | undefined;
					try {
						const gitConfigUri = URI.joinPath(child.resource, '.git', 'config');
						if (await this.fileService.exists(gitConfigUri)) {
							const gitConfigContent = await this.fileService.readFile(gitConfigUri);
							const gitUrl = parseGitConfigForRemoteUrl(gitConfigContent.value.toString());
							if (gitUrl) {
								remoteUrl = convertGitUrlToWebUrl(gitUrl);
							}
						}
					} catch (e) {
						// ignore error
					}
					// gitbbon custom end

					this.projects.push({
						name: child.name,
						title: title,
						path: child.resource.fsPath,
						initials: title.substring(0, 3).toUpperCase(),
						ctime: child.ctime ?? 0,
						remoteUrl: remoteUrl
					});
				}
			}

			// Sort by creation time descending (newest first)
			this.projects.sort((a, b) => b.ctime - a.ctime);

			this.render();
		} catch (e) {
			console.error('Failed to load projects', e);
		} finally {
			this.isLoadingProjects = false;
		}
	}

	private render(): void {
		if (!this.element) {
			return;
		}
		clearNode(this.element);

		const currentPath = this.workspaceContextService.getWorkspace().folders[0]?.uri.fsPath;

		const theme = this.themeService.getColorTheme();
		const btnBg = theme.getColor(buttonBackground)?.toString() || '#444444';
		const btnFg = theme.getColor(buttonForeground)?.toString() || '#ffffff';
		const activeBorderColor = theme.getColor(ACTIVITY_BAR_ACTIVE_BORDER)?.toString() || '#ffffff';

		this.projects.forEach(project => {
			const container = append(this.element!, $('.project-container'));
			container.style.display = 'flex';
			container.style.flexDirection = 'column';
			container.style.alignItems = 'center';
			container.style.marginBottom = '16px';
			container.style.cursor = 'pointer';
			container.title = project.title;

			const item = append(container, $('.project-item'));
			item.style.width = '36px';
			item.style.height = '36px';
			item.style.borderRadius = '50%'; // Circle
			item.style.display = 'flex';
			item.style.alignItems = 'center';
			item.style.justifyContent = 'center';
			item.style.fontSize = '11px'; // Smaller font for 3 chars
			item.style.fontWeight = 'bold';
			item.style.color = btnFg;
			item.style.backgroundColor = btnBg;
			item.style.flexShrink = '0'; // Prevent circle from shrinking

			// Highlight current project
			if (currentPath && (project.path === currentPath)) {
				item.style.border = `3px solid ${activeBorderColor}`; // Bold border
				item.style.boxSizing = 'border-box';
			}

			item.textContent = project.initials;

			const openProject = (forceNewWindow: boolean) => {
				if (currentPath !== project.path || forceNewWindow) {
					this.hostService.openWindow([{ folderUri: URI.file(project.path) }], { forceReuseWindow: !forceNewWindow, forceNewWindow: forceNewWindow });
				}
			};

			container.onclick = (e) => {
				e.preventDefault();
				this.contextMenuService.showContextMenu({
					getAnchor: () => container,
					getActions: () => {
						const actions: IAction[] = [
							toAction({
								id: 'gitbbon.project.open',
								label: 'Open Project',
								run: () => openProject(false)
							}),
							toAction({
								id: 'gitbbon.project.openNewWindow',
								label: 'Open Project in New Window',
								run: () => openProject(true)
							}),
						];

						// gitbbon custom: Add 'Open in GitHub' if remoteUrl exists
						if (project.remoteUrl) {
							actions.push(
								toAction({
									id: 'gitbbon.project.openInGitHub',
									label: 'Open in GitHub',
									run: () => this.openerService.open(URI.parse(project.remoteUrl!))
								})
							);
						}
						// gitbbon custom end

						actions.push(
							new Separator(),
							toAction({
								id: 'gitbbon.project.rename',
								label: 'Rename Project',
								run: async () => {
									const newTitle = await this.quickInputService.input({
										value: project.title,
										prompt: 'Enter new project name',
									});
									if (newTitle) {
										const gitbbonJsonUri = URI.joinPath(URI.file(project.path), '.gitbbon.json');
										try {
											let json: any = {};
											if (await this.fileService.exists(gitbbonJsonUri)) {
												const content = await this.fileService.readFile(gitbbonJsonUri);
												json = JSON.parse(content.value.toString());
											}
											json.title = newTitle;
											await this.fileService.writeFile(gitbbonJsonUri, VSBuffer.fromString(JSON.stringify(json, null, 2)));
											// The file watcher will eventually trigger a reload
										} catch (e) {
											console.error('Failed to rename project', e);
										}
									}
								}
							}),
							toAction({
								id: 'gitbbon.project.delete',
								label: 'Delete Project',
								run: async () => {
									const confirm = await this.dialogService.confirm({
										message: `Are you sure you want to delete '${project.title}'?`,
										detail: 'The folder will be moved to the trash.',
										primaryButton: 'Delete',
										type: 'warning'
									});

									if (confirm.confirmed) {
										try {
											await this.fileService.del(URI.file(project.path), { recursive: true, useTrash: true });
										} catch (e) {
											console.error('Failed to delete project', e);
											this.dialogService.error(e);
										}
									}
								}
							})
						);

						return actions;
					}
				});
			};

			container.oncontextmenu = (e) => {
				e.preventDefault();
				e.stopPropagation(); // Prevent default context menu
				this.contextMenuService.showContextMenu({
					getAnchor: () => container,
					getActions: () => {
						const actions: IAction[] = [
							toAction({
								id: 'gitbbon.project.open',
								label: 'Open Project',
								run: () => openProject(false)
							}),
							toAction({
								id: 'gitbbon.project.openNewWindow',
								label: 'Open Project in New Window',
								run: () => openProject(true)
							}),
						];

						// gitbbon custom: Add 'Open in GitHub' if remoteUrl exists
						if (project.remoteUrl) {
							actions.push(
								toAction({
									id: 'gitbbon.project.openInGitHub',
									label: 'Open in GitHub',
									run: () => this.openerService.open(URI.parse(project.remoteUrl!))
								})
							);
						}
						// gitbbon custom end

						actions.push(
							new Separator(),
							toAction({
								id: 'gitbbon.project.rename',
								label: 'Rename Project',
								run: async () => {
									const newTitle = await this.quickInputService.input({
										value: project.title,
										prompt: 'Enter new project name',
									});
									if (newTitle) {
										const gitbbonJsonUri = URI.joinPath(URI.file(project.path), '.gitbbon.json');
										try {
											let json: any = {};
											if (await this.fileService.exists(gitbbonJsonUri)) {
												const content = await this.fileService.readFile(gitbbonJsonUri);
												json = JSON.parse(content.value.toString());
											}
											json.title = newTitle;
											await this.fileService.writeFile(gitbbonJsonUri, VSBuffer.fromString(JSON.stringify(json, null, 2)));
											// The file watcher will eventually trigger a reload
										} catch (e) {
											console.error('Failed to rename project', e);
										}
									}
								}
							}),
							toAction({
								id: 'gitbbon.project.delete',
								label: 'Delete Project',
								run: async () => {
									const confirm = await this.dialogService.confirm({
										message: `Are you sure you want to delete '${project.title}'?`,
										detail: 'The folder will be moved to the trash.',
										primaryButton: 'Delete',
										type: 'warning'
									});

									if (confirm.confirmed) {
										try {
											await this.fileService.del(URI.file(project.path), { recursive: true, useTrash: true });
										} catch (e) {
											console.error('Failed to delete project', e);
											this.dialogService.error(e);
										}
									}
								}
							})
						);

						return actions;
					}
				});
			};
		});

		// Add '+' button for new project
		const addBtn = append(this.element, $('.project-item.add-btn'));
		addBtn.style.width = '36px';
		addBtn.style.height = '36px';
		addBtn.style.display = 'flex';
		addBtn.style.alignItems = 'center';
		addBtn.style.justifyContent = 'center';
		addBtn.style.cursor = 'pointer';
		addBtn.style.color = '#888888';
		addBtn.style.border = '1px dashed #888888';
		addBtn.style.borderRadius = '50%';
		addBtn.style.flexShrink = '0'; // Prevent circle from shrinking
		addBtn.textContent = '+';
		addBtn.title = 'Add New Project';

		addBtn.onclick = () => {
			this.commandService.executeCommand('gitbbon.manager.addProject');
		};
	}
}
// gitbbon custom end
