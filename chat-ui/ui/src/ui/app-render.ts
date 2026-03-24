/**
 * OneClaw custom app-render.ts
 * Replaces the upstream 13-tab dashboard with a minimal sidebar + chat layout.
 * Chat view and all chat functionality are preserved from upstream.
 */
import { html, nothing } from "lit";
import type { AppViewState } from "./app-view-state.ts";
import { parseAgentSessionKey } from "../../../src/routing/session-key.js";
import { refreshChat, refreshChatAvatar } from "./app-chat.ts";
import { syncUrlWithSessionKey } from "./app-settings.ts";
import { loadChatHistory } from "./controllers/chat.ts";
import { getLocale, t } from "./i18n.ts";
import { icons } from "./icons.ts";
import { renderSidebar } from "./sidebar.ts";
import { renderChat } from "./views/chat.ts";
import { renderExecApprovalPrompt } from "./views/exec-approval.ts";
import { renderGatewayUrlConfirmation } from "./views/gateway-url-confirmation.ts";

declare global {
  interface Window {
    oneclaw?: {
      openSettings?: () => void;
      openWebUI?: () => void;
      openExternal?: (url: string) => unknown;
      getGatewayPort?: () => Promise<number>;
      downloadAndInstallUpdate?: () => Promise<boolean>;
      listInstalledSkills?: () => Promise<unknown>;
      searchGithubSkills?: (query: string) => Promise<unknown>;
      installGithubSkill?: (params: {
        repoFullName: string;
        skillPath: string;
        name?: string;
      }) => Promise<unknown>;
      chooseExportDirectory?: () => Promise<unknown>;
      exportConversations?: (params: unknown) => Promise<unknown>;
    };
  }
}

const AVATAR_DATA_RE = /^data:/i;
const AVATAR_HTTP_RE = /^https?:\/\//i;

function resolveAssistantAvatarUrl(state: AppViewState): string | undefined {
  const list = state.agentsList?.agents ?? [];
  const parsed = parseAgentSessionKey(state.sessionKey);
  const agentId = parsed?.agentId ?? state.agentsList?.defaultId ?? "main";
  const agent = list.find((entry) => entry.id === agentId);
  const identity = agent?.identity;
  const candidate = identity?.avatarUrl ?? identity?.avatar;
  if (!candidate) {
    return undefined;
  }
  if (AVATAR_DATA_RE.test(candidate) || AVATAR_HTTP_RE.test(candidate)) {
    return candidate;
  }
  return identity?.avatarUrl;
}

function applySessionKey(state: AppViewState, next: string, syncUrl = false) {
  if (!next || next === state.sessionKey) {
    return;
  }
  state.sessionKey = next;
  state.chatMessage = "";
  state.chatAttachments = [];
  state.chatStream = null;
  (state as any).chatStreamStartedAt = null;
  state.chatRunId = null;
  state.chatQueue = [];
  (state as any).resetToolStream();
  (state as any).resetChatScroll();
  state.applySettings({
    ...state.settings,
    sessionKey: next,
    lastActiveSessionKey: next,
  });
  if (syncUrl) {
    syncUrlWithSessionKey(
      state as unknown as Parameters<typeof syncUrlWithSessionKey>[0],
      next,
      true,
    );
  }
  void state.loadAssistantIdentity();
  void loadChatHistory(state as any);
  void refreshChatAvatar(state as any);
}

function resolveSessionOptionLabel(
  key: string,
  row?: (NonNullable<AppViewState["sessionsResult"]>["sessions"][number] | undefined),
): string {
  const displayName = typeof row?.displayName === "string" ? row.displayName.trim() : "";
  const label = typeof row?.label === "string" ? row.label.trim() : "";
  if (displayName && displayName !== key) {
    return `${displayName} (${key})`;
  }
  if (label && label !== key) {
    return `${label} (${key})`;
  }
  return key;
}

type SessionDefaultsSnapshot = {
  mainSessionKey?: string;
  mainKey?: string;
};

function resolveMainSessionKey(state: AppViewState): string | null {
  const snapshot = state.hello?.snapshot as { sessionDefaults?: SessionDefaultsSnapshot } | undefined;
  const mainSessionKey = snapshot?.sessionDefaults?.mainSessionKey?.trim();
  if (mainSessionKey) {
    return mainSessionKey;
  }
  const mainKey = snapshot?.sessionDefaults?.mainKey?.trim();
  if (mainKey) {
    return mainKey;
  }
  if (state.sessionsResult?.sessions?.some((row) => row.key === "main")) {
    return "main";
  }
  return null;
}

function resolveSessionOptions(state: AppViewState): Array<{ key: string; label: string }> {
  const sessions = state.sessionsResult?.sessions ?? [];
  const current = state.sessionKey?.trim() || "main";
  const mainSessionKey = resolveMainSessionKey(state);
  const mainSession = mainSessionKey
    ? sessions.find((entry) => entry.key === mainSessionKey)
    : undefined;
  const currentSession = sessions.find((entry) => entry.key === current);
  const seen = new Set<string>();
  const options: Array<{ key: string; label: string }> = [];

  const pushOption = (
    key: string,
    row?: (NonNullable<AppViewState["sessionsResult"]>["sessions"][number] | undefined),
  ) => {
    const trimmedKey = String(key || "").trim();
    if (!trimmedKey || seen.has(trimmedKey)) {
      return;
    }
    seen.add(trimmedKey);
    options.push({
      key: trimmedKey,
      label: resolveSessionOptionLabel(trimmedKey, row),
    });
  };

  // 与原版 Web UI 保持一致：优先展示 main 会话，然后展示当前会话。
  if (mainSessionKey) {
    pushOption(mainSessionKey, mainSession);
  }
  pushOption(current, currentSession);

  // 最后补齐 sessions.list 返回的其他会话。
  for (const session of sessions) {
    pushOption(session.key, session);
  }

  // Add synthetic agent sessions so you can switch between multiple agents
  // even if those sessions haven't been created yet.
  const agents = state.agentsList?.agents ?? [];
  const agentRest = (mainSessionKey ?? "main").trim();
  if (agents.length > 0) {
    for (const agent of agents) {
      const agentId = String(agent?.id ?? "").trim();
      if (!agentId) continue;
      const key = `agent:${agentId}:${agentRest}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const label =
        agent?.identity?.name?.trim() ||
        agent?.identity?.avatarUrl?.trim() ||
        (typeof (agent as any)?.name === "string" ? (agent as any).name.trim() : "") ||
        agentId;
      options.push({ key, label });
    }
  }

  if (options.length === 0) {
    return [{ key: current, label: current }];
  }
  return options;
}

function handleSessionChange(state: AppViewState, nextSessionKey: string) {
  if (!nextSessionKey.trim()) {
    return;
  }
  applySessionKey(state, nextSessionKey, true);
}

function setOneClawView(state: AppViewState, next: "chat" | "settings" | "skills") {
  const prev = state.settings.oneclawView ?? "chat";
  if (prev === next) {
    return;
  }
  state.applySettings({
    ...state.settings,
    oneclawView: next,
  });

  // 从非聊天页回到聊天页后，定位到最新消息，避免停留在会话开头。
  if (prev !== "chat" && next === "chat") {
    void state.updateComplete.then(() => {
      state.scrollToBottom();
    });
  }
}

// 打开内嵌设置页时可携带目标 tab 提示，减少用户二次定位成本。
function openSettingsView(state: AppViewState, tabHint: "channels" | null = null) {
  state.settingsTabHint = tabHint;
  setOneClawView(state, "settings");
}

function confirmAndCreateNewSession(state: AppViewState) {
  const ok = window.confirm(t("chat.confirmNewSession"));
  if (!ok) {
    return;
  }
  setOneClawView(state, "chat");
  return state.handleSendChat("/new", { restoreDraft: true });
}

async function handleRefreshChat(state: AppViewState) {
  if (state.chatLoading || !state.connected) {
    return;
  }
  const app = state as any;
  app.chatManualRefreshInFlight = true;
  app.chatNewMessagesBelow = false;
  await state.updateComplete;
  app.resetToolStream();
  try {
    await refreshChat(state as unknown as Parameters<typeof refreshChat>[0], {
      scheduleScroll: false,
    });
    app.scrollToBottom({ smooth: true });
  } finally {
    requestAnimationFrame(() => {
      app.chatManualRefreshInFlight = false;
      app.chatNewMessagesBelow = false;
    });
  }
}

async function handleOpenWebUI(state: AppViewState) {
  if (window.oneclaw?.openWebUI) {
    window.oneclaw.openWebUI();
  } else if (window.oneclaw?.openExternal) {
    let port = 18789;
    try {
      if (window.oneclaw.getGatewayPort) {
        port = await window.oneclaw.getGatewayPort();
      }
    } catch { /* use default */ }
    const token = state.settings.token.trim();
    const query = token ? `?token=${encodeURIComponent(token)}` : "";
    window.oneclaw.openExternal(`http://127.0.0.1:${port}/${query}`);
  }
}

// 仅在存在可用更新时触发下载与安装，避免误触发无效 IPC 调用。
async function handleApplyUpdate(state: AppViewState) {
  const current = state.updateBannerState;
  if (current.status !== "available") {
    return;
  }
  try {
    await window.oneclaw?.downloadAndInstallUpdate?.();
  } catch {
    // ignore bridge failure; main process会记录日志并回退状态
  }
}

function ensureSettingsEmbedBridge(state: AppViewState) {
  const bridgeKey = "__oneclawSettingsEmbedBridge";
  const w = window as unknown as {
    [bridgeKey]?: { state: AppViewState; bound: boolean };
  };
  if (!w[bridgeKey]) {
    w[bridgeKey] = { state, bound: false };
  } else {
    w[bridgeKey]!.state = state;
  }
  if (w[bridgeKey]!.bound) {
    return;
  }

  window.addEventListener("message", (event: MessageEvent) => {
    const bridge = (window as unknown as { [bridgeKey]?: { state: AppViewState } })[bridgeKey];
    if (!bridge) {
      return;
    }
    const data = event.data as
      | {
          source?: string;
          type?: string;
          payload?: { theme?: "system" | "light" | "dark"; showThinking?: boolean };
        }
      | undefined;
    if (!data || data.source !== "oneclaw-settings-embed") {
      return;
    }

    if (data.type === "appearance-request-init") {
      if (event.source && "postMessage" in event.source) {
        (event.source as Window).postMessage(
          {
            source: "oneclaw-chat-ui",
            type: "appearance-init",
            payload: {
              theme: bridge.state.theme,
              showThinking: bridge.state.settings.chatShowThinking,
            },
          },
          "*",
        );
      }
      return;
    }

    if (data.type === "appearance-save") {
      const nextTheme = data.payload?.theme;
      const nextShowThinking = data.payload?.showThinking;
      if (nextTheme === "system" || nextTheme === "light" || nextTheme === "dark") {
        bridge.state.setTheme(nextTheme);
      }
      if (typeof nextShowThinking === "boolean") {
        bridge.state.applySettings({
          ...bridge.state.settings,
          chatShowThinking: nextShowThinking,
        });
      }
    }
  });

  w[bridgeKey]!.bound = true;
}

function resolveEmbeddedSettingsUrl(state: AppViewState) {
  const lang = getLocale();
  const baseUrl = new URL(window.location.href);
  const settingsUrl = new URL("../../settings/index.html", baseUrl);
  settingsUrl.searchParams.set("lang", lang);
  settingsUrl.searchParams.set("embedded", "1");
  settingsUrl.searchParams.set("theme", state.theme);
  settingsUrl.searchParams.set(
    "showThinking",
    state.settings.chatShowThinking ? "1" : "0",
  );
  if (state.settingsTabHint) {
    settingsUrl.searchParams.set("tab", state.settingsTabHint);
  }
  return settingsUrl.toString();
}

function renderOneClawSettingsPage(state: AppViewState) {
  ensureSettingsEmbedBridge(state);
  const settingsUrl = resolveEmbeddedSettingsUrl(state);
  return html`
    <section class="oneclaw-settings-host">
      <iframe
        class="oneclaw-settings-iframe"
        src=${settingsUrl}
        title=${t("settings.title")}
      ></iframe>
    </section>
  `;
}

function openSkillFolder(pathValue: string) {
  const cleanPath = pathValue.trim();
  if (!cleanPath) {
    return;
  }
  const targetUrl = /^https?:\/\//i.test(cleanPath) ? cleanPath : `file://${encodeURI(cleanPath)}`;
  if (window.oneclaw?.openExternal) {
    void window.oneclaw.openExternal(targetUrl);
    return;
  }
  window.open(targetUrl, "_blank");
}

function resolveInstalledSkillSourceLabel(source: string): string {
  if (source === "bundled") {
    return t("sidebar.skillsSourceBundled");
  }
  if (source === "workspace") {
    return t("sidebar.skillsSourceWorkspace");
  }
  if (source === "global") {
    return t("sidebar.skillsSourceGlobal");
  }
  return t("sidebar.skillsSourceUser");
}

function renderOneClawSkillsPage(state: AppViewState) {
  const activeTab = state.skillsTab;
  const filter = state.installedSkillsFilter.trim().toLowerCase();
  const baseSkills = activeTab === "built-in"
    ? state.installedSkills.filter((skill) => skill.source === "bundled")
    : state.installedSkills.filter((skill) => skill.source !== "bundled");
  const filteredSkills = filter
    ? baseSkills.filter((skill) => `${skill.name} ${skill.source} ${skill.path}`.toLowerCase().includes(filter))
    : baseSkills;
  const selectedSkill = activeTab === "search"
    ? null
    : (
      filteredSkills.find((skill) => `${skill.source}:${skill.name}:${skill.path}` === state.installedSkillsSelectedKey)
      ?? (filteredSkills[0] ?? null)
    );
  const selectedLabel = selectedSkill ? resolveInstalledSkillSourceLabel(selectedSkill.source) : "";
  const githubQuery = state.githubSkillSearchQuery.trim();

  return html`
    <section class="oneclaw-skills-page">
      <header class="oneclaw-skills-page__header">
        <div>
          <h2 class="oneclaw-skills-page__title">${t("skills.pageTitle")}</h2>
          <p class="oneclaw-skills-page__subtitle">${t("skills.pageSubtitle")}</p>
        </div>
        <button
          class="btn oneclaw-skills-page__refresh"
          type="button"
          ?disabled=${state.installedSkillsLoading}
          @click=${() => void state.refreshInstalledSkills()}
        >
          ${state.installedSkillsLoading ? t("skills.loading") : t("skills.refresh")}
        </button>
      </header>

      <div class="oneclaw-skills-page__tabs" role="tablist" aria-label="Skills tabs">
        <button
          class="oneclaw-skills-page__tab ${activeTab === "built-in" ? "is-active" : ""}"
          type="button"
          role="tab"
          @click=${() => state.setSkillsTab("built-in")}
        >
          ${t("skills.tabBuiltIn")}
        </button>
        <button
          class="oneclaw-skills-page__tab ${activeTab === "installed" ? "is-active" : ""}"
          type="button"
          role="tab"
          @click=${() => state.setSkillsTab("installed")}
        >
          ${t("skills.tabInstalled")}
        </button>
        <button
          class="oneclaw-skills-page__tab ${activeTab === "search" ? "is-active" : ""}"
          type="button"
          role="tab"
          @click=${() => state.setSkillsTab("search")}
        >
          ${t("skills.tabSearchInstall")}
        </button>
      </div>

      ${
        activeTab === "search"
          ? html`
              <div class="oneclaw-skills-page__search">
                <div class="oneclaw-skills-page__search-row">
                  <input
                    class="oneclaw-skills-page__search-input"
                    type="search"
                    .value=${state.githubSkillSearchQuery}
                    placeholder=${t("skills.searchGithubPlaceholder")}
                    @input=${(event: Event) =>
                      state.setGithubSkillSearchQuery((event.target as HTMLInputElement).value)}
                    @keydown=${(event: KeyboardEvent) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void state.searchGithubSkills();
                      }
                    }}
                  />
                  <button
                    class="btn oneclaw-skills-page__refresh"
                    type="button"
                    ?disabled=${state.githubSkillSearchLoading || githubQuery.length < 2}
                    @click=${() => void state.searchGithubSkills()}
                  >
                    ${state.githubSkillSearchLoading ? t("skills.searchingGithub") : t("skills.searchGithub")}
                  </button>
                </div>
                <div class="muted">${t("skills.searchGithubHint")}</div>
              </div>

              <div class="oneclaw-skills-page__content">
                ${state.githubSkillSearchError
                  ? html`
                      <div class="oneclaw-skills-page__empty is-error">
                        ${state.githubSkillSearchError}
                      </div>
                    `
                  : nothing}
                ${state.githubSkillInstallMessage
                  ? html`
                      <div class="oneclaw-skills-page__empty">
                        ${state.githubSkillInstallMessage}
                      </div>
                    `
                  : nothing}
                ${state.githubSkillSearchResults.length === 0 && !state.githubSkillSearchError
                  ? html`<div class="oneclaw-skills-page__empty">${t("skills.searchGithubEmpty")}</div>`
                  : html`
                      <div class="oneclaw-skills-page__table" role="list">
                        ${state.githubSkillSearchResults.map((item) => {
                          const busy = state.githubSkillInstallBusyId === item.id;
                          return html`
                            <div class="oneclaw-skills-page__cell" role="listitem">
                              <span class="oneclaw-skills-page__cell-name">${item.name}</span>
                              <span class="oneclaw-skills-page__cell-source">${item.repoFullName}</span>
                              ${
                                item.description
                                  ? html`<span class="oneclaw-skills-page__cell-desc">${item.description}</span>`
                                  : nothing
                              }
                              <div class="oneclaw-skills-page__cell-actions">
                                <button
                                  class="btn oneclaw-skills-page__item-open"
                                  type="button"
                                  @click=${() => openSkillFolder(item.repoUrl)}
                                >
                                  ${t("skills.openRepo")}
                                </button>
                                <button
                                  class="btn primary oneclaw-skills-page__item-open"
                                  type="button"
                                  ?disabled=${Boolean(state.githubSkillInstallBusyId)}
                                  @click=${() => void state.installGithubSkill(item.id)}
                                >
                                  ${busy ? t("skills.installingGithub") : t("skills.installToWorkspace")}
                                </button>
                              </div>
                            </div>
                          `;
                        })}
                      </div>
                    `}
              </div>
            `
          : html`
              <div class="oneclaw-skills-page__search">
                <input
                  class="oneclaw-skills-page__search-input"
                  type="search"
                  .value=${state.installedSkillsFilter}
                  placeholder=${t("skills.searchPlaceholder")}
                  @input=${(event: Event) =>
                    state.setInstalledSkillsFilter((event.target as HTMLInputElement).value)}
                />
              </div>

              <div class="oneclaw-skills-page__content">
                ${state.installedSkillsLoading
                  ? html`<div class="oneclaw-skills-page__empty">${t("skills.loading")}</div>`
                  : state.installedSkillsError
                    ? html`
                        <div class="oneclaw-skills-page__empty is-error">
                          ${t("skills.loadError")}: ${state.installedSkillsError}
                        </div>
                      `
                    : filteredSkills.length === 0
                      ? html`<div class="oneclaw-skills-page__empty">${t("skills.empty")}</div>`
                      : html`
                          <div class="oneclaw-skills-page__table" role="list">
                            ${filteredSkills.map((skill) => {
                              const itemKey = `${skill.source}:${skill.name}:${skill.path}`;
                              const active = selectedSkill !== null && itemKey === `${selectedSkill.source}:${selectedSkill.name}:${selectedSkill.path}`;
                              return html`
                                <button
                                  class="oneclaw-skills-page__cell ${active ? "is-active" : ""}"
                                  role="listitem"
                                  type="button"
                                  @click=${() => state.setInstalledSkillsSelectedKey(itemKey)}
                                  title=${skill.path}
                                >
                                  <span class="oneclaw-skills-page__cell-name">${skill.name}</span>
                                  <span class="oneclaw-skills-page__cell-source">
                                    ${resolveInstalledSkillSourceLabel(skill.source)}
                                  </span>
                                </button>
                              `;
                            })}
                          </div>
                          <section class="oneclaw-skills-page__details">
                            <h3 class="oneclaw-skills-page__details-title">${t("skills.detailsTitle")}</h3>
                            ${selectedSkill
                              ? html`
                                  <div class="oneclaw-skills-page__detail-row">
                                    <span class="oneclaw-skills-page__detail-key">Name</span>
                                    <span class="oneclaw-skills-page__detail-value">${selectedSkill.name}</span>
                                  </div>
                                  <div class="oneclaw-skills-page__detail-row">
                                    <span class="oneclaw-skills-page__detail-key">Source</span>
                                    <span class="oneclaw-skills-page__detail-value">${selectedLabel}</span>
                                  </div>
                                  <div class="oneclaw-skills-page__detail-row">
                                    <span class="oneclaw-skills-page__detail-key">Path</span>
                                    <code class="oneclaw-skills-page__detail-path">${selectedSkill.path}</code>
                                  </div>
                                  <div class="oneclaw-skills-page__detail-actions">
                                    <button
                                      class="btn oneclaw-skills-page__item-open"
                                      type="button"
                                      @click=${() => openSkillFolder(selectedSkill.path)}
                                    >
                                      ${t("skills.openFolder")}
                                    </button>
                                  </div>
                                `
                              : html`<div class="oneclaw-skills-page__empty">${t("skills.clickHint")}</div>`}
                          </section>
                        `}
              </div>
            `
      }
    </section>
  `;
}

// 在聊天页顶部展示飞书待审批卡片，把“去设置里找批准”改成主流程内的一步动作。
function renderFeishuPairingNotice(state: AppViewState) {
  if (!state.shouldShowFeishuPairingNotice()) {
    return nothing;
  }
  const first = state.feishuPairingState.requests[0];
  const peerLabel = first?.name?.trim() || first?.id?.trim() || t("feishu.pendingUnknown");
  return html`
    <section class="oneclaw-feishu-notice">
      <div class="oneclaw-feishu-notice__main">
        <div class="oneclaw-feishu-notice__title">${t("feishu.pendingTitle")}</div>
        <div class="oneclaw-feishu-notice__desc">
          ${t("feishu.pendingDesc").replace("{name}", peerLabel)}
        </div>
      </div>
      <div class="oneclaw-feishu-notice__actions">
        <button
          class="oneclaw-feishu-notice__icon-btn is-approve"
          type="button"
          ?disabled=${state.feishuPairingApproving || state.feishuPairingRejecting}
          title=${t("feishu.approveNow")}
          aria-label=${t("feishu.approveNow")}
          @click=${() => void state.approveFirstFeishuPairing()}
        >
          ${icons.check}
        </button>
        <button
          class="oneclaw-feishu-notice__icon-btn is-reject"
          type="button"
          ?disabled=${state.feishuPairingApproving || state.feishuPairingRejecting}
          title=${t("feishu.rejectNow")}
          aria-label=${t("feishu.rejectNow")}
          @click=${() => void state.rejectFirstFeishuPairing()}
        >
          ${icons.x}
        </button>
      </div>
    </section>
  `;
}

export function renderApp(state: AppViewState) {
  const chatDisabledReason = state.connected ? null : t("error.disconnected");
  const showThinking = state.onboarding ? false : state.settings.chatShowThinking;
  const assistantAvatarUrl = resolveAssistantAvatarUrl(state);
  const chatAvatarUrl = state.chatAvatarUrl ?? assistantAvatarUrl ?? null;
  const chatFocus = state.onboarding;
  const sidebarCollapsed = !state.onboarding && state.settings.navCollapsed;
  const currentSessionKey = state.sessionKey;
  const sessionOptions = resolveSessionOptions(state);
  const oneclawView = state.settings.oneclawView ?? "chat";
  const settingsActive = oneclawView === "settings";
  const skillsActive = oneclawView === "skills";
  const chatActive = oneclawView === "chat";
  const updateBannerState = state.updateBannerState;

  return html`
    <div
      class="oneclaw-shell ${chatFocus ? "oneclaw-shell--focus" : ""} ${sidebarCollapsed ? "oneclaw-shell--sidebar-collapsed" : ""}"
    >
      ${chatFocus || sidebarCollapsed
        ? nothing
        : renderSidebar({
            connected: state.connected,
            currentSessionKey,
            sessionOptions,
            chatActive,
            settingsActive,
            skillsActive,
            updateStatus: updateBannerState.status,
            updateVersion: updateBannerState.version,
            updatePercent: updateBannerState.percent,
            updateShowBadge: updateBannerState.showBadge,
            refreshDisabled: state.chatLoading || !state.connected,
            exportBusy: state.chatExportBusy,
            exportSelectedCount: state.chatExportSelectedKeys.length,
            exportSelecting: state.chatExportSelecting,
            onOpenChat: () => setOneClawView(state, "chat"),
            onNewChat: () => confirmAndCreateNewSession(state),
            onSelectSession: (nextSessionKey: string) => handleSessionChange(state, nextSessionKey),
            onRefresh: () => void handleRefreshChat(state),
            onSelectExportRounds: () => state.selectExportRounds(),
            onToggleSidebar: () => {
              state.applySettings({
                ...state.settings,
                navCollapsed: !state.settings.navCollapsed,
              });
            },
            onOpenSettings: () => openSettingsView(
              state,
              state.feishuPairingState.pendingCount > 0 ? "channels" : null,
            ),
            onOpenSkills: () => {
              setOneClawView(state, "skills");
              state.setSkillsTab("built-in");
              void state.refreshInstalledSkills();
            },
            onOpenWebUI: () => void handleOpenWebUI(state),
            onOpenDocs: () => {
              if (window.oneclaw?.openExternal) {
                window.oneclaw.openExternal("https://openclaw.ai/");
              } else {
                window.open("https://openclaw.ai/", "_blank");
              }
            },
            onApplyUpdate: () => void handleApplyUpdate(state),
          })}

      <div class="oneclaw-main">
        ${
          sidebarCollapsed && !chatFocus
            ? html`
                <button
                  class="oneclaw-sidebar-toggle-floating"
                  type="button"
                  @click=${() => {
                    state.applySettings({
                      ...state.settings,
                      navCollapsed: false,
                    });
                  }}
                  title=${t("sidebar.expand")}
                  aria-label=${t("sidebar.expand")}
                >
                  ${icons.menu}
                </button>
              `
            : nothing
        }

        <main class="oneclaw-content">
          ${renderFeishuPairingNotice(state)}
          ${settingsActive
            ? renderOneClawSettingsPage(state)
            : skillsActive
              ? renderOneClawSkillsPage(state)
            : html`
                ${renderChat({
                  sessionKey: state.sessionKey,
                  onSessionKeyChange: (next) => applySessionKey(state, next),
                  thinkingLevel: state.chatThinkingLevel,
                  showThinking,
                  loading: state.chatLoading,
                  sending: state.chatSending,
                  compactionStatus: state.compactionStatus,
                  assistantAvatarUrl: chatAvatarUrl,
                  messages: state.chatMessages,
                  toolMessages: state.chatToolMessages,
                  stream: state.chatStream,
                  streamStartedAt: (state as any).chatStreamStartedAt,
                  draft: state.chatMessage,
                  queue: state.chatQueue,
                  connected: state.connected,
                  canSend: state.connected,
                  disabledReason: chatDisabledReason,
                  error: state.lastError,
                  sessions: state.sessionsResult,
                  focusMode: false,
                  onRefresh: () => {
                    (state as any).resetToolStream();
                    return Promise.all([loadChatHistory(state as any), refreshChatAvatar(state as any)]);
                  },
                  onToggleFocusMode: () => {},
                  onChatScroll: (event) => state.handleChatScroll(event),
                  onDraftChange: (next) => (state.chatMessage = next),
                  attachments: state.chatAttachments,
                  onAttachmentsChange: (next) => (state.chatAttachments = next),
                  onSend: () => state.handleSendChat(),
                  canAbort: Boolean(state.chatRunId),
                  onAbort: () => void state.handleAbortChat(),
                  onQueueRemove: (id) => state.removeQueuedMessage(id),
                  onNewSession: () => confirmAndCreateNewSession(state),
                  exportSelecting: state.chatExportSelecting,
                  exportSelectedKeys: state.chatExportSelectedKeys,
                  onToggleExportItem: (item: { key: string; order: number; messages: unknown[] }) =>
                    state.toggleExportItem(item),
                  exportBusy: state.chatExportBusy,
                  exportFormat: state.chatExportFormat,
                  onExportFormatChange: (next: "markdown" | "html" | "pdf" | "png") =>
                    state.setChatExportFormat(next),
                  onExportSelectedRounds: () => void state.exportSelectedRoundsFromMore(),
                  showNewMessages: state.chatNewMessagesBelow && !state.chatManualRefreshInFlight,
                  onScrollToBottom: () => state.scrollToBottom(),
                  sidebarOpen: state.sidebarOpen,
                  sidebarContent: state.sidebarContent,
                  sidebarError: state.sidebarError,
                  splitRatio: state.splitRatio,
                  onOpenSidebar: (content: string) => state.handleOpenSidebar(content),
                  onCloseSidebar: () => state.handleCloseSidebar(),
                  onSplitRatioChange: (ratio: number) => state.handleSplitRatioChange(ratio),
                  assistantName: state.assistantName,
                  assistantAvatar: state.assistantAvatar,
                })}
              `}
        </main>
      </div>

      ${renderExecApprovalPrompt(state)}
      ${renderGatewayUrlConfirmation(state)}
    </div>
  `;
}
