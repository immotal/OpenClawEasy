import { LitElement } from "lit";
import { customElement } from "lit/decorators.js";
import type { EventLogEntry } from "./app-events.ts";
import type { AppViewState } from "./app-view-state.ts";
import type { DevicePairingList } from "./controllers/devices.ts";
import type { ExecApprovalRequest } from "./controllers/exec-approval.ts";
import type { ExecApprovalsFile, ExecApprovalsSnapshot } from "./controllers/exec-approvals.ts";
import type { SkillMessage } from "./controllers/skills.ts";
import type { GatewayBrowserClient, GatewayHelloOk } from "./gateway.ts";
import type { Tab } from "./navigation.ts";
import type { ResolvedTheme, ThemeMode } from "./theme.ts";
import type {
  AgentsListResult,
  AgentsFilesListResult,
  AgentIdentityResult,
  ConfigSnapshot,
  ConfigUiHints,
  CronJob,
  CronRunLogEntry,
  CronStatus,
  HealthSnapshot,
  LogEntry,
  LogLevel,
  PresenceEntry,
  ChannelsStatusSnapshot,
  SessionsListResult,
  SkillStatusReport,
  StatusSummary,
  NostrProfile,
} from "./types.ts";
import type { NostrProfileFormState } from "./views/channels.nostr-profile-form.ts";
import {
  handleChannelConfigReload as handleChannelConfigReloadInternal,
  handleChannelConfigSave as handleChannelConfigSaveInternal,
  handleNostrProfileCancel as handleNostrProfileCancelInternal,
  handleNostrProfileEdit as handleNostrProfileEditInternal,
  handleNostrProfileFieldChange as handleNostrProfileFieldChangeInternal,
  handleNostrProfileImport as handleNostrProfileImportInternal,
  handleNostrProfileSave as handleNostrProfileSaveInternal,
  handleNostrProfileToggleAdvanced as handleNostrProfileToggleAdvancedInternal,
  handleWhatsAppLogout as handleWhatsAppLogoutInternal,
  handleWhatsAppStart as handleWhatsAppStartInternal,
  handleWhatsAppWait as handleWhatsAppWaitInternal,
} from "./app-channels.ts";
import {
  handleAbortChat as handleAbortChatInternal,
  handleSendChat as handleSendChatInternal,
  isSharePromptCountableInput,
  removeQueuedMessage as removeQueuedMessageInternal,
} from "./app-chat.ts";
import { DEFAULT_CRON_FORM, DEFAULT_LOG_LEVEL_FILTERS } from "./app-defaults.ts";
import { connectGateway as connectGatewayInternal } from "./app-gateway.ts";
import {
  handleConnected,
  handleDisconnected,
  handleFirstUpdated,
  handleUpdated,
} from "./app-lifecycle.ts";
import { renderApp } from "./app-render.ts";
import {
  exportLogs as exportLogsInternal,
  handleChatScroll as handleChatScrollInternal,
  handleLogsScroll as handleLogsScrollInternal,
  resetChatScroll as resetChatScrollInternal,
  scheduleChatScroll as scheduleChatScrollInternal,
} from "./app-scroll.ts";
import {
  applySettings as applySettingsInternal,
  loadCron as loadCronInternal,
  loadOverview as loadOverviewInternal,
  setTab as setTabInternal,
  setTheme as setThemeInternal,
  onPopState as onPopStateInternal,
} from "./app-settings.ts";
import {
  resetToolStream as resetToolStreamInternal,
  type ToolStreamEntry,
  type CompactionStatus,
} from "./app-tool-stream.ts";
import { resolveInjectedAssistantIdentity } from "./assistant-identity.ts";
import { loadAssistantIdentity as loadAssistantIdentityInternal } from "./controllers/assistant-identity.ts";
import { loadAgents as loadAgentsInternal } from "./controllers/agents.ts";
import { getLocale, t } from "./i18n.ts";
import { loadSettings, type UiSettings } from "./storage.ts";
import {
  loadChatArchives,
  saveChatArchive,
  type ChatArchiveEntry,
} from "./chat-archives.ts";
import { type ChatAttachment, type ChatQueueItem, type CronFormState } from "./ui-types.ts";

declare global {
  interface Window {
    __OPENCLAW_CONTROL_UI_BASE_PATH__?: string;
  }
}

const injectedAssistantIdentity = resolveInjectedAssistantIdentity();

type ShareCopyPayload = {
  version: number;
  locales: {
    zh: {
      title: string;
      subtitle: string;
      body: string;
    };
    en: {
      title: string;
      subtitle: string;
      body: string;
    };
  };
};

type SharePromptStore = {
  sendCount: number;
  shownVersions: number[];
};

type OneClawUpdateState = {
  status: "hidden" | "available" | "downloading";
  version: string | null;
  percent: number | null;
  showBadge: boolean;
};

type OneClawFeishuPairingRequest = {
  code: string;
  id: string;
  name: string;
  createdAt: string;
  lastSeenAt: string;
};

type OneClawFeishuPairingState = {
  pendingCount: number;
  requests: OneClawFeishuPairingRequest[];
  updatedAt: number;
  lastAutoApprovedAt: number | null;
  lastAutoApprovedName: string | null;
};

type OneClawIpcResult = {
  success?: boolean;
  message?: string;
};

type GithubSkillSearchResult = {
  id: string;
  name: string;
  repoFullName: string;
  repoUrl: string;
  skillPath: string;
  htmlUrl: string;
  description: string;
};

type OneClawBridge = {
  onNavigate?: (cb: (payload: { view: "settings" }) => void) => (() => void) | void;
  onUpdateState?: (cb: (payload: OneClawUpdateState) => void) => (() => void) | void;
  getUpdateState?: () => Promise<OneClawUpdateState>;
  onFeishuPairingState?: (
    cb: (payload: OneClawFeishuPairingState) => void,
  ) => (() => void) | void;
  getFeishuPairingState?: () => Promise<OneClawFeishuPairingState>;
  refreshFeishuPairingState?: () => void;
  settingsApproveFeishuPairing?: (
    params: { code: string; id?: string; name?: string },
  ) => Promise<OneClawIpcResult>;
  settingsRejectFeishuPairing?: (
    params: { code: string; id?: string; name?: string },
  ) => Promise<OneClawIpcResult>;
  listInstalledSkills?: () => Promise<{
    success?: boolean;
    data?: Array<{ name?: string; source?: string; path?: string }>;
    message?: string;
  }>;
  searchGithubSkills?: (query: string) => Promise<{
    success?: boolean;
    data?: Array<{
      id?: string;
      name?: string;
      repoFullName?: string;
      repoUrl?: string;
      skillPath?: string;
      htmlUrl?: string;
      description?: string;
    }>;
    message?: string;
  }>;
  installGithubSkill?: (params: {
    repoFullName: string;
    skillPath: string;
    name?: string;
  }) => Promise<{
    success?: boolean;
    data?: { name?: string; path?: string };
    message?: string;
  }>;
  chooseExportDirectory?: () => Promise<{
    success?: boolean;
    cancelled?: boolean;
    path?: string;
  }>;
  exportConversations?: (params: {
    outputDir: string;
    format: "markdown" | "html" | "pdf" | "png";
    items: Array<{
      sessionKey: string;
      label?: string | null;
      messages: unknown[];
    }>;
  }) => Promise<{
    success?: boolean;
    data?: { files?: string[] };
    message?: string;
  }>;
  chooseExplorerDirectory?: () => Promise<{
    success?: boolean;
    cancelled?: boolean;
    path?: string;
  }>;
  listExplorerTree?: (params: { rootPath: string }) => Promise<{
    success?: boolean;
    data?: { rootPath?: string; nodes?: ExplorerNode[] };
    message?: string;
  }>;
  listExplorerChildren?: (params: { directoryPath: string }) => Promise<{
    success?: boolean;
    data?: { directoryPath?: string; nodes?: ExplorerNode[] };
    message?: string;
  }>;
  readExplorerFile?: (params: { filePath: string; maxBytes?: number }) => Promise<{
    success?: boolean;
    data?: { filePath?: string; content?: string; truncated?: boolean };
    message?: string;
  }>;
};

type ExplorerNode = {
  name: string;
  path: string;
  type: "file" | "directory";
  hasChildren?: boolean;
  children?: ExplorerNode[];
  childrenLoaded?: boolean;
};

const SHARE_PROMPT_STORE_KEY = "openclaw.share.prompt.v1";
const SHARE_PROMPT_TRIGGER_COUNT = 5;

function resolveOnboardingMode(): boolean {
  if (!window.location.search) {
    return false;
  }
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("onboarding");
  if (!raw) {
    return false;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

@customElement("openclaw-app")
export class OpenClawApp extends LitElement {
  static properties = {
    settings: { state: true },
    password: { state: true },
    tab: { state: true },
    onboarding: { state: true },
    connected: { state: true },
    theme: { state: true },
    themeResolved: { state: true },
    hello: { state: true },
    lastError: { state: true },
    eventLog: { state: true },
    assistantName: { state: true },
    assistantAvatar: { state: true },
    assistantAgentId: { state: true },
    sessionKey: { state: true },
    chatLoading: { state: true },
    chatSending: { state: true },
    chatMessage: { state: true },
    chatMessages: { state: true },
    chatToolMessages: { state: true },
    chatStream: { state: true },
    chatStreamStartedAt: { state: true },
    chatRunId: { state: true },
    compactionStatus: { state: true },
    chatAvatarUrl: { state: true },
    chatThinkingLevel: { state: true },
    chatQueue: { state: true },
    chatAttachments: { state: true },
    chatManualRefreshInFlight: { state: true },
    sidebarOpen: { state: true },
    sidebarContent: { state: true },
    sidebarError: { state: true },
    splitRatio: { state: true },
    nodesLoading: { state: true },
    nodes: { state: true },
    devicesLoading: { state: true },
    devicesError: { state: true },
    devicesList: { state: true },
    execApprovalsLoading: { state: true },
    execApprovalsSaving: { state: true },
    execApprovalsDirty: { state: true },
    execApprovalsSnapshot: { state: true },
    execApprovalsForm: { state: true },
    execApprovalsSelectedAgent: { state: true },
    execApprovalsTarget: { state: true },
    execApprovalsTargetNodeId: { state: true },
    execApprovalQueue: { state: true },
    execApprovalBusy: { state: true },
    execApprovalError: { state: true },
    pendingGatewayUrl: { state: true },
    configLoading: { state: true },
    configRaw: { state: true },
    configRawOriginal: { state: true },
    configValid: { state: true },
    configIssues: { state: true },
    configSaving: { state: true },
    configApplying: { state: true },
    updateRunning: { state: true },
    applySessionKey: { state: true },
    configSnapshot: { state: true },
    configSchema: { state: true },
    configSchemaVersion: { state: true },
    configSchemaLoading: { state: true },
    configUiHints: { state: true },
    configForm: { state: true },
    configFormOriginal: { state: true },
    configFormDirty: { state: true },
    configFormMode: { state: true },
    configSearchQuery: { state: true },
    configActiveSection: { state: true },
    configActiveSubsection: { state: true },
    channelsLoading: { state: true },
    channelsSnapshot: { state: true },
    channelsError: { state: true },
    channelsLastSuccess: { state: true },
    whatsappLoginMessage: { state: true },
    whatsappLoginQrDataUrl: { state: true },
    whatsappLoginConnected: { state: true },
    whatsappBusy: { state: true },
    nostrProfileFormState: { state: true },
    nostrProfileAccountId: { state: true },
    presenceLoading: { state: true },
    presenceEntries: { state: true },
    presenceError: { state: true },
    presenceStatus: { state: true },
    agentsLoading: { state: true },
    agentsList: { state: true },
    agentsError: { state: true },
    agentsSelectedId: { state: true },
    agentsPanel: { state: true },
    agentFilesLoading: { state: true },
    agentFilesError: { state: true },
    agentFilesList: { state: true },
    agentFileContents: { state: true },
    agentFileDrafts: { state: true },
    agentFileActive: { state: true },
    agentFileSaving: { state: true },
    agentIdentityLoading: { state: true },
    agentIdentityError: { state: true },
    agentIdentityById: { state: true },
    agentSkillsLoading: { state: true },
    agentSkillsError: { state: true },
    agentSkillsReport: { state: true },
    agentSkillsAgentId: { state: true },
    sessionsLoading: { state: true },
    sessionsResult: { state: true },
    sessionsError: { state: true },
    sessionsFilterActive: { state: true },
    sessionsFilterLimit: { state: true },
    sessionsIncludeGlobal: { state: true },
    sessionsIncludeUnknown: { state: true },
    usageLoading: { state: true },
    usageResult: { state: true },
    usageCostSummary: { state: true },
    usageError: { state: true },
    usageStartDate: { state: true },
    usageEndDate: { state: true },
    usageSelectedSessions: { state: true },
    usageSelectedDays: { state: true },
    usageSelectedHours: { state: true },
    usageChartMode: { state: true },
    usageDailyChartMode: { state: true },
    usageTimeSeriesMode: { state: true },
    usageTimeSeriesBreakdownMode: { state: true },
    usageTimeSeries: { state: true },
    usageTimeSeriesLoading: { state: true },
    usageSessionLogs: { state: true },
    usageSessionLogsLoading: { state: true },
    usageSessionLogsExpanded: { state: true },
    usageQuery: { state: true },
    usageQueryDraft: { state: true },
    usageSessionSort: { state: true },
    usageSessionSortDir: { state: true },
    usageRecentSessions: { state: true },
    usageTimeZone: { state: true },
    usageContextExpanded: { state: true },
    usageHeaderPinned: { state: true },
    usageSessionsTab: { state: true },
    usageVisibleColumns: { state: true },
    usageLogFilterRoles: { state: true },
    usageLogFilterTools: { state: true },
    usageLogFilterHasTools: { state: true },
    usageLogFilterQuery: { state: true },
    cronLoading: { state: true },
    cronJobs: { state: true },
    cronStatus: { state: true },
    cronError: { state: true },
    cronForm: { state: true },
    cronRunsJobId: { state: true },
    cronRuns: { state: true },
    cronBusy: { state: true },
    skillsLoading: { state: true },
    skillsReport: { state: true },
    skillsError: { state: true },
    skillsFilter: { state: true },
    skillEdits: { state: true },
    skillsBusyKey: { state: true },
    skillMessages: { state: true },
    installedSkillsLoading: { state: true },
    installedSkillsError: { state: true },
    installedSkills: { state: true },
    installedSkillsFilter: { state: true },
    installedSkillsSelectedKey: { state: true },
    skillsTab: { state: true },
    githubSkillSearchQuery: { state: true },
    githubSkillSearchLoading: { state: true },
    githubSkillSearchError: { state: true },
    githubSkillSearchResults: { state: true },
    githubSkillInstallBusyId: { state: true },
    githubSkillInstallMessage: { state: true },
    debugLoading: { state: true },
    debugStatus: { state: true },
    debugHealth: { state: true },
    debugModels: { state: true },
    debugHeartbeat: { state: true },
    debugCallMethod: { state: true },
    debugCallParams: { state: true },
    debugCallResult: { state: true },
    debugCallError: { state: true },
    logsLoading: { state: true },
    logsError: { state: true },
    logsFile: { state: true },
    logsEntries: { state: true },
    logsFilterText: { state: true },
    logsLevelFilters: { state: true },
    logsAutoFollow: { state: true },
    logsTruncated: { state: true },
    logsCursor: { state: true },
    logsLastFetchAt: { state: true },
    logsLimit: { state: true },
    logsMaxBytes: { state: true },
    logsAtBottom: { state: true },
    chatNewMessagesBelow: { state: true },
    chatExportBusy: { state: true },
    chatExportSelectedKeys: { state: true },
    chatExportSelecting: { state: true },
    chatExportFormat: { state: true },
    sharePromptVisible: { state: true },
    sharePromptCopied: { state: true },
    sharePromptCopyError: { state: true },
    sharePromptTitle: { state: true },
    sharePromptSubtitle: { state: true },
    sharePromptText: { state: true },
    sharePromptVersion: { state: true },
    updateBannerState: { state: true },
    feishuPairingState: { state: true },
    feishuPairingApproving: { state: true },
    feishuPairingRejecting: { state: true },
    settingsTabHint: { state: true },
    chatArchives: { state: true },
    historyPanelOpen: { state: true },
    historySelectedArchiveId: { state: true },
    explorerPanelOpen: { state: true },
    explorerRootPath: { state: true },
    explorerPathInput: { state: true },
    explorerLoading: { state: true },
    explorerError: { state: true },
    explorerTree: { state: true },
    explorerExpandedDirs: { state: true },
    explorerLoadingDirs: { state: true },
    explorerActiveFilePath: { state: true },
    explorerActiveFileName: { state: true },
    explorerFileContent: { state: true },
    explorerFileTruncated: { state: true },
  };

  // 兼容 class field 的 define 语义：回灌实例字段到 Lit accessor，恢复响应式更新。
  constructor() {
    super();
    this.rebindReactiveFieldsForLit();
    this.restoreSharePromptStore();
  }

  // 将实例自有字段删除并通过 setter 重新赋值，避免覆盖原型上的响应式访问器。
  private rebindReactiveFieldsForLit() {
    const propertyDefs = (this.constructor as typeof OpenClawApp).properties ?? {};
    const keys = Object.keys(propertyDefs);
    for (const key of keys) {
      if (!Object.prototype.hasOwnProperty.call(this, key)) {
        continue;
      }
      const value = (this as unknown as Record<string, unknown>)[key];
      delete (this as unknown as Record<string, unknown>)[key];
      (this as unknown as Record<string, unknown>)[key] = value;
    }
  }

  settings: UiSettings = loadSettings();
  password = "";
  tab: Tab = "chat";
  onboarding = resolveOnboardingMode();
  connected = false;
  theme: ThemeMode = this.settings.theme ?? "system";
  themeResolved: ResolvedTheme = "dark";
  hello: GatewayHelloOk | null = null;
  lastError: string | null = null;
  eventLog: EventLogEntry[] = [];
  private eventLogBuffer: EventLogEntry[] = [];
  private toolStreamSyncTimer: number | null = null;
  private sidebarCloseTimer: number | null = null;

  assistantName = injectedAssistantIdentity.name;
  assistantAvatar = injectedAssistantIdentity.avatar;
  assistantAgentId = injectedAssistantIdentity.agentId ?? null;

  sessionKey = this.settings.sessionKey;
  chatLoading = false;
  chatSending = false;
  chatMessage = "";
  chatMessages: unknown[] = [];
  chatToolMessages: unknown[] = [];
  chatStream: string | null = null;
  chatStreamStartedAt: number | null = null;
  chatRunId: string | null = null;
  compactionStatus: CompactionStatus | null = null;
  chatAvatarUrl: string | null = null;
  chatThinkingLevel: string | null = null;
  chatQueue: ChatQueueItem[] = [];
  chatAttachments: ChatAttachment[] = [];
  chatManualRefreshInFlight = false;
  // Sidebar state for tool output viewing
  sidebarOpen = false;
  sidebarContent: string | null = null;
  sidebarError: string | null = null;
  splitRatio = this.settings.splitRatio;

  nodesLoading = false;
  nodes: Array<Record<string, unknown>> = [];
  devicesLoading = false;
  devicesError: string | null = null;
  devicesList: DevicePairingList | null = null;
  execApprovalsLoading = false;
  execApprovalsSaving = false;
  execApprovalsDirty = false;
  execApprovalsSnapshot: ExecApprovalsSnapshot | null = null;
  execApprovalsForm: ExecApprovalsFile | null = null;
  execApprovalsSelectedAgent: string | null = null;
  execApprovalsTarget: "gateway" | "node" = "gateway";
  execApprovalsTargetNodeId: string | null = null;
  execApprovalQueue: ExecApprovalRequest[] = [];
  execApprovalBusy = false;
  execApprovalError: string | null = null;
  pendingGatewayUrl: string | null = null;

  configLoading = false;
  configRaw = "{\n}\n";
  configRawOriginal = "";
  configValid: boolean | null = null;
  configIssues: unknown[] = [];
  configSaving = false;
  configApplying = false;
  updateRunning = false;
  applySessionKey = this.settings.lastActiveSessionKey;
  configSnapshot: ConfigSnapshot | null = null;
  configSchema: unknown = null;
  configSchemaVersion: string | null = null;
  configSchemaLoading = false;
  configUiHints: ConfigUiHints = {};
  configForm: Record<string, unknown> | null = null;
  configFormOriginal: Record<string, unknown> | null = null;
  configFormDirty = false;
  configFormMode: "form" | "raw" = "form";
  configSearchQuery = "";
  configActiveSection: string | null = null;
  configActiveSubsection: string | null = null;

  channelsLoading = false;
  channelsSnapshot: ChannelsStatusSnapshot | null = null;
  channelsError: string | null = null;
  channelsLastSuccess: number | null = null;
  whatsappLoginMessage: string | null = null;
  whatsappLoginQrDataUrl: string | null = null;
  whatsappLoginConnected: boolean | null = null;
  whatsappBusy = false;
  nostrProfileFormState: NostrProfileFormState | null = null;
  nostrProfileAccountId: string | null = null;

  presenceLoading = false;
  presenceEntries: PresenceEntry[] = [];
  presenceError: string | null = null;
  presenceStatus: string | null = null;

  agentsLoading = false;
  agentsList: AgentsListResult | null = null;
  agentsError: string | null = null;
  agentsSelectedId: string | null = null;
  agentsPanel: "overview" | "files" | "tools" | "skills" | "channels" | "cron" =
    "overview";
  agentFilesLoading = false;
  agentFilesError: string | null = null;
  agentFilesList: AgentsFilesListResult | null = null;
  agentFileContents: Record<string, string> = {};
  agentFileDrafts: Record<string, string> = {};
  agentFileActive: string | null = null;
  agentFileSaving = false;
  agentIdentityLoading = false;
  agentIdentityError: string | null = null;
  agentIdentityById: Record<string, AgentIdentityResult> = {};
  agentSkillsLoading = false;
  agentSkillsError: string | null = null;
  agentSkillsReport: SkillStatusReport | null = null;
  agentSkillsAgentId: string | null = null;

  sessionsLoading = false;
  sessionsResult: SessionsListResult | null = null;
  sessionsError: string | null = null;
  sessionsFilterActive = "";
  sessionsFilterLimit = "120";
  sessionsIncludeGlobal = true;
  sessionsIncludeUnknown = false;

  usageLoading = false;
  usageResult: import("./types.js").SessionsUsageResult | null = null;
  usageCostSummary: import("./types.js").CostUsageSummary | null = null;
  usageError: string | null = null;
  usageStartDate = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  usageEndDate = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  usageSelectedSessions: string[] = [];
  usageSelectedDays: string[] = [];
  usageSelectedHours: number[] = [];
  usageChartMode: "tokens" | "cost" = "tokens";
  usageDailyChartMode: "total" | "by-type" = "by-type";
  usageTimeSeriesMode: "cumulative" | "per-turn" = "per-turn";
  usageTimeSeriesBreakdownMode: "total" | "by-type" = "by-type";
  usageTimeSeries: import("./types.js").SessionUsageTimeSeries | null = null;
  usageTimeSeriesLoading = false;
  usageSessionLogs: import("./views/usage.js").SessionLogEntry[] | null = null;
  usageSessionLogsLoading = false;
  usageSessionLogsExpanded = false;
  // Applied query (used to filter the already-loaded sessions list client-side).
  usageQuery = "";
  // Draft query text (updates immediately as the user types; applied via debounce or "Search").
  usageQueryDraft = "";
  usageSessionSort: "tokens" | "cost" | "recent" | "messages" | "errors" = "recent";
  usageSessionSortDir: "desc" | "asc" = "desc";
  usageRecentSessions: string[] = [];
  usageTimeZone: "local" | "utc" = "local";
  usageContextExpanded = false;
  usageHeaderPinned = false;
  usageSessionsTab: "all" | "recent" = "all";
  usageVisibleColumns: string[] = [
    "channel",
    "agent",
    "provider",
    "model",
    "messages",
    "tools",
    "errors",
    "duration",
  ];
  usageLogFilterRoles: import("./views/usage.js").SessionLogRole[] = [];
  usageLogFilterTools: string[] = [];
  usageLogFilterHasTools = false;
  usageLogFilterQuery = "";

  // Non-reactive (don’t trigger renders just for timer bookkeeping).
  usageQueryDebounceTimer: number | null = null;

  cronLoading = false;
  cronJobs: CronJob[] = [];
  cronStatus: CronStatus | null = null;
  cronError: string | null = null;
  cronForm: CronFormState = { ...DEFAULT_CRON_FORM };
  cronRunsJobId: string | null = null;
  cronRuns: CronRunLogEntry[] = [];
  cronBusy = false;

  skillsLoading = false;
  skillsReport: SkillStatusReport | null = null;
  skillsError: string | null = null;
  skillsFilter = "";
  skillEdits: Record<string, string> = {};
  skillsBusyKey: string | null = null;
  skillMessages: Record<string, SkillMessage> = {};
  installedSkillsLoading = false;
  installedSkillsError: string | null = null;
  installedSkills: Array<{ name: string; source: string; path: string }> = [];
  installedSkillsFilter = "";
  installedSkillsSelectedKey = "";
  skillsTab: "built-in" | "installed" | "search" = "built-in";
  githubSkillSearchQuery = "";
  githubSkillSearchLoading = false;
  githubSkillSearchError: string | null = null;
  githubSkillSearchResults: GithubSkillSearchResult[] = [];
  githubSkillInstallBusyId: string | null = null;
  githubSkillInstallMessage: string | null = null;

  debugLoading = false;
  debugStatus: StatusSummary | null = null;
  debugHealth: HealthSnapshot | null = null;
  debugModels: unknown[] = [];
  debugHeartbeat: unknown = null;
  debugCallMethod = "";
  debugCallParams = "{}";
  debugCallResult: string | null = null;
  debugCallError: string | null = null;

  logsLoading = false;
  logsError: string | null = null;
  logsFile: string | null = null;
  logsEntries: LogEntry[] = [];
  logsFilterText = "";
  logsLevelFilters: Record<LogLevel, boolean> = {
    ...DEFAULT_LOG_LEVEL_FILTERS,
  };
  logsAutoFollow = true;
  logsTruncated = false;
  logsCursor: number | null = null;
  logsLastFetchAt: number | null = null;
  logsLimit = 500;
  logsMaxBytes = 250_000;
  logsAtBottom = true;

  client: GatewayBrowserClient | null = null;
  private chatScrollFrame: number | null = null;
  private chatScrollTimeout: number | null = null;
  private chatHasAutoScrolled = false;
  private chatUserNearBottom = true;
  chatNewMessagesBelow = false;
  chatExportBusy = false;
  chatExportSelectedKeys: string[] = [];
  chatExportSelectedItems: Array<{ key: string; order: number; messages: unknown[] }> = [];
  chatExportSelecting = false;
  chatExportFormat: "markdown" | "html" | "pdf" | "png" = "html";
  sharePromptVisible = false;
  sharePromptCopied = false;
  sharePromptCopyError: string | null = null;
  sharePromptTitle = t("sharePrompt.title");
  sharePromptSubtitle = t("sharePrompt.subtitle");
  sharePromptText = "";
  sharePromptVersion: number | null = null;
  updateBannerState: OneClawUpdateState = {
    status: "hidden",
    version: null,
    percent: null,
    showBadge: false,
  };
  feishuPairingState: OneClawFeishuPairingState = {
    pendingCount: 0,
    requests: [],
    updatedAt: Date.now(),
    lastAutoApprovedAt: null,
    lastAutoApprovedName: null,
  };
  feishuPairingApproving = false;
  feishuPairingRejecting = false;
  settingsTabHint: "channels" | null = null;
  chatArchives: ChatArchiveEntry[] = loadChatArchives();
  historyPanelOpen = false;
  historySelectedArchiveId: string | null = this.chatArchives[0]?.id ?? null;
  explorerPanelOpen = false;
  explorerRootPath = "";
  explorerPathInput = "";
  explorerLoading = false;
  explorerError: string | null = null;
  explorerTree: ExplorerNode[] = [];
  explorerExpandedDirs: string[] = [];
  explorerLoadingDirs: string[] = [];
  explorerActiveFilePath = "";
  explorerActiveFileName = "";
  explorerFileContent = "";
  explorerFileTruncated = false;
  private sharePromptSendCount = 0;
  private sharePromptShownVersions = new Set<number>();
  private sharePromptCheckInFlight = false;
  private nodesPollInterval: number | null = null;
  private logsPollInterval: number | null = null;
  private debugPollInterval: number | null = null;
  private logsScrollFrame: number | null = null;
  private toolStreamById = new Map<string, ToolStreamEntry>();
  private toolStreamOrder: string[] = [];
  refreshSessionsAfterChat = new Set<string>();
  basePath = "";
  private popStateHandler = () =>
    onPopStateInternal(this as unknown as Parameters<typeof onPopStateInternal>[0]);
  private themeMedia: MediaQueryList | null = null;
  private themeMediaHandler: ((event: MediaQueryListEvent) => void) | null = null;
  private topbarObserver: ResizeObserver | null = null;
  private appNavigateCleanup: (() => void) | null = null;
  private updateStateCleanup: (() => void) | null = null;
  private feishuPairingStateCleanup: (() => void) | null = null;

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    handleConnected(this as unknown as Parameters<typeof handleConnected>[0]);
    this.bindAppNavigation();
    this.bindUpdateState();
    this.bindFeishuPairingState();
    void this.refreshInstalledSkills();
    // Load agents for chat UI (agent-prefixed session keys).
    void loadAgentsInternal(this as unknown as Parameters<typeof loadAgentsInternal>[0]);
  }

  protected firstUpdated() {
    handleFirstUpdated(this as unknown as Parameters<typeof handleFirstUpdated>[0]);
  }

  disconnectedCallback() {
    this.appNavigateCleanup?.();
    this.appNavigateCleanup = null;
    this.updateStateCleanup?.();
    this.updateStateCleanup = null;
    this.feishuPairingStateCleanup?.();
    this.feishuPairingStateCleanup = null;
    handleDisconnected(this as unknown as Parameters<typeof handleDisconnected>[0]);
    super.disconnectedCallback();
  }

  protected updated(changed: Map<PropertyKey, unknown>) {
    handleUpdated(this as unknown as Parameters<typeof handleUpdated>[0], changed);
  }

  connect() {
    connectGatewayInternal(this as unknown as Parameters<typeof connectGatewayInternal>[0]);
  }

  handleChatScroll(event: Event) {
    handleChatScrollInternal(
      this as unknown as Parameters<typeof handleChatScrollInternal>[0],
      event,
    );
  }

  handleLogsScroll(event: Event) {
    handleLogsScrollInternal(
      this as unknown as Parameters<typeof handleLogsScrollInternal>[0],
      event,
    );
  }

  exportLogs(lines: string[], label: string) {
    exportLogsInternal(lines, label);
  }

  resetToolStream() {
    resetToolStreamInternal(this as unknown as Parameters<typeof resetToolStreamInternal>[0]);
  }

  resetChatScroll() {
    resetChatScrollInternal(this as unknown as Parameters<typeof resetChatScrollInternal>[0]);
  }

  scrollToBottom(opts?: { smooth?: boolean }) {
    resetChatScrollInternal(this as unknown as Parameters<typeof resetChatScrollInternal>[0]);
    scheduleChatScrollInternal(
      this as unknown as Parameters<typeof scheduleChatScrollInternal>[0],
      true,
      Boolean(opts?.smooth),
    );
  }

  async loadAssistantIdentity() {
    await loadAssistantIdentityInternal(this);
  }

  applySettings(next: UiSettings) {
    applySettingsInternal(this as unknown as Parameters<typeof applySettingsInternal>[0], next);
  }

  // 统一读取 preload 暴露的 bridge，避免在多个方法里重复类型断言。
  private getOneClawBridge(): OneClawBridge | undefined {
    return (window as unknown as { oneclaw?: OneClawBridge }).oneclaw;
  }

  async refreshInstalledSkills() {
    const bridge = this.getOneClawBridge();
    if (!bridge?.listInstalledSkills || this.installedSkillsLoading) {
      return;
    }
    this.installedSkillsLoading = true;
    this.installedSkillsError = null;
    try {
      const result = await bridge.listInstalledSkills();
      if (!result || result.success !== true || !Array.isArray(result.data)) {
        this.installedSkills = [];
        this.installedSkillsError = result?.message || "Failed to load skills";
        return;
      }
      const normalized = result.data
        .map((item) => ({
          name: String(item?.name || "").trim(),
          source: String(item?.source || "").trim() || "unknown",
          path: String(item?.path || "").trim(),
        }))
        .filter((item) => item.name.length > 0);
      this.installedSkills = normalized;
      if (normalized.length === 0) {
        this.installedSkillsSelectedKey = "";
      } else if (
        !this.installedSkillsSelectedKey ||
        !normalized.some(
          (item) => `${item.source}:${item.name}:${item.path}` === this.installedSkillsSelectedKey,
        )
      ) {
        const first = normalized[0];
        this.installedSkillsSelectedKey = `${first.source}:${first.name}:${first.path}`;
      }
    } catch (err: any) {
      this.installedSkills = [];
      this.installedSkillsSelectedKey = "";
      this.installedSkillsError = err?.message || String(err);
    } finally {
      this.installedSkillsLoading = false;
    }
  }

  setInstalledSkillsFilter(next: string) {
    this.installedSkillsFilter = next;
  }

  setInstalledSkillsSelectedKey(next: string) {
    this.installedSkillsSelectedKey = next;
  }

  setSkillsTab(next: "built-in" | "installed" | "search") {
    this.skillsTab = next;
    if (next === "search" && this.githubSkillSearchResults.length === 0) {
      this.githubSkillInstallMessage = null;
    }
  }

  setGithubSkillSearchQuery(next: string) {
    this.githubSkillSearchQuery = next;
  }

  async searchGithubSkills() {
    const bridge = this.getOneClawBridge();
    const query = this.githubSkillSearchQuery.trim();
    if (!bridge?.searchGithubSkills || this.githubSkillSearchLoading) {
      return;
    }
    if (query.length < 2) {
      this.githubSkillSearchResults = [];
      this.githubSkillSearchError = t("skills.searchGithubNeedQuery");
      return;
    }
    this.githubSkillSearchLoading = true;
    this.githubSkillSearchError = null;
    this.githubSkillInstallMessage = null;
    try {
      const result = await bridge.searchGithubSkills(query);
      if (!result || result.success !== true || !Array.isArray(result.data)) {
        this.githubSkillSearchResults = [];
        this.githubSkillSearchError = result?.message || t("skills.searchGithubError");
        return;
      }
      this.githubSkillSearchResults = result.data
        .map((item) => ({
          id: String(item?.id || "").trim(),
          name: String(item?.name || "").trim(),
          repoFullName: String(item?.repoFullName || "").trim(),
          repoUrl: String(item?.repoUrl || "").trim(),
          skillPath: String(item?.skillPath || ".").trim() || ".",
          htmlUrl: String(item?.htmlUrl || "").trim(),
          description: String(item?.description || "").trim(),
        }))
        .filter((item) => item.id && item.repoFullName && item.name);
    } catch (err: any) {
      this.githubSkillSearchResults = [];
      this.githubSkillSearchError = err?.message || String(err);
    } finally {
      this.githubSkillSearchLoading = false;
    }
  }

  async installGithubSkill(resultId: string) {
    const bridge = this.getOneClawBridge();
    if (!bridge?.installGithubSkill || this.githubSkillInstallBusyId) {
      return;
    }
    const target = this.githubSkillSearchResults.find((item) => item.id === resultId);
    if (!target) {
      return;
    }
    this.githubSkillInstallBusyId = resultId;
    this.githubSkillSearchError = null;
    this.githubSkillInstallMessage = null;
    try {
      const result = await bridge.installGithubSkill({
        repoFullName: target.repoFullName,
        skillPath: target.skillPath,
        name: target.name,
      });
      if (!result || result.success !== true) {
        this.githubSkillInstallMessage = result?.message || t("skills.installGithubError");
        return;
      }
      this.githubSkillInstallMessage = t("skills.installGithubSuccess").replace(
        "{name}",
        String(result.data?.name || target.name),
      );
      await this.refreshInstalledSkills();
      this.skillsTab = "installed";
    } catch (err: any) {
      this.githubSkillInstallMessage = err?.message || t("skills.installGithubError");
    } finally {
      this.githubSkillInstallBusyId = null;
    }
  }

  // 规范化更新状态 payload，保证渲染层只消费合法值。
  private applyUpdateBannerState(payload: OneClawUpdateState | null | undefined) {
    const nextStatus = payload?.status;
    if (nextStatus !== "hidden" && nextStatus !== "available" && nextStatus !== "downloading") {
      return;
    }
    this.updateBannerState = {
      status: nextStatus,
      version: typeof payload.version === "string" && payload.version.trim()
        ? payload.version.trim()
        : null,
      percent: typeof payload.percent === "number" && Number.isFinite(payload.percent)
        ? Math.max(0, Math.min(100, payload.percent))
        : null,
      showBadge: Boolean(payload.showBadge),
    };
  }

  // 规范化飞书配对状态，避免渲染层处理空值或脏数据。
  private applyFeishuPairingState(payload: OneClawFeishuPairingState | null | undefined) {
    const rawRequests = Array.isArray(payload?.requests) ? payload.requests : [];
    const requests: OneClawFeishuPairingRequest[] = rawRequests
      .map((item) => ({
        code: String(item?.code ?? "").trim(),
        id: String(item?.id ?? "").trim(),
        name: String(item?.name ?? "").trim(),
        createdAt: String(item?.createdAt ?? ""),
        lastSeenAt: String(item?.lastSeenAt ?? ""),
      }))
      .filter((item) => item.code.length > 0);
    const pendingCountRaw = Number(payload?.pendingCount ?? requests.length);
    const pendingCount = Number.isFinite(pendingCountRaw) && pendingCountRaw >= 0
      ? Math.floor(pendingCountRaw)
      : requests.length;
    const updatedAtRaw = Number(payload?.updatedAt ?? Date.now());
    const updatedAt = Number.isFinite(updatedAtRaw) ? updatedAtRaw : Date.now();
    const lastAutoApprovedAtRaw = payload?.lastAutoApprovedAt;
    const lastAutoApprovedAt = typeof lastAutoApprovedAtRaw === "number" && Number.isFinite(lastAutoApprovedAtRaw)
      ? lastAutoApprovedAtRaw
      : null;
    const lastAutoApprovedName = typeof payload?.lastAutoApprovedName === "string" &&
      payload.lastAutoApprovedName.trim().length > 0
      ? payload.lastAutoApprovedName.trim()
      : null;
    this.feishuPairingState = {
      pendingCount: Math.max(pendingCount, requests.length),
      requests,
      updatedAt,
      lastAutoApprovedAt,
      lastAutoApprovedName,
    };
  }

  // 订阅主进程更新状态事件，并在首屏主动拉取一次当前状态。
  private bindUpdateState() {
    if (this.updateStateCleanup) {
      return;
    }
    const bridge = this.getOneClawBridge();
    if (bridge?.onUpdateState) {
      const unsubscribe = bridge.onUpdateState((payload) => this.applyUpdateBannerState(payload));
      this.updateStateCleanup = typeof unsubscribe === "function" ? unsubscribe : null;
    }
    if (bridge?.getUpdateState) {
      void bridge.getUpdateState()
        .then((payload) => this.applyUpdateBannerState(payload))
        .catch(() => {
          // ignore preload bridge fetch errors
        });
    }
  }

  // 订阅飞书待审批状态，并在首屏拉取一次快照用于渲染红点与快捷批准入口。
  private bindFeishuPairingState() {
    if (this.feishuPairingStateCleanup) {
      return;
    }
    const bridge = this.getOneClawBridge();
    if (bridge?.onFeishuPairingState) {
      const unsubscribe = bridge.onFeishuPairingState((payload) => this.applyFeishuPairingState(payload));
      this.feishuPairingStateCleanup = typeof unsubscribe === "function" ? unsubscribe : null;
    }
    if (bridge?.getFeishuPairingState) {
      void bridge.getFeishuPairingState()
        .then((payload) => this.applyFeishuPairingState(payload))
        .catch(() => {
          // ignore preload bridge fetch errors
        });
    }
  }

  // 批准当前首条飞书待审批请求，并请求主进程立即刷新状态快照。
  async approveFirstFeishuPairing() {
    if (this.feishuPairingApproving) {
      return;
    }
    const target = this.feishuPairingState.requests[0];
    if (!target?.code) {
      return;
    }
    const bridge = this.getOneClawBridge();
    if (!bridge?.settingsApproveFeishuPairing) {
      return;
    }

    this.feishuPairingApproving = true;
    try {
      const result = await bridge.settingsApproveFeishuPairing({
        code: target.code,
        id: target.id,
        name: target.name,
      });
      if (!result?.success) {
        this.lastError = result?.message || t("feishu.approveFailed");
        return;
      }
      bridge.refreshFeishuPairingState?.();
    } catch (err: any) {
      this.lastError = t("feishu.approveFailed") + (err?.message ? `: ${err.message}` : "");
    } finally {
      this.feishuPairingApproving = false;
    }
  }

  // 拒绝当前首条飞书待审批请求（本地忽略该配对码），并请求主进程刷新状态。
  async rejectFirstFeishuPairing() {
    if (this.feishuPairingRejecting) {
      return;
    }
    const target = this.feishuPairingState.requests[0];
    if (!target?.code) {
      return;
    }
    const bridge = this.getOneClawBridge();
    if (!bridge?.settingsRejectFeishuPairing) {
      return;
    }

    this.feishuPairingRejecting = true;
    try {
      const result = await bridge.settingsRejectFeishuPairing({
        code: target.code,
        id: target.id,
        name: target.name,
      });
      if (!result?.success) {
        this.lastError = result?.message || t("feishu.rejectFailed");
        return;
      }
      bridge.refreshFeishuPairingState?.();
    } catch (err: any) {
      this.lastError = t("feishu.rejectFailed") + (err?.message ? `: ${err.message}` : "");
    } finally {
      this.feishuPairingRejecting = false;
    }
  }

  // 通知可见性：只要还有待审批请求就持续显示。
  shouldShowFeishuPairingNotice(): boolean {
    return this.feishuPairingState.pendingCount > 0;
  }

  private bindAppNavigation() {
    if (this.appNavigateCleanup) {
      return;
    }
    const bridge = this.getOneClawBridge();
    if (!bridge?.onNavigate) {
      return;
    }
    const unsubscribe = bridge.onNavigate((payload) => {
      if (payload?.view !== "settings") {
        return;
      }
      // 外部触发打开设置时，若存在待审批请求，默认引导到飞书集成页。
      this.settingsTabHint = this.feishuPairingState.pendingCount > 0 ? "channels" : null;
      this.applySettings({
        ...this.settings,
        oneclawView: "settings",
        navCollapsed: false,
      });
    });
    this.appNavigateCleanup = typeof unsubscribe === "function" ? unsubscribe : null;
  }

  setTab(next: Tab) {
    setTabInternal(this as unknown as Parameters<typeof setTabInternal>[0], next);
  }

  setTheme(next: ThemeMode, context?: Parameters<typeof setThemeInternal>[2]) {
    setThemeInternal(this as unknown as Parameters<typeof setThemeInternal>[0], next, context);
  }

  async loadOverview() {
    await loadOverviewInternal(this as unknown as Parameters<typeof loadOverviewInternal>[0]);
  }

  async loadCron() {
    await loadCronInternal(this as unknown as Parameters<typeof loadCronInternal>[0]);
  }

  async handleAbortChat() {
    await handleAbortChatInternal(this as unknown as Parameters<typeof handleAbortChatInternal>[0]);
  }

  removeQueuedMessage(id: string) {
    removeQueuedMessageInternal(
      this as unknown as Parameters<typeof removeQueuedMessageInternal>[0],
      id,
    );
  }

  // 恢复分享弹窗状态（累计发送次数 + 已展示版本集合）。
  private restoreSharePromptStore() {
    try {
      const raw = localStorage.getItem(SHARE_PROMPT_STORE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as Partial<SharePromptStore>;
      const sendCount = Number(parsed.sendCount);
      this.sharePromptSendCount = Number.isFinite(sendCount) && sendCount > 0
        ? Math.floor(sendCount)
        : 0;
      const versions = Array.isArray(parsed.shownVersions)
        ? parsed.shownVersions
          .map((version) => Number(version))
          .filter((version) => Number.isInteger(version) && version >= 0)
        : [];
      this.sharePromptShownVersions = new Set(versions);
    } catch {
      this.sharePromptSendCount = 0;
      this.sharePromptShownVersions = new Set();
    }
  }

  // 持久化分享弹窗状态，确保“每版本只弹一次”跨重启生效。
  private persistSharePromptStore() {
    try {
      const payload: SharePromptStore = {
        sendCount: this.sharePromptSendCount,
        shownVersions: Array.from(this.sharePromptShownVersions),
      };
      localStorage.setItem(SHARE_PROMPT_STORE_KEY, JSON.stringify(payload));
    } catch {
      // ignore storage write failures
    }
  }

  // 规范化服务端文案结构，缺语言时做互相回退。
  private normalizeShareCopyPayload(input: unknown): ShareCopyPayload | null {
    const data = input && typeof input === "object" ? (input as Record<string, unknown>) : null;
    if (!data) {
      return null;
    }
    const version = Number(data.version);
    if (!Number.isInteger(version) || version < 0) {
      return null;
    }
    const locales =
      data.locales && typeof data.locales === "object"
        ? (data.locales as Record<string, unknown>)
        : null;
    if (!locales) {
      return null;
    }
    const zhRaw =
      locales.zh && typeof locales.zh === "object"
        ? (locales.zh as Record<string, unknown>)
        : null;
    const enRaw =
      locales.en && typeof locales.en === "object"
        ? (locales.en as Record<string, unknown>)
        : null;
    if (!zhRaw || !enRaw) {
      return null;
    }
    const zhTitle = String(zhRaw.title ?? "").replace(/\r\n/g, "\n").trim();
    const zhSubtitle = String(zhRaw.subtitle ?? "").replace(/\r\n/g, "\n").trim();
    const zhBody = String(zhRaw.body ?? "").replace(/\r\n/g, "\n").trim();
    const enTitle = String(enRaw.title ?? "").replace(/\r\n/g, "\n").trim();
    const enSubtitle = String(enRaw.subtitle ?? "").replace(/\r\n/g, "\n").trim();
    const enBody = String(enRaw.body ?? "").replace(/\r\n/g, "\n").trim();
    if (!zhTitle || !zhSubtitle || !zhBody || !enTitle || !enSubtitle || !enBody) {
      return null;
    }
    return {
      version,
      locales: {
        zh: {
          title: zhTitle,
          subtitle: zhSubtitle,
          body: zhBody,
        },
        en: {
          title: enTitle,
          subtitle: enSubtitle,
          body: enBody,
        },
      },
    };
  }

  // 从主进程拉取最新分享文案（主进程负责远端拉取与本地兜底）。
  private async fetchShareCopyPayload(): Promise<ShareCopyPayload | null> {
    const bridge = (window as unknown as {
      oneclaw?: { settingsGetShareCopy?: () => Promise<unknown> };
    }).oneclaw;
    if (!bridge?.settingsGetShareCopy) {
      return null;
    }
    try {
      const result = await bridge.settingsGetShareCopy() as {
        success?: unknown;
        data?: unknown;
      };
      if (!result || result.success !== true) {
        return null;
      }
      return this.normalizeShareCopyPayload(result.data);
    } catch {
      return null;
    }
  }

  // 按当前客户端语言选择展示文案。
  private resolveSharePromptText(payload: ShareCopyPayload): string {
    return getLocale() === "zh" ? payload.locales.zh.body : payload.locales.en.body;
  }

  // 按当前客户端语言选择标题。
  private resolveSharePromptTitle(payload: ShareCopyPayload): string {
    return getLocale() === "zh" ? payload.locales.zh.title : payload.locales.en.title;
  }

  // 按当前客户端语言选择副标题。
  private resolveSharePromptSubtitle(payload: ShareCopyPayload): string {
    return getLocale() === "zh" ? payload.locales.zh.subtitle : payload.locales.en.subtitle;
  }

  // 达到阈值后尝试弹窗；同一版本只展示一次。
  private async maybeShowSharePrompt() {
    // Product decision: disable the share prompt completely.
    this.sharePromptVisible = false;
  }

  // 记录一次有效用户输入，并检查是否需要触发分享弹窗。
  private recordSharePromptInput() {
    // Product decision: disable the share prompt completely.
    return;
  }

  async handleSendChat(
    messageOverride?: string,
    opts?: Parameters<typeof handleSendChatInternal>[2],
  ) {
    const inputText = String(messageOverride ?? this.chatMessage ?? "").trim();
    const accepted = await handleSendChatInternal(
      this as unknown as Parameters<typeof handleSendChatInternal>[0],
      messageOverride,
      opts,
    );
    if (accepted && isSharePromptCountableInput(inputText)) {
      this.recordSharePromptInput();
    }
  }

  async handleExportConversations(params: {
    messages: unknown[];
    format: "markdown" | "html" | "pdf" | "png";
  }) {
    if (this.chatExportBusy) {
      return;
    }
    const selectedMessages = Array.isArray(params.messages) ? params.messages : [];
    if (selectedMessages.length === 0) {
      window.alert("Please select at least one round to export.");
      return;
    }
    const bridge = this.getOneClawBridge();
    if (!bridge?.chooseExportDirectory || !bridge.exportConversations) {
      window.alert("Export is unavailable in this environment.");
      return;
    }
    this.chatExportBusy = true;
    try {
      const dirResult = await bridge.chooseExportDirectory();
      if (!dirResult?.success || !dirResult.path) {
        return;
      }
      const row = this.sessionsResult?.sessions?.find((s) => s.key === this.sessionKey);
      const label = typeof row?.displayName === "string" && row.displayName.trim()
        ? row.displayName.trim()
        : typeof row?.label === "string" && row.label.trim()
          ? row.label.trim()
          : this.sessionKey;
      const items = [{
        sessionKey: this.sessionKey,
        label,
        messages: selectedMessages,
      }];
      const result = await bridge.exportConversations({
        outputDir: dirResult.path,
        format: params.format,
        items,
      });
      if (!result?.success) {
        window.alert(result?.message || "Export failed.");
        return;
      }
      const count = Array.isArray(result?.data?.files) ? result.data.files.length : items.length;
      window.alert(`Export completed: ${count} file(s) generated.`);
    } catch (err: any) {
      window.alert(err?.message || String(err));
    } finally {
      this.chatExportBusy = false;
    }
  }

  selectExportRounds() {
    if (this.chatExportSelecting) {
      this.chatExportSelecting = false;
      return;
    }
    this.chatExportSelectedKeys = [];
    this.chatExportSelectedItems = [];
    this.chatExportSelecting = true;
  }

  toggleExportItem(item: { key: string; order: number; messages: unknown[] }) {
    const key = String(item?.key || "").trim();
    if (!key) return;
    if (this.chatExportSelectedKeys.includes(key)) {
      this.chatExportSelectedKeys = this.chatExportSelectedKeys.filter((x) => x !== key);
      this.chatExportSelectedItems = this.chatExportSelectedItems.filter((x) => x.key !== key);
      return;
    }
    const nextItem = {
      key,
      order: Number(item.order) || 0,
      messages: Array.isArray(item.messages) ? item.messages : [],
    };
    this.chatExportSelectedKeys = [...this.chatExportSelectedKeys, key];
    this.chatExportSelectedItems = [...this.chatExportSelectedItems, nextItem];
  }

  async exportSelectedRoundsFromMore() {
    if (this.chatExportSelectedItems.length === 0) {
      window.alert("Please select rounds first.");
      return;
    }
    const ordered = [...this.chatExportSelectedItems]
      .sort((a, b) => a.order - b.order)
      .flatMap((entry) => entry.messages);
    await this.handleExportConversations({ messages: ordered, format: this.chatExportFormat });
    this.chatExportSelecting = false;
  }

  setChatExportFormat(next: string) {
    if (next === "markdown" || next === "html" || next === "pdf" || next === "png") {
      this.chatExportFormat = next;
    }
  }

  dismissSharePrompt() {
    this.sharePromptVisible = false;
    this.sharePromptCopied = false;
    this.sharePromptCopyError = null;
    this.sharePromptVersion = null;
  }

  async handleSharePromptCopy() {
    const text = this.sharePromptText.trim();
    this.sharePromptCopyError = null;
    if (!text) {
      this.sharePromptCopyError = t("sharePrompt.copyFailed");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      this.dismissSharePrompt();
      return;
    } catch {
      // Clipboard API failed; fall back to execCommand.
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    } finally {
      document.body.removeChild(textarea);
    }
    if (copied) {
      this.dismissSharePrompt();
    } else {
      this.sharePromptCopyError = t("sharePrompt.copyFailed");
    }
  }

  async handleWhatsAppStart(force: boolean) {
    await handleWhatsAppStartInternal(this, force);
  }

  async handleWhatsAppWait() {
    await handleWhatsAppWaitInternal(this);
  }

  async handleWhatsAppLogout() {
    await handleWhatsAppLogoutInternal(this);
  }

  async handleChannelConfigSave() {
    await handleChannelConfigSaveInternal(this);
  }

  async handleChannelConfigReload() {
    await handleChannelConfigReloadInternal(this);
  }

  handleNostrProfileEdit(accountId: string, profile: NostrProfile | null) {
    handleNostrProfileEditInternal(this, accountId, profile);
  }

  handleNostrProfileCancel() {
    handleNostrProfileCancelInternal(this);
  }

  handleNostrProfileFieldChange(field: keyof NostrProfile, value: string) {
    handleNostrProfileFieldChangeInternal(this, field, value);
  }

  async handleNostrProfileSave() {
    await handleNostrProfileSaveInternal(this);
  }

  async handleNostrProfileImport() {
    await handleNostrProfileImportInternal(this);
  }

  handleNostrProfileToggleAdvanced() {
    handleNostrProfileToggleAdvancedInternal(this);
  }

  async handleExecApprovalDecision(decision: "allow-once" | "allow-always" | "deny") {
    const active = this.execApprovalQueue[0];
    if (!active || !this.client || this.execApprovalBusy) {
      return;
    }
    this.execApprovalBusy = true;
    this.execApprovalError = null;
    try {
      await this.client.request("exec.approval.resolve", {
        id: active.id,
        decision,
      });
      this.execApprovalQueue = this.execApprovalQueue.filter((entry) => entry.id !== active.id);
    } catch (err) {
      this.execApprovalError = `Exec approval failed: ${String(err)}`;
    } finally {
      this.execApprovalBusy = false;
    }
  }

  handleGatewayUrlConfirm() {
    const nextGatewayUrl = this.pendingGatewayUrl;
    if (!nextGatewayUrl) {
      return;
    }
    this.pendingGatewayUrl = null;
    applySettingsInternal(this as unknown as Parameters<typeof applySettingsInternal>[0], {
      ...this.settings,
      gatewayUrl: nextGatewayUrl,
    });
    this.connect();
  }

  handleGatewayUrlCancel() {
    this.pendingGatewayUrl = null;
  }

  // Sidebar handlers for tool output viewing
  handleOpenSidebar(content: string) {
    if (this.sidebarCloseTimer != null) {
      window.clearTimeout(this.sidebarCloseTimer);
      this.sidebarCloseTimer = null;
    }
    this.sidebarContent = content;
    this.sidebarError = null;
    this.sidebarOpen = true;
  }

  handleCloseSidebar() {
    this.sidebarOpen = false;
    // Clear content after transition
    if (this.sidebarCloseTimer != null) {
      window.clearTimeout(this.sidebarCloseTimer);
    }
    this.sidebarCloseTimer = window.setTimeout(() => {
      if (this.sidebarOpen) {
        return;
      }
      this.sidebarContent = null;
      this.sidebarError = null;
      this.sidebarCloseTimer = null;
    }, 200);
  }

  handleSplitRatioChange(ratio: number) {
    const newRatio = Math.max(0.4, Math.min(0.7, ratio));
    this.splitRatio = newRatio;
    this.applySettings({ ...this.settings, splitRatio: newRatio });
  }

  archiveCurrentConversation() {
    const source = Array.isArray(this.chatMessages) ? this.chatMessages : [];
    if (source.length === 0) {
      return;
    }
    const hasMeaningfulContent = source.some((entry) => {
      if (typeof entry === "string") {
        return entry.trim().length > 0;
      }
      if (!entry || typeof entry !== "object") {
        return false;
      }
      const row = entry as Record<string, unknown>;
      if (typeof row.content === "string" && row.content.trim().length > 0) {
        return true;
      }
      if (Array.isArray(row.content)) {
        return row.content.some((part) => {
          if (!part || typeof part !== "object") {
            return false;
          }
          const block = part as Record<string, unknown>;
          return typeof block.text === "string" && block.text.trim().length > 0;
        });
      }
      return false;
    });
    if (!hasMeaningfulContent) {
      return;
    }
    const sessionRow = this.sessionsResult?.sessions?.find((row) => row.key === this.sessionKey);
    const label =
      sessionRow?.displayName?.trim() || sessionRow?.label?.trim() || this.sessionKey;
    this.chatArchives = saveChatArchive({
      sessionKey: this.sessionKey,
      label,
      messages: source,
    });
    if (!this.historySelectedArchiveId) {
      this.historySelectedArchiveId = this.chatArchives[0]?.id ?? null;
    }
  }

  openHistoryPanel() {
    this.historyPanelOpen = true;
    if (!this.historySelectedArchiveId) {
      this.historySelectedArchiveId = this.chatArchives[0]?.id ?? null;
    }
  }

  closeHistoryPanel() {
    this.historyPanelOpen = false;
  }

  selectHistoryArchive(id: string) {
    this.historySelectedArchiveId = id;
  }

  toggleExplorerPanel() {
    this.explorerPanelOpen = !this.explorerPanelOpen;
  }

  setExplorerPathInput(next: string) {
    this.explorerPathInput = next;
  }

  async chooseExplorerFolder() {
    const bridge = this.getOneClawBridge();
    if (!bridge?.chooseExplorerDirectory) {
      this.explorerError = "Explorer bridge is unavailable.";
      return;
    }
    const result = await bridge.chooseExplorerDirectory();
    if (!result?.success || !result.path) {
      return;
    }
    this.explorerPathInput = result.path;
    await this.loadExplorerTree(result.path);
  }

  async refreshExplorerTree() {
    const rootPath = this.explorerPathInput.trim() || this.explorerRootPath.trim();
    if (!rootPath) {
      this.explorerError = "Please input a path first.";
      return;
    }
    await this.loadExplorerTree(rootPath);
  }

  async loadExplorerTree(rootPath: string) {
    const bridge = this.getOneClawBridge();
    if (!bridge?.listExplorerTree) {
      this.explorerError = "Explorer bridge is unavailable.";
      return;
    }
    this.explorerLoading = true;
    this.explorerError = null;
    try {
      const result = await bridge.listExplorerTree({ rootPath });
      if (!result?.success) {
        this.explorerTree = [];
        this.explorerError = result?.message || "Failed to read directory.";
        return;
      }
      this.explorerRootPath = String(result?.data?.rootPath || rootPath);
      this.explorerPathInput = this.explorerRootPath;
      const nodes = Array.isArray(result?.data?.nodes) ? result.data.nodes : [];
      this.explorerTree = nodes.map((node) => ({
        ...node,
        children: node.type === "directory" ? [] : undefined,
        childrenLoaded: false,
      }));
      this.explorerExpandedDirs = [this.explorerRootPath];
      this.explorerLoadingDirs = [];
    } catch (err: any) {
      this.explorerTree = [];
      this.explorerError = err?.message || String(err);
    } finally {
      this.explorerLoading = false;
    }
  }

  async openExplorerFile(filePath: string, displayName: string) {
    const bridge = this.getOneClawBridge();
    if (!bridge?.readExplorerFile) {
      this.explorerError = "Explorer bridge is unavailable.";
      return;
    }
    try {
      const result = await bridge.readExplorerFile({ filePath });
      if (!result?.success) {
        this.explorerError = result?.message || "Failed to read file.";
        return;
      }
      this.explorerError = null;
      this.explorerActiveFilePath = String(result?.data?.filePath || filePath);
      this.explorerActiveFileName = displayName || this.explorerActiveFilePath;
      this.explorerFileContent = String(result?.data?.content || "");
      this.explorerFileTruncated = result?.data?.truncated === true;
    } catch (err: any) {
      this.explorerError = err?.message || String(err);
    }
  }

  isExplorerDirExpanded(path: string) {
    return this.explorerExpandedDirs.includes(path);
  }

  isExplorerDirLoading(path: string) {
    return this.explorerLoadingDirs.includes(path);
  }

  async toggleExplorerDir(path: string) {
    if (!path) {
      return;
    }
    if (this.explorerExpandedDirs.includes(path)) {
      this.explorerExpandedDirs = this.explorerExpandedDirs.filter((p) => p !== path);
      return;
    }
    this.explorerExpandedDirs = [...this.explorerExpandedDirs, path];
    await this.loadExplorerChildren(path);
  }

  collapseAllExplorerDirs() {
    this.explorerExpandedDirs = [];
  }

  private patchExplorerChildren(
    nodes: ExplorerNode[],
    targetPath: string,
    children: ExplorerNode[],
  ): ExplorerNode[] {
    return nodes.map((node) => {
      if (node.type === "directory" && node.path === targetPath) {
        return {
          ...node,
          children,
          childrenLoaded: true,
        };
      }
      if (node.type === "directory" && Array.isArray(node.children) && node.children.length > 0) {
        return {
          ...node,
          children: this.patchExplorerChildren(node.children, targetPath, children),
        };
      }
      return node;
    });
  }

  async loadExplorerChildren(directoryPath: string) {
    const bridge = this.getOneClawBridge();
    if (!bridge?.listExplorerChildren || !directoryPath) {
      return;
    }
    const alreadyLoaded = (nodes: ExplorerNode[]): boolean => {
      for (const node of nodes) {
        if (node.type === "directory" && node.path === directoryPath) {
          return node.childrenLoaded === true;
        }
        if (node.type === "directory" && Array.isArray(node.children) && node.children.length > 0) {
          if (alreadyLoaded(node.children)) {
            return true;
          }
        }
      }
      return false;
    };
    if (alreadyLoaded(this.explorerTree) || this.explorerLoadingDirs.includes(directoryPath)) {
      return;
    }
    this.explorerLoadingDirs = [...this.explorerLoadingDirs, directoryPath];
    try {
      const result = await bridge.listExplorerChildren({ directoryPath });
      if (!result?.success) {
        this.explorerError = result?.message || "Failed to read child directory.";
        return;
      }
      const nodes = Array.isArray(result?.data?.nodes) ? result.data.nodes : [];
      const normalized = nodes.map((node) => ({
        ...node,
        children: node.type === "directory" ? [] : undefined,
        childrenLoaded: false,
      }));
      this.explorerTree = this.patchExplorerChildren(this.explorerTree, directoryPath, normalized);
    } catch (err: any) {
      this.explorerError = err?.message || String(err);
    } finally {
      this.explorerLoadingDirs = this.explorerLoadingDirs.filter((p) => p !== directoryPath);
    }
  }

  render() {
    return renderApp(this as unknown as AppViewState);
  }
}
