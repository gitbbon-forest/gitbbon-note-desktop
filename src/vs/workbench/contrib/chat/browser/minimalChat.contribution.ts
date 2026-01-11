/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// [Gitbbon Customization]
// This file is a custom replacement for the default chat contribution.
// It stubs out built-in chat services to disable Copilot Chat and ensure 'gitbbon-chat' is prioritized.
// Original: src/vs/workbench/contrib/chat/browser/chat.contribution.ts

import { Emitter } from '../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Event } from '../../../../base/common/event.js';

// Interfaces
import { IChatAgentService, IChatAgentData, IChatAgent } from '../common/chatAgents.js';
import { IChatWidgetService, IChatWidget } from './chat.js';
import { ILanguageModelToolsService, ToolSet } from '../common/languageModelToolsService.js';
import { IChatContextPickService } from './chatContextPickService.js';
import { IChatService } from '../common/chatService.js';
import { ILanguageModelsService } from '../common/languageModels.js';
import { IChatSessionsService } from '../common/chatSessionsService.js';
import { IChatEditingService } from '../common/chatEditingService.js';
import { IChatOutputRendererService } from './chatOutputItemRenderer.js';
import { ILanguageModelIgnoredFilesService } from '../common/ignoredFiles.js';
import { IPromptsService } from '../common/promptSyntax/service/promptsService.js';
import { IMcpRegistry } from '../../mcp/common/mcpRegistryTypes.js';
import { IMcpService } from '../../mcp/common/mcpTypes.js';

// Create Decorators for services where we don't have the explicit definition file handy or want to be generic
// Note: We are importing most real decorators now to ensure type safety and correct DI IDs.
// For those we can't find or are simple, we generate them.
const IChatSlashCommandService = createDecorator<any>('chatSlashCommandService');
const IChatAgentNameService = createDecorator<any>('chatAgentNameService');
const ICodeMapperService = createDecorator<any>('codeMapperService');


// Mock IChatAgentService
class MockChatAgentService extends Disposable implements IChatAgentService {
	_serviceBrand: undefined;
	readonly onDidChangeAgents = new Emitter<IChatAgent | undefined>().event;
	readonly hasToolsAgent = false;

	registerAgent(id: string, data: IChatAgentData): IDisposable { return Disposable.None; }
	registerAgentImplementation(id: string, agent: any): IDisposable { return Disposable.None; }
	registerDynamicAgent(data: IChatAgentData, agentImpl: any): IDisposable { return Disposable.None; }
	registerAgentCompletionProvider(id: string, provider: any): IDisposable { return Disposable.None; }
	getAgentCompletionItems(id: string, query: string, token: any): Promise<any[]> { return Promise.resolve([]); }
	registerChatParticipantDetectionProvider(handle: number, provider: any): IDisposable { return Disposable.None; }
	detectAgentOrCommand(request: any, history: any, options: any, token: any): Promise<any> { return Promise.resolve(undefined); }
	hasChatParticipantDetectionProviders(): boolean { return false; }
	invokeAgent(agent: string, request: any, progress: any, history: any, token: any): Promise<any> { return Promise.resolve({}); }
	setRequestTools(agent: string, requestId: string, tools: any): void { }
	getFollowups(id: string, request: any, result: any, history: any, token: any): Promise<any[]> { return Promise.resolve([]); }
	getChatTitle(id: string, history: any, token: any): Promise<string | undefined> { return Promise.resolve(undefined); }
	getChatSummary(id: string, history: any, token: any): Promise<string | undefined> { return Promise.resolve(undefined); }
	getAgent(id: string, includeDisabled?: boolean): IChatAgentData | undefined {
		// [Gitbbon Customization] Return a mock agent to satisfy MainThreadChatAgents2 validation and silence "chatParticipant must be declared" errors.
		return {
			id: id,
			name: id,
			extensionId: { value: 'mock-extension', id: 'mock-extension' } as any,
			extensionPublisherId: 'mock-publisher',
			extensionDisplayName: 'Mock Extension',
			extensionVersion: '0.0.0',
			metadata: {},
			slashCommands: [],
			locations: [],
			modes: [],
			disambiguation: []
		} as any;
	}
	getAgentByFullyQualifiedId(id: string): IChatAgentData | undefined { return undefined; }
	getAgents(): IChatAgentData[] { return []; }
	getActivatedAgents(): Array<IChatAgent> { return []; }
	getAgentsByName(name: string): IChatAgentData[] { return []; }
	agentHasDupeName(id: string): boolean { return false; }

	getDefaultAgent(location: any, mode?: any): IChatAgent | undefined { return undefined; }
	getContributedDefaultAgent(location: any): IChatAgentData | undefined { return undefined; }
	updateAgent(id: string, updateMetadata: any): void { }
}

// Mock IChatWidgetService
class MockChatWidgetService implements IChatWidgetService {
	_serviceBrand: undefined;
	readonly lastFocusedWidget: IChatWidget | undefined = undefined;
	readonly onDidAddWidget = new Emitter<IChatWidget>().event;

	reveal(widget: IChatWidget, preserveFocus?: boolean): Promise<boolean> { return Promise.resolve(false); }
	revealWidget(preserveFocus?: boolean): Promise<IChatWidget | undefined> { return Promise.resolve(undefined); }
	getAllWidgets(): ReadonlyArray<IChatWidget> { return []; }
	getWidgetByInputUri(uri: any): IChatWidget | undefined { return undefined; }
	openSession(sessionResource: any, target?: any, options?: any): Promise<IChatWidget | undefined> { return Promise.resolve(undefined); }
	getWidgetBySessionResource(sessionResource: any): IChatWidget | undefined { return undefined; }
	getWidgetsByLocations(location: any): ReadonlyArray<IChatWidget> { return []; }
	register(newWidget: IChatWidget): IDisposable { return Disposable.None; }
}

// Mock ToolSet for ILanguageModelToolsService
class MockToolSet extends ToolSet {
	constructor() {
		super(
			'mock',
			'mock',
			{ id: 'codicon/mock' } as any,
			{ type: 'internal', label: 'Mock' },
			'Mock ToolSet',
			[]
		);
	}

	// Override methods to do nothing or return disposables as needed
	override addTool(data: any, tx?: any): IDisposable { return Disposable.None; }
	override addToolSet(toolSet: any, tx?: any): IDisposable { return Disposable.None; }
	override getTools(r?: any): Iterable<any> { return []; }
}

// Mock ILanguageModelToolsService
class MockLanguageModelToolsService implements ILanguageModelToolsService {
	_serviceBrand: undefined;

	readonly vscodeToolSet: ToolSet = new MockToolSet() as any;
	readonly executeToolSet: ToolSet = new MockToolSet() as any;
	readonly readToolSet: ToolSet = new MockToolSet() as any;

	readonly onDidChangeTools = new Emitter<void>().event;
	readonly onDidPrepareToolCallBecomeUnresponsive = new Emitter<{ readonly sessionId: string; readonly toolData: any }>().event;

	registerToolData(toolData: any): IDisposable { return Disposable.None; }
	registerToolImplementation(id: string, tool: any): IDisposable { return Disposable.None; }
	registerTool(toolData: any, tool: any): IDisposable { return Disposable.None; }
	getTools(): Iterable<any> { return []; }

	readonly toolsObservable = observableValue('tools', []);

	getTool(id: string): any { return undefined; }
	getToolByName(name: string, includeDisabled?: boolean): any { return undefined; }
	invokeTool(invocation: any, countTokens: any, token: any): Promise<any> { return Promise.resolve({}); }
	cancelToolCallsForRequest(requestId: string): void { }
	flushToolUpdates(): void { }

	readonly toolSets = observableValue('toolSets', []);

	getToolSet(id: string): ToolSet | undefined { return undefined; }
	getToolSetByName(name: string): ToolSet | undefined { return undefined; }
	createToolSet(source: any, id: string, referenceName: string, options?: any): any { return { dispose: () => { } } as any; }

	getFullReferenceNames(): Iterable<string> { return []; }
	getFullReferenceName(tool: any, toolSet?: any): string { return ''; }
	getToolByFullReferenceName(fullReferenceName: string): any { return undefined; }
	getDeprecatedFullReferenceNames(): Map<string, Set<string>> { return new Map(); }

	toToolAndToolSetEnablementMap(fullReferenceNames: readonly string[], target: string | undefined): any { return new Map(); }
	toFullReferenceNames(map: any): string[] { return []; }
	toToolReferences(variableReferences: readonly any[]): any[] { return []; }
}

// Mock IChatContextPickService
class MockChatContextPickService implements IChatContextPickService {
	_serviceBrand: undefined;
	items: Iterable<any> = [];
	registerChatContextItem(item: any): IDisposable { return Disposable.None; }
}

// Mock IChatService
class MockChatService implements IChatService {
	_serviceBrand: undefined;
	transferredSessionData: any = undefined;
	readonly onDidSubmitRequest = new Emitter<{ readonly chatSessionResource: URI }>().event;
	readonly chatModels = observableValue('chatModels', []);

	isEnabled(location: any): boolean { return false; }
	hasSessions(): boolean { return false; }
	startSession(location: any, options?: any): any { return undefined; }
	getSession(sessionResource: any): any { return undefined; }
	getActiveSessionReference(sessionResource: any): any { return undefined; }
	getOrRestoreSession(sessionResource: any): Promise<any> { return Promise.resolve(undefined); }
	getPersistedSessionTitle(sessionResource: any): string | undefined { return undefined; }
	isPersistedSessionEmpty(sessionResource: any): boolean { return true; }
	loadSessionFromContent(data: any): any { return undefined; }
	loadSessionForResource(resource: any, location: any, token: any): Promise<any> { return Promise.resolve(undefined); }
	readonly editingSessions: any[] = [];
	getChatSessionFromInternalUri(sessionResource: any): any { return undefined; }
	sendRequest(sessionResource: any, message: string, options?: any): Promise<any> { return Promise.resolve(undefined); }
	setTitle(sessionResource: any, title: string): void { }
	appendProgress(request: any, progress: any): void { }
	resendRequest(request: any, options?: any): Promise<void> { return Promise.resolve(); }
	adoptRequest(sessionResource: any, request: any): Promise<void> { return Promise.resolve(); }
	removeRequest(sessionResource: any, requestId: string): Promise<void> { return Promise.resolve(); }
	cancelCurrentRequestForSession(sessionResource: any): void { }
	addCompleteRequest(sessionResource: any, message: any, variableData: any, attempt: any, response: any): void { }
	setChatSessionTitle(sessionResource: any, title: string): void { }
	getLocalSessionHistory(): Promise<any[]> { return Promise.resolve([]); }
	clearAllHistoryEntries(): Promise<void> { return Promise.resolve(); }
	removeHistoryEntry(sessionResource: any): Promise<void> { return Promise.resolve(); }
	getChatStorageFolder(): URI { return URI.file('/tmp/mock-chat-storage'); } // Safe fallback
	logChatIndex(): void { }
	getLiveSessionItems(): Promise<any[]> { return Promise.resolve([]); }
	getHistorySessionItems(): Promise<any[]> { return Promise.resolve([]); }
	getMetadataForSession(sessionResource: any): Promise<any> { return Promise.resolve(undefined); }
	readonly onDidPerformUserAction = new Emitter<any>().event;
	notifyUserAction(event: any): void { }
	readonly onDidDisposeSession = new Emitter<any>().event;
	transferChatSession(transferredSessionData: any, toWorkspace: any): void { }
	activateDefaultAgent(location: any): Promise<void> { return Promise.resolve(); }
	readonly edits2Enabled: boolean = false;
	readonly requestInProgressObs = observableValue('requestInProgress', false);
	setSaveModelsEnabled(enabled: boolean): void { }
	waitForModelDisposals(): Promise<void> { return Promise.resolve(); }
}

// Mock ILanguageModelsService
class MockLanguageModelsService implements ILanguageModelsService {
	_serviceBrand: undefined;
	readonly onDidChangeLanguageModels = new Emitter<string>().event;
	updateModelPickerPreference(modelIdentifier: string, showInModelPicker: boolean): void { }
	getLanguageModelIds(): string[] { return []; }
	getVendors(): any[] { return []; }
	lookupLanguageModel(modelId: string): any { return undefined; }
	selectLanguageModels(selector: any, allowPromptingUser?: boolean): Promise<string[]> { return Promise.resolve([]); }
	registerLanguageModelProvider(vendor: string, provider: any): IDisposable { return Disposable.None; }
	sendChatRequest(modelId: string, from: any, messages: any[], options: any, token: any): Promise<any> { return Promise.resolve({}); }
	computeTokenLength(modelId: string, message: any, token: any): Promise<number> { return Promise.resolve(0); }
}

// Mock IChatSessionsService (Refined)
class MockChatSessionsService implements IChatSessionsService {
	_serviceBrand: undefined;
	readonly onDidChangeItemsProviders = Event.None;
	readonly onDidChangeSessionItems = Event.None;
	readonly onDidChangeAvailability = Event.None;
	readonly onDidChangeInProgress = Event.None;
	readonly onDidChangeContentProviderSchemes = Event.None;
	readonly onDidChangeSessionOptions = Event.None;

	getChatSessionContribution(chatSessionType: string) { return undefined; }
	registerChatSessionItemProvider(provider: any) { return Disposable.None; }
	activateChatSessionItemProvider(chatSessionType: string) { return Promise.resolve(undefined); }
	getAllChatSessionItemProviders() { return []; }
	getAllChatSessionContributions() { return []; }
	getIconForSessionType(type: string) { return undefined; }
	getWelcomeTitleForSessionType(type: string) { return undefined; }
	getWelcomeMessageForSessionType(type: string) { return undefined; }
	getInputPlaceholderForSessionType(type: string) { return undefined; }
	getAllChatSessionItems(token: any) { return Promise.resolve([]); }
	reportInProgress(type: string, count: number) { }
	getInProgress() { return []; }
	notifySessionItemsChanged(type: string) { }
	getContentProviderSchemes() { return []; }
	registerChatSessionContentProvider(scheme: string, provider: any) { return Disposable.None; }
	canResolveChatSession(resource: any) { return Promise.resolve(false); }
	getOrCreateChatSession(resource: any, token: any) { return Promise.resolve(undefined as any); }
	hasAnySessionOptions(resource: any) { return false; }
	getSessionOption(resource: any, optionId: string) { return undefined; }
	setSessionOption(resource: any, optionId: string, value: any) { return false; }
	getCapabilitiesForSessionType(type: string) { return undefined; }
	getOptionGroupsForSessionType(type: string) { return undefined; }
	setOptionGroupsForSessionType(type: string, handle: number, groups: any) { }
	setOptionsChangeCallback(callback: any) { } // REQUIRED by MainThreadChatSessions
	notifySessionOptionsChange(resource: any, updates: any) { return Promise.resolve(); }
	setEditableSession(resource: any, data: any) { return Promise.resolve(); }
	getEditableData(resource: any) { return undefined; }
	isEditable(resource: any) { return false; }
	registerChatModelChangeListeners(chatService: any, type: string, onChange: any) { return Disposable.None; }
	getSessionDescription(model: any) { return undefined; }
}

// Mock IMcpRegistry (Refined)
class MockMcpRegistry {
	_serviceBrand: undefined;
	readonly onDidChangeInputs = Event.None;
	readonly collections = observableValue('collections', []);
	readonly delegates = observableValue('delegates', []);
	readonly lazyCollectionState = observableValue('lazy', { state: 'ready', collections: [] } as any);

	getServerDefinition(c: any, d: any) { return observableValue('def', { server: undefined, collection: undefined }); }
	discoverCollections() { return Promise.resolve([]); }
	registerDelegate(delegate: any) { return Disposable.None; } // REQUIRED by MainThreadMcp
	registerCollection(collection: any) { return Disposable.None; }
	clearSavedInputs(undo: any, id: any) { return Promise.resolve(); }
	editSavedInput(id: any, folder: any, section: any, target: any) { return Promise.resolve(); }
	setSavedInput(id: any, target: any, value: any) { return Promise.resolve(); }
	getSavedInputs(scope: any) { return Promise.resolve({}); }
	resolveConnection(opts: any) { return Promise.resolve(undefined); }
}

// Mock IMcpService (New - Fixes SlashCommandCompletions crash)
class MockMcpService implements IMcpService {
	_serviceBrand: undefined;
	readonly servers = observableValue('servers', []);
	readonly lazyCollectionState = observableValue('lazyCollectionState', { state: 2 /* AllKnown */, collections: [] });

	resetCaches() { }
	resetTrust() { }
	autostart(token: any) { return observableValue('autostart', { working: false, starting: [], serversRequiringInteraction: [] }); }
	cancelAutostart() { }
	activateCollections() { return Promise.resolve(); }
	dispose() { }
}

// Mock ILanguageModelIgnoredFilesService (New)
class MockLanguageModelIgnoredFilesService implements ILanguageModelIgnoredFilesService {
	_serviceBrand: undefined;
	fileIsIgnored(uri: any, token: any) { return Promise.resolve(false); }
	registerIgnoredFileProvider(provider: any) { return Disposable.None; }
}

// Mock IPromptsService (New)
class MockPromptsService implements IPromptsService {
	_serviceBrand: undefined;
	readonly onDidChangeSlashCommands = Event.None;
	readonly onDidChangeCustomAgents = Event.None;

	getParsedPromptFile(textModel: any) { return undefined as any; }
	listPromptFiles(type: any, token: any) { return Promise.resolve([]); }
	listPromptFilesForStorage(type: any, storage: any, token: any) { return Promise.resolve([]); }
	getSourceFolders(type: any) { return []; }
	isValidSlashCommandName(name: string) { return false; }
	resolvePromptSlashCommand(command: string, token: any) { return Promise.resolve(undefined); }
	getPromptSlashCommands(token: any) { return Promise.resolve([]); }
	getPromptSlashCommandName(uri: any, token: any) { return Promise.resolve(''); }
	getCustomAgents(token: any) { return Promise.resolve([]); }
	parseNew(uri: any, token: any) { return Promise.resolve(undefined as any); }
	registerContributedFile(type: any, name: string, description: string, uri: any, extension: any) { return Disposable.None; }
	getPromptLocationLabel(path: any) { return ''; }
	findAgentMDsInWorkspace(token: any) { return Promise.resolve([]); }
	listAgentMDs(token: any, includeNested: boolean) { return Promise.resolve([]); }
	listCopilotInstructionsMDs(token: any) { return Promise.resolve([]); }
	getAgentFileURIFromModeFile(oldURI: any) { return undefined; }
	getDisabledPromptFiles(type: any) { return new Set() as any; }
	setDisabledPromptFiles(type: any, uris: any) { }
	registerCustomAgentsProvider(extension: any, provider: any) { return Disposable.None; }
	findClaudeSkills(token: any) { return Promise.resolve([]); }
	dispose(): void { }
}


// Catch-all Mock
class MockGenericService {
	_serviceBrand: undefined;
	[key: string]: any;
}


// Register Mocks
// Core Chat
registerSingleton(IChatAgentService, MockChatAgentService, InstantiationType.Delayed);
registerSingleton(IChatWidgetService, MockChatWidgetService, InstantiationType.Delayed);
registerSingleton(ILanguageModelToolsService, MockLanguageModelToolsService, InstantiationType.Delayed);
registerSingleton(IChatContextPickService, MockChatContextPickService, InstantiationType.Delayed);
registerSingleton(IChatService, MockChatService, InstantiationType.Delayed);
registerSingleton(ILanguageModelsService, MockLanguageModelsService, InstantiationType.Delayed);

// Secondary Chat Services
registerSingleton(IChatSessionsService, MockChatSessionsService, InstantiationType.Delayed); // UPDATED
registerSingleton(IChatEditingService, MockGenericService, InstantiationType.Delayed);
registerSingleton(IChatOutputRendererService, MockGenericService, InstantiationType.Delayed);

// Others required to prevent runtime errors
registerSingleton(ILanguageModelIgnoredFilesService, MockLanguageModelIgnoredFilesService, InstantiationType.Delayed); // NEW
registerSingleton(IPromptsService, MockPromptsService, InstantiationType.Delayed); // NEW
registerSingleton(IMcpRegistry, MockMcpRegistry, InstantiationType.Delayed); // UPDATED
registerSingleton(IMcpService, MockMcpService, InstantiationType.Delayed); // NEW - Fixes runtime error

registerSingleton(IChatSlashCommandService, MockGenericService, InstantiationType.Delayed);
registerSingleton(IChatAgentNameService, MockGenericService, InstantiationType.Delayed);
registerSingleton(ICodeMapperService, MockGenericService, InstantiationType.Delayed);
