/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sidebarpart.css';
import './sidebarActions.js';
import { ActivityBarPosition, IWorkbenchLayoutService, LayoutSettings, Parts, Position as SideBarPosition } from '../../../services/layout/browser/layoutService.js';
import { SidebarFocusContext, ActiveViewletContext } from '../../../common/contextkeys.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { contrastBorder } from '../../../../platform/theme/common/colorRegistry.js';
import { SIDE_BAR_TITLE_FOREGROUND, SIDE_BAR_TITLE_BORDER, SIDE_BAR_BACKGROUND, SIDE_BAR_FOREGROUND, SIDE_BAR_BORDER, SIDE_BAR_DRAG_AND_DROP_BACKGROUND, ACTIVITY_BAR_BADGE_BACKGROUND, ACTIVITY_BAR_BADGE_FOREGROUND, ACTIVITY_BAR_TOP_FOREGROUND, ACTIVITY_BAR_TOP_ACTIVE_BORDER, ACTIVITY_BAR_TOP_INACTIVE_FOREGROUND, ACTIVITY_BAR_TOP_DRAG_AND_DROP_BORDER } from '../../../common/theme.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { AnchorAlignment } from '../../../../base/browser/ui/contextview/contextview.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { LayoutPriority } from '../../../../base/browser/ui/grid/grid.js';
import { assertReturnsDefined } from '../../../../base/common/types.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { AbstractPaneCompositePart, CompositeBarPosition } from '../paneCompositePart.js';
import { ActivityBarCompositeBar, ActivitybarPart } from '../activitybar/activitybarPart.js';
import { ActionsOrientation } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { IPaneCompositeBarOptions } from '../paneCompositeBar.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { Action2, IMenuService, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { Separator } from '../../../../base/common/actions.js';
import { ToggleActivityBarVisibilityActionId } from '../../actions/layoutActions.js';
import { localize2 } from '../../../../nls.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';

import { IFileService } from '../../../../platform/files/common/files.js';
import { IPathService } from '../../../services/path/common/pathService.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { URI } from '../../../../base/common/uri.js';
import { ICompositeTitleLabel } from '../compositePart.js';
import { append, $, getWindow } from '../../../../base/browser/dom.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';

interface IProject {
	name: string;
	path: string;
}

export class SidebarPart extends AbstractPaneCompositePart {

	static readonly activeViewletSettingsKey = 'workbench.sidebar.activeviewletid';

	private switcherContainer: HTMLElement | undefined;
	private projectSwitcher: HTMLSelectElement | undefined;

	//#region IView

	readonly minimumWidth: number = 170;
	readonly maximumWidth: number = Number.POSITIVE_INFINITY;
	readonly minimumHeight: number = 0;
	readonly maximumHeight: number = Number.POSITIVE_INFINITY;
	override get snap(): boolean { return true; }

	readonly priority: LayoutPriority = LayoutPriority.Low;

	get preferredWidth(): number | undefined {
		const viewlet = this.getActivePaneComposite();

		if (!viewlet) {
			return undefined;
		}

		const width = viewlet.getOptimalWidth();
		if (typeof width !== 'number') {
			return undefined;
		}

		return Math.max(width, 300);
	}

	private readonly activityBarPart = this._register(this.instantiationService.createInstance(ActivitybarPart, this));

	//#endregion

	constructor(
		@INotificationService notificationService: INotificationService,
		@IStorageService storageService: IStorageService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IHoverService hoverService: IHoverService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IExtensionService extensionService: IExtensionService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IMenuService menuService: IMenuService,
		@IFileService private readonly fileService: IFileService,
		@IPathService private readonly pathService: IPathService,
		@IHostService private readonly hostService: IHostService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
	) {
		super(
			Parts.SIDEBAR_PART,
			{ hasTitle: true, trailingSeparator: false, borderWidth: () => (this.getColor(SIDE_BAR_BORDER) || this.getColor(contrastBorder)) ? 1 : 0 },
			SidebarPart.activeViewletSettingsKey,
			ActiveViewletContext.bindTo(contextKeyService),
			SidebarFocusContext.bindTo(contextKeyService),
			'sideBar',
			'viewlet',
			SIDE_BAR_TITLE_FOREGROUND,
			SIDE_BAR_TITLE_BORDER,
			notificationService,
			storageService,
			contextMenuService,
			layoutService,
			keybindingService,
			hoverService,
			instantiationService,
			themeService,
			viewDescriptorService,
			contextKeyService,
			extensionService,
			menuService,
		);

		this.rememberActivityBarVisiblePosition();
		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(LayoutSettings.ACTIVITY_BAR_LOCATION)) {
				this.onDidChangeActivityBarLocation();
			}
		}));

		this.registerActions();

		// Ensure visibility is correct when switching viewlets
		this._register(this.onDidPaneCompositeOpen(composite => {
			this.updateProjectSwitcherVisibility(composite.getId());
		}));
	}

	private onDidChangeActivityBarLocation(): void {
		this.activityBarPart.hide();

		this.updateCompositeBar();

		const id = this.getActiveComposite()?.getId();
		if (id) {
			this.onTitleAreaUpdate(id);
		}

		if (this.shouldShowActivityBar()) {
			this.activityBarPart.show();
		}

		this.rememberActivityBarVisiblePosition();
	}

	override updateStyles(): void {
		super.updateStyles();

		const container = assertReturnsDefined(this.getContainer());

		container.style.backgroundColor = this.getColor(SIDE_BAR_BACKGROUND) || '';
		container.style.color = this.getColor(SIDE_BAR_FOREGROUND) || '';

		const borderColor = this.getColor(SIDE_BAR_BORDER) || this.getColor(contrastBorder);
		const isPositionLeft = this.layoutService.getSideBarPosition() === SideBarPosition.LEFT;
		container.style.borderRightWidth = borderColor && isPositionLeft ? '1px' : '';
		container.style.borderRightStyle = borderColor && isPositionLeft ? 'solid' : '';
		container.style.borderRightColor = isPositionLeft ? borderColor || '' : '';
		container.style.borderLeftWidth = borderColor && !isPositionLeft ? '1px' : '';
		container.style.borderLeftStyle = borderColor && !isPositionLeft ? 'solid' : '';
		container.style.borderLeftColor = !isPositionLeft ? borderColor || '' : '';
		container.style.outlineColor = this.getColor(SIDE_BAR_DRAG_AND_DROP_BACKGROUND) ?? '';
	}

	override layout(width: number, height: number, top: number, left: number): void {
		if (!this.layoutService.isVisible(Parts.SIDEBAR_PART)) {
			return;
		}

		super.layout(width, height, top, left);
	}

	protected override getTitleAreaDropDownAnchorAlignment(): AnchorAlignment {
		return this.layoutService.getSideBarPosition() === SideBarPosition.LEFT ? AnchorAlignment.LEFT : AnchorAlignment.RIGHT;
	}

	protected override createCompositeBar(): ActivityBarCompositeBar {
		return this.instantiationService.createInstance(ActivityBarCompositeBar, this.getCompositeBarOptions(), this.partId, this, false);
	}

	protected getCompositeBarOptions(): IPaneCompositeBarOptions {
		return {
			partContainerClass: 'sidebar',
			pinnedViewContainersKey: ActivitybarPart.pinnedViewContainersKey,
			placeholderViewContainersKey: ActivitybarPart.placeholderViewContainersKey,
			viewContainersWorkspaceStateKey: ActivitybarPart.viewContainersWorkspaceStateKey,
			icon: true,
			orientation: ActionsOrientation.HORIZONTAL,
			recomputeSizes: true,
			activityHoverOptions: {
				position: () => this.getCompositeBarPosition() === CompositeBarPosition.BOTTOM ? HoverPosition.ABOVE : HoverPosition.BELOW,
			},
			fillExtraContextMenuActions: actions => {
				if (this.getCompositeBarPosition() === CompositeBarPosition.TITLE) {
					const viewsSubmenuAction = this.getViewsSubmenuAction();
					if (viewsSubmenuAction) {
						actions.push(new Separator());
						actions.push(viewsSubmenuAction);
					}
				}
			},
			compositeSize: 0,
			iconSize: 16,
			overflowActionSize: 30,
			colors: theme => ({
				activeBackgroundColor: theme.getColor(SIDE_BAR_BACKGROUND),
				inactiveBackgroundColor: theme.getColor(SIDE_BAR_BACKGROUND),
				activeBorderBottomColor: theme.getColor(ACTIVITY_BAR_TOP_ACTIVE_BORDER),
				activeForegroundColor: theme.getColor(ACTIVITY_BAR_TOP_FOREGROUND),
				inactiveForegroundColor: theme.getColor(ACTIVITY_BAR_TOP_INACTIVE_FOREGROUND),
				badgeBackground: theme.getColor(ACTIVITY_BAR_BADGE_BACKGROUND),
				badgeForeground: theme.getColor(ACTIVITY_BAR_BADGE_FOREGROUND),
				dragAndDropBorder: theme.getColor(ACTIVITY_BAR_TOP_DRAG_AND_DROP_BORDER)
			}),
			compact: true
		};
	}

	protected shouldShowCompositeBar(): boolean {
		const activityBarPosition = this.configurationService.getValue<ActivityBarPosition>(LayoutSettings.ACTIVITY_BAR_LOCATION);
		return activityBarPosition === ActivityBarPosition.TOP || activityBarPosition === ActivityBarPosition.BOTTOM;
	}

	private shouldShowActivityBar(): boolean {
		if (this.shouldShowCompositeBar()) {
			return false;
		}

		return this.configurationService.getValue(LayoutSettings.ACTIVITY_BAR_LOCATION) !== ActivityBarPosition.HIDDEN;
	}

	protected getCompositeBarPosition(): CompositeBarPosition {
		const activityBarPosition = this.configurationService.getValue<ActivityBarPosition>(LayoutSettings.ACTIVITY_BAR_LOCATION);
		switch (activityBarPosition) {
			case ActivityBarPosition.TOP: return CompositeBarPosition.TOP;
			case ActivityBarPosition.BOTTOM: return CompositeBarPosition.BOTTOM;
			case ActivityBarPosition.HIDDEN:
			case ActivityBarPosition.DEFAULT: // noop
			default: return CompositeBarPosition.TITLE;
		}
	}

	private rememberActivityBarVisiblePosition(): void {
		const activityBarPosition = this.configurationService.getValue<string>(LayoutSettings.ACTIVITY_BAR_LOCATION);
		if (activityBarPosition !== ActivityBarPosition.HIDDEN) {
			this.storageService.store(LayoutSettings.ACTIVITY_BAR_LOCATION, activityBarPosition, StorageScope.PROFILE, StorageTarget.USER);
		}
	}

	private getRememberedActivityBarVisiblePosition(): ActivityBarPosition {
		const activityBarPosition = this.storageService.get(LayoutSettings.ACTIVITY_BAR_LOCATION, StorageScope.PROFILE);
		switch (activityBarPosition) {
			case ActivityBarPosition.TOP: return ActivityBarPosition.TOP;
			case ActivityBarPosition.BOTTOM: return ActivityBarPosition.BOTTOM;
			default: return ActivityBarPosition.DEFAULT;
		}
	}

	override getPinnedPaneCompositeIds(): string[] {
		return this.shouldShowCompositeBar() ? super.getPinnedPaneCompositeIds() : this.activityBarPart.getPinnedPaneCompositeIds();
	}

	override getVisiblePaneCompositeIds(): string[] {
		return this.shouldShowCompositeBar() ? super.getVisiblePaneCompositeIds() : this.activityBarPart.getVisiblePaneCompositeIds();
	}

	override getPaneCompositeIds(): string[] {
		return this.shouldShowCompositeBar() ? super.getPaneCompositeIds() : this.activityBarPart.getPaneCompositeIds();
	}

	async focusActivityBar(): Promise<void> {
		if (this.configurationService.getValue(LayoutSettings.ACTIVITY_BAR_LOCATION) === ActivityBarPosition.HIDDEN) {
			await this.configurationService.updateValue(LayoutSettings.ACTIVITY_BAR_LOCATION, this.getRememberedActivityBarVisiblePosition());

			this.onDidChangeActivityBarLocation();
		}

		if (this.shouldShowCompositeBar()) {
			this.focusCompositeBar();
		} else {
			if (!this.layoutService.isVisible(Parts.ACTIVITYBAR_PART)) {
				this.layoutService.setPartHidden(false, Parts.ACTIVITYBAR_PART);
			}

			this.activityBarPart.show(true);
		}
	}

	private registerActions(): void {
		const that = this;
		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: ToggleActivityBarVisibilityActionId,
					title: localize2('toggleActivityBar', "Toggle Activity Bar Visibility"),
				});
			}
			run(): Promise<void> {
				const value = that.configurationService.getValue(LayoutSettings.ACTIVITY_BAR_LOCATION) === ActivityBarPosition.HIDDEN ? that.getRememberedActivityBarVisiblePosition() : ActivityBarPosition.HIDDEN;
				return that.configurationService.updateValue(LayoutSettings.ACTIVITY_BAR_LOCATION, value);
			}
		}));
	}

	protected override createTitleLabel(parent: HTMLElement): ICompositeTitleLabel {
		const titleLabelParams = super.createTitleLabel(parent);
		const originalUpdateTitle = titleLabelParams.updateTitle;

		const style = getWindow(parent).document.createElement('style');
		style.textContent = `
			.hide-explorer-headers .pane-header h3.title { display: none !important; }
			.project-switcher-container { display: flex; align-items: center; width: 100%; height: 100%; }
			.project-switcher-icon { margin-left: 4px; color: inherit; }
		`;
		getWindow(parent).document.head.appendChild(style);

		this.switcherContainer = append(parent, $('div.project-switcher-container'));
		this.switcherContainer.style.display = 'none';

		this.projectSwitcher = append(this.switcherContainer, $('select.project-switcher')) as HTMLSelectElement;
		this.projectSwitcher.style.color = 'inherit';
		this.projectSwitcher.style.backgroundColor = 'transparent';
		this.projectSwitcher.style.border = 'none';
		this.projectSwitcher.style.fontWeight = 'bold';
		this.projectSwitcher.style.fontSize = '14px';
		this.projectSwitcher.style.width = 'auto';
		this.projectSwitcher.style.outline = 'none';
		this.projectSwitcher.style.cursor = 'pointer';

		const iconSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		iconSvg.setAttribute('fill', 'none');
		iconSvg.setAttribute('viewBox', '0 0 24 24');
		iconSvg.setAttribute('stroke-width', '1.5');
		iconSvg.setAttribute('stroke', 'currentColor');
		iconSvg.classList.add('project-switcher-icon');
		iconSvg.style.width = '16px';
		iconSvg.style.height = '16px';
		const iconPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		iconPath.setAttribute('stroke-linecap', 'round');
		iconPath.setAttribute('stroke-linejoin', 'round');
		iconPath.setAttribute('d', 'M8.25 15 12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9');
		iconSvg.appendChild(iconPath);
		this.switcherContainer.appendChild(iconSvg);

		this.loadProjects();

		this.projectSwitcher.addEventListener('change', (e) => {
			const target = e.target as HTMLSelectElement;
			const selectedPath = target.value;
			if (selectedPath) {
				// Get current workspace path
				const currentPath = this.workspaceContextService.getWorkspace().folders[0]?.uri.fsPath;
				// Only open if different from current project
				if (selectedPath !== currentPath) {
					const uri = URI.file(selectedPath);
					this.hostService.openWindow([{ folderUri: uri }], { forceNewWindow: true });
				}
			}
		});

		return {
			updateTitle: (id, title, keybinding) => {
				this.updateProjectSwitcherVisibility(id, title, keybinding, originalUpdateTitle);
			},
			updateStyles: () => {
				titleLabelParams.updateStyles();
			}
		};
	}

	private updateProjectSwitcherVisibility(id: string, title?: string, keybinding?: string, originalUpdateTitle?: (id: string, title: string, keybinding?: string) => void): void {
		if (!this.switcherContainer || !this.projectSwitcher) {
			return;
		}

		const isExplorer = id === 'workbench.view.explorer' || id.toLowerCase().includes('explorer');
		const activeComposite = this.getActiveComposite();
		console.log(`SidebarPart: updateVisibility(id: ${id}, isExplorer: ${isExplorer}, activeComposite: ${activeComposite?.getId()})`);

		// 실제 활성 뷰가 Explorer인지 확인
		const actuallyExplorer = activeComposite?.getId() === 'workbench.view.explorer';

		if (actuallyExplorer) {
			if (this.titleLabelElement) {
				this.titleLabelElement.style.display = 'none';
			}
			this.switcherContainer.style.display = 'flex';
			this.getContainer()?.classList.add('hide-explorer-headers');

			if (this.projectSwitcher.options.length === 0) {
				this.loadProjects();
			}
		} else {
			if (this.titleLabelElement) {
				this.titleLabelElement.style.display = '';
			}
			this.switcherContainer.style.display = 'none';
			this.getContainer()?.classList.remove('hide-explorer-headers');
			if (originalUpdateTitle && title !== undefined) {
				originalUpdateTitle(id, title, keybinding);
			}
		}
	}

	private async loadProjects(): Promise<void> {
		if (!this.projectSwitcher) {
			return;
		}
		const select = this.projectSwitcher;
		try {
			const userHome = await this.pathService.userHome();
			const projectsJsonUri = URI.joinPath(userHome, 'Documents', 'Gitbbon_Notes', 'projects.json');

			const exists = await this.fileService.exists(projectsJsonUri);

			if (!exists) {
				console.warn('SidebarPart: projects.json not found at', projectsJsonUri.toString());
				return;
			}

			const content = await this.fileService.readFile(projectsJsonUri);
			const jsonString = content.value.toString();

			let data;
			try {
				data = JSON.parse(jsonString);
			} catch (e) {
				console.error('SidebarPart: Failed to parse JSON', e);
				return;
			}

			if (data && Array.isArray(data.projects)) {
				// Clear existing options safely
				while (select.firstChild) {
					select.removeChild(select.firstChild);
				}

				// Get current workspace path to select it
				const currentPath = this.workspaceContextService.getWorkspace().folders[0]?.uri.fsPath;

				data.projects.forEach((p: IProject) => {
					const option = document.createElement('option');
					option.value = p.path;
					option.textContent = p.name;
					// Select current project
					if (currentPath && p.path === currentPath) {
						option.selected = true;
					}
					select.appendChild(option);
				});
			}

		} catch (error) {
			console.error('Failed to load projects.json', error);
		}
	}

	toJSON(): object {
		return {
			type: Parts.SIDEBAR_PART
		};
	}
}
