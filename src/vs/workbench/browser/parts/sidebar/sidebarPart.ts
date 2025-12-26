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
import { IQuickInputService, IQuickPickItem, QuickPickInput } from '../../../../platform/quickinput/common/quickInput.js';

import { IFileService } from '../../../../platform/files/common/files.js';
import { IPathService } from '../../../services/path/common/pathService.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { ICompositeTitleLabel } from '../compositePart.js';
import { append, $, getWindow } from '../../../../base/browser/dom.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';

interface IProject {
	name: string;
	path: string;
	lastModified?: string;
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
		@IQuickInputService private readonly quickInputService: IQuickInputService,
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
			.project-switcher-container { display: flex; align-items: center; width: 100%; height: 100%; margin-left: -8px; }
			.project-switcher-icon { margin-right: 4px; flex-shrink: 0; color: inherit; }
			.project-switcher { margin-left: 0; }
		`;
		getWindow(parent).document.head.appendChild(style);

		this.switcherContainer = append(parent, $('div.project-switcher-container'));
		this.switcherContainer.style.display = 'none';

		// SVG 아이콘 (왼쪽에 배치)
		const iconSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		iconSvg.setAttribute('fill', 'none');
		iconSvg.setAttribute('viewBox', '0 0 24 24');
		iconSvg.setAttribute('stroke-width', '1.5');
		iconSvg.setAttribute('stroke', 'currentColor');
		iconSvg.classList.add('project-switcher-icon');
		iconSvg.style.width = '16px';
		iconSvg.style.height = '16px';
		iconSvg.style.flexShrink = '0';
		const iconPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		iconPath.setAttribute('stroke-linecap', 'round');
		iconPath.setAttribute('stroke-linejoin', 'round');
		iconPath.setAttribute('d', 'M8.25 15 12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9');
		iconSvg.appendChild(iconPath);
		this.switcherContainer.appendChild(iconSvg);

		// 셀렉트박스 (아이콘 오른쪽에 배치)
		this.projectSwitcher = append(this.switcherContainer, $('select.project-switcher')) as HTMLSelectElement;
		this.projectSwitcher.style.color = 'inherit';
		this.projectSwitcher.style.backgroundColor = 'transparent';
		this.projectSwitcher.style.border = 'none';
		this.projectSwitcher.style.fontWeight = 'bold';
		this.projectSwitcher.style.fontSize = '14px';
		this.projectSwitcher.style.width = 'auto';
		this.projectSwitcher.style.outline = 'none';
		this.projectSwitcher.style.cursor = 'pointer';
		this.projectSwitcher.style.marginLeft = '4px';

		this.loadProjects();

		this.projectSwitcher.addEventListener('change', (e) => {
			const target = e.target as HTMLSelectElement;
			const selectedValue = target.value;

			// "Manage projects..." 옵션 선택 시 대화상자 열기
			if (selectedValue === '__manage__') {
				this.showProjectManagementDialog();
				// 이전 선택값으로 복원
				const currentPath = this.workspaceContextService.getWorkspace().folders[0]?.uri.fsPath;
				if (currentPath) {
					target.value = currentPath;
				}
				return;
			}

			if (selectedValue) {
				// Get current workspace path
				const currentPath = this.workspaceContextService.getWorkspace().folders[0]?.uri.fsPath;
				// Only open if different from current project
				if (selectedValue !== currentPath) {
					const uri = URI.file(selectedValue);
					this.hostService.openWindow([{ folderUri: uri }], { forceNewWindow: true });
					// Reset select to current project (since we opened a new window)
					if (currentPath) {
						target.value = currentPath;
					}
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
			const gitbbonNotesUri = URI.joinPath(userHome, 'Documents', 'Gitbbon_Notes');

			// Gitbbon_Notes 디렉토리 존재 확인
			const dirExists = await this.fileService.exists(gitbbonNotesUri);
			if (!dirExists) {
				console.warn('[SidebarPart] Gitbbon_Notes directory not found');
				return;
			}

			// 디렉토리 스캔
			const stat = await this.fileService.resolve(gitbbonNotesUri);
			if (!stat.children) {
				console.log('[SidebarPart] No subdirectories in Gitbbon_Notes');
				return;
			}

			// .git 폴더가 있는 디렉토리만 프로젝트로 인식
			const projects: IProject[] = [];
			for (const child of stat.children) {
				if (!child.isDirectory) {
					continue;
				}

				const gitUri = URI.joinPath(child.resource, '.git');
				const isGitRepo = await this.fileService.exists(gitUri);

				if (isGitRepo) {
					// .gitbbon.json에서 설정 읽기
					const config = await this.readProjectConfig(child.resource);
					const folderName = child.name;

					projects.push({
						name: config?.name || folderName,
						path: child.resource.fsPath
					});
				}
			}

			console.log(`[SidebarPart] Found ${projects.length} projects`);

			// 셀렉트박스 업데이트
			while (select.firstChild) {
				select.removeChild(select.firstChild);
			}

			const currentPath = this.workspaceContextService.getWorkspace().folders[0]?.uri.fsPath;

			for (const p of projects) {
				const option = document.createElement('option');
				option.value = p.path;
				option.textContent = p.name;
				if (currentPath && p.path === currentPath) {
					option.selected = true;
				}
				select.appendChild(option);
			}

			// "Manage projects..." 옵션 추가
			const separator = document.createElement('option');
			separator.disabled = true;
			separator.textContent = '──────────';
			select.appendChild(separator);

			const manageOption = document.createElement('option');
			manageOption.value = '__manage__';
			manageOption.textContent = 'Manage projects...';
			select.appendChild(manageOption);

		} catch (error) {
			console.error('[SidebarPart] Failed to scan projects:', error);
		}
	}

	/**
	 * 프로젝트 설정 파일(.gitbbon.json) 읽기
	 */
	private async readProjectConfig(projectUri: URI): Promise<{ name?: string; description?: string } | null> {
		try {
			const configUri = URI.joinPath(projectUri, '.gitbbon.json');
			const exists = await this.fileService.exists(configUri);

			if (!exists) {
				return null;
			}

			const content = await this.fileService.readFile(configUri);
			const config = JSON.parse(content.value.toString());
			return config;
		} catch (error) {
			console.warn('[SidebarPart] Failed to read .gitbbon.json:', error);
			return null;
		}
	}

	/**
	 * 프로젝트 설정 파일(.gitbbon.json) 쓰기
	 */
	private async writeProjectConfig(projectPath: string, config: { name?: string; description?: string }): Promise<void> {
		try {
			const configUri = URI.joinPath(URI.file(projectPath), '.gitbbon.json');

			// 기존 설정 읽어서 병합
			let existingConfig: Record<string, unknown> = {};
			const exists = await this.fileService.exists(configUri);
			if (exists) {
				const content = await this.fileService.readFile(configUri);
				existingConfig = JSON.parse(content.value.toString());
			}

			const newConfig = { ...existingConfig, ...config };
			const jsonContent = JSON.stringify(newConfig, null, 2);

			await this.fileService.writeFile(configUri, VSBuffer.fromString(jsonContent));
			console.log(`[SidebarPart] Saved .gitbbon.json for ${projectPath}`);
		} catch (error) {
			console.error('[SidebarPart] Failed to write .gitbbon.json:', error);
		}
	}

	/**
	 * 프로젝트 관리 대화상자 표시
	 * 기능: 목록 표시, 열기, 추가, 삭제, 이름 변경
	 */
	private async showProjectManagementDialog(): Promise<void> {
		// 파일시스템 스캔으로 프로젝트 목록 로드
		const userHome = await this.pathService.userHome();
		const gitbbonNotesUri = URI.joinPath(userHome, 'Documents', 'Gitbbon_Notes');

		const projects: IProject[] = [];
		try {
			const dirExists = await this.fileService.exists(gitbbonNotesUri);
			if (dirExists) {
				const stat = await this.fileService.resolve(gitbbonNotesUri);
				if (stat.children) {
					for (const child of stat.children) {
						if (!child.isDirectory) {
							continue;
						}

						const gitUri = URI.joinPath(child.resource, '.git');
						const isGitRepo = await this.fileService.exists(gitUri);

						if (isGitRepo) {
							const config = await this.readProjectConfig(child.resource);
							projects.push({
								name: config?.name || child.name,
								path: child.resource.fsPath
							});
						}
					}
				}
			}
		} catch (error) {
			console.error('[SidebarPart] Failed to load projects for management dialog', error);
		}

		// 현재 프로젝트 경로
		const currentPath = this.workspaceContextService.getWorkspace().folders[0]?.uri.fsPath;

		// QuickPick 아이템 구성
		const items: QuickPickInput<IQuickPickItem>[] = [];

		// 액션 메뉴
		items.push({ type: 'separator', label: 'Actions' });

		items.push({
			id: 'action:add',
			label: '$(add) Add New Project',
			description: 'Create or add a new project'
		});

		// 프로젝트 목록
		items.push({ type: 'separator', label: 'Projects' });

		for (const project of projects) {
			const isCurrent = project.path === currentPath;

			items.push({
				id: `project:${project.path}`,
				label: `${isCurrent ? '$(check) ' : ''}${project.name}`,
				description: isCurrent ? 'Current' : '',
				detail: project.path,
				buttons: [
					{
						iconClass: 'codicon-edit',
						tooltip: 'Rename'
					},
					{
						iconClass: 'codicon-trash',
						tooltip: 'Delete'
					}
				]
			});
		}

		// QuickPick 표시
		const quickPick = this.quickInputService.createQuickPick<IQuickPickItem>();
		quickPick.title = 'Project Manager';
		quickPick.placeholder = 'Select a project to open or an action';
		quickPick.items = items as readonly IQuickPickItem[];
		quickPick.matchOnDescription = true;
		quickPick.matchOnDetail = true;

		quickPick.onDidAccept(() => {
			const selected = quickPick.selectedItems[0];
			if (selected) {
				const id = (selected as IQuickPickItem).id;
				if (id === 'action:add') {
					// TODO: 프로젝트 추가 로직 구현
					console.log('[SidebarPart] Add project action triggered');
				} else if (id?.startsWith('project:')) {
					const projectPath = id.substring('project:'.length);
					if (projectPath !== currentPath) {
						const uri = URI.file(projectPath);
						this.hostService.openWindow([{ folderUri: uri }], { forceNewWindow: true });
					}
				}
			}
			quickPick.hide();
		});

		quickPick.onDidTriggerItemButton(async e => {
			const id = (e.item as IQuickPickItem).id;
			if (!id?.startsWith('project:')) {
				return;
			}
			const projectPath = id.substring('project:'.length);
			const buttonClass = e.button.iconClass;

			if (buttonClass?.includes('edit')) {
				// 이름 변경 로직
				quickPick.hide();

				// 현재 프로젝트 이름 찾기
				const project = projects.find(p => p.path === projectPath);
				if (!project) {
					return;
				}

				// InputBox로 새 이름 입력
				const inputBox = this.quickInputService.createInputBox();
				inputBox.title = 'Rename Project';
				inputBox.placeholder = 'Enter new project name';
				inputBox.value = project.name;

				inputBox.onDidAccept(async () => {
					const newName = inputBox.value.trim();
					if (newName && newName !== project.name) {
						// projects.json 업데이트
						await this.renameProject(projectPath, newName);
						// 프로젝트 스위처 새로고침
						await this.loadProjects();
					}
					inputBox.hide();
				});

				inputBox.onDidHide(() => {
					inputBox.dispose();
				});

				inputBox.show();
			} else if (buttonClass?.includes('trash')) {
				// 삭제 로직 구현
				quickPick.hide();

				const project = projects.find(p => p.path === projectPath);
				if (!project) {
					return;
				}

				// 현재 열린 프로젝트는 삭제 불가
				if (projectPath === currentPath) {
					const { window: vsWindow } = await import('vscode');
					vsWindow.showWarningMessage('현재 열려있는 프로젝트는 삭제할 수 없습니다. 다른 프로젝트를 연 후 시도해 주세요.');
					return;
				}

				// 원격 저장소 존재 여부 확인 (간단히 .git/config에서 remote origin 확인)
				let hasRemote = false;
				try {
					const gitConfigUri = URI.joinPath(URI.file(projectPath), '.git', 'config');
					const configExists = await this.fileService.exists(gitConfigUri);
					if (configExists) {
						const content = await this.fileService.readFile(gitConfigUri);
						hasRemote = content.value.toString().includes('[remote "origin"]');
					}
				} catch {
					// 무시
				}

				// 삭제 범위 선택 (원격 저장소가 있는 경우에만)
				let deleteRemote = false;
				if (hasRemote) {
					const { window: vsWindow } = await import('vscode');
					const remoteChoice = await vsWindow.showQuickPick([
						{ label: '$(folder) 로컬만 삭제', description: '원격 저장소는 유지됩니다', value: false },
						{ label: '$(cloud) 로컬 + 원격 삭제', description: '⚠️ GitHub 저장소도 삭제됩니다', value: true }
					], {
						placeHolder: '원격 저장소도 함께 삭제할까요?',
						title: '삭제 범위 선택'
					});

					if (remoteChoice === undefined) {
						return; // 취소됨
					}
					deleteRemote = remoteChoice.value;
				}

				// 최종 확인
				const { window: vsWindow } = await import('vscode');
				const confirmMessage = deleteRemote
					? `'${project.name}' 프로젝트와 GitHub 저장소를 삭제합니다. 이 작업은 되돌릴 수 없습니다!`
					: `'${project.name}' 프로젝트를 삭제합니다. 이 작업은 되돌릴 수 없습니다!`;

				const confirm = await vsWindow.showWarningMessage(
					confirmMessage,
					{ modal: true },
					'삭제'
				);

				if (confirm !== '삭제') {
					return;
				}

				// 삭제 실행 (gitbbon-manager 익스텐션 명령어 호출)
				try {
					const { commands } = await import('vscode');
					const result = await commands.executeCommand('gitbbon.manager.deleteProject', {
						projectPath: projectPath,
						deleteRemote: deleteRemote
					}) as { success: boolean; message: string } | undefined;

					if (result?.success) {
						vsWindow.showInformationMessage(`'${project.name}' 프로젝트가 삭제되었습니다.`);
						// 프로젝트 스위처 새로고침
						await this.loadProjects();
					} else {
						vsWindow.showErrorMessage(`프로젝트 삭제 실패: ${result?.message || '알 수 없는 오류'}`);
					}
				} catch (error) {
					vsWindow.showErrorMessage(`프로젝트 삭제 실패: ${error}`);
				}
			}
		});

		quickPick.onDidHide(() => {
			quickPick.dispose();
		});

		quickPick.show();
	}

	/**
	 * 프로젝트 이름 변경 (.gitbbon.json 파일 업데이트)
	 */
	private async renameProject(projectPath: string, newName: string): Promise<void> {
		await this.writeProjectConfig(projectPath, { name: newName });
		console.log(`[SidebarPart] Project renamed: ${projectPath} -> ${newName}`);
	}

	toJSON(): object {
		return {
			type: Parts.SIDEBAR_PART
		};
	}
}
