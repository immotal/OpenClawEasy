import { app, dialog, ipcMain, shell, Menu, BrowserWindow } from "electron";
import * as fs from "fs";
import * as path from "path";
import { GatewayProcess } from "./gateway-process";
import { WindowManager } from "./window";
import { TrayManager } from "./tray";
import { SetupManager } from "./setup-manager";
import { registerSetupIpc } from "./setup-ipc";
import { registerSettingsIpc } from "./settings-ipc";
import { FeishuPairingMonitor } from "./feishu-pairing-monitor";
import {
  setupAutoUpdater,
  checkForUpdates,
  downloadAndInstallUpdate,
  getUpdateBannerState,
  startAutoCheckSchedule,
  stopAutoCheckSchedule,
  setBeforeQuitForInstallCallback,
  setProgressCallback,
  setUpdateBannerStateCallback,
} from "./auto-updater";
import {
  isSetupComplete,
  DEFAULT_PORT,
  resolveGatewayCwd,
  resolveGatewayLogPath,
  resolveUserStateDir,
} from "./constants";
import { resolveGatewayAuthToken } from "./gateway-auth";
import {
  getConfigRecoveryData,
  inspectUserConfigHealth,
  recordLastKnownGoodConfigSnapshot,
  recordSetupBaselineConfigSnapshot,
  restoreLastKnownGoodConfigSnapshot,
} from "./config-backup";
import { readUserConfig, writeUserConfig } from "./provider-config";
import { resolveKimiSearchApiKey } from "./kimi-config";
import * as log from "./logger";
import * as analytics from "./analytics";

function formatConsoleLevel(level: number): string {
  const map = ["LOG", "WARNING", "ERROR", "DEBUG", "INFO", "??"];
  return map[level] ?? `LEVEL_${level}`;
}

// 过滤渲染层高频请求日志，避免 node.list 等轮询刷屏污染主日志。
function isNoisyRendererConsoleMessage(message: string): boolean {
  return message.startsWith("[gateway] request sent ");
}

function attachRendererDebugHandlers(label: string, webContents: Electron.WebContents): void {
  webContents.on("console-message", (_event, level, message, lineNumber, sourceId) => {
    if (isNoisyRendererConsoleMessage(message)) {
      return;
    }
    const tag = `[renderer:${label}] console.${formatConsoleLevel(level)}`;
    if (level >= 2) {
      log.error(`${tag}: ${message} (${sourceId}:${lineNumber})`);
      return;
    }
    log.info(`${tag}: ${message} (${sourceId}:${lineNumber})`);
  });

  webContents.on("preload-error", (_event, path, error) => {
    log.error(`[renderer:${label}] preload-error: ${path} -> ${error.message || String(error)}`);
  });

  webContents.on("did-fail-load", (_event, code, description, validatedURL, isMainFrame) => {
    if (!isMainFrame) {
      return;
    }
    log.error(
      `[renderer:${label}] did-fail-load: code=${code}, description=${description}, url=${validatedURL}`,
    );
  });

  webContents.on("did-finish-load", () => {
    log.info(`[renderer:${label}] did-finish-load`);
  });

  webContents.on("dom-ready", () => {
    log.info(`[renderer:${label}] dom-ready`);
  });

  webContents.on("render-process-gone", (_event, details) => {
    log.error(
      `[renderer:${label}] render-process-gone: reason=${details.reason}, exitCode=${details.exitCode}`,
    );
  });
}

// ── 单实例锁 ──

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

// ── 全局错误兜底 ──

process.on("uncaughtException", (err) => {
  log.error(`uncaughtException: ${err.stack || err.message}`);
});
process.on("unhandledRejection", (reason) => {
  log.error(`unhandledRejection: ${reason}`);
});

// ── 核心组件 ──

let feishuPairingMonitor: FeishuPairingMonitor | null = null;
const gateway = new GatewayProcess({
  port: DEFAULT_PORT,
  token: resolveGatewayAuthToken({ persist: false }),
  onStateChange: () => {
    tray.updateMenu();
    feishuPairingMonitor?.triggerNow();
  },
});
const windowManager = new WindowManager();
const tray = new TrayManager();
const setupManager = new SetupManager();

// 应用前台判定：任一窗口拿到系统焦点即视为前台；否则视为后台。
function isAppInForeground(): boolean {
  return BrowserWindow.getAllWindows().some(
    (w) => !w.isDestroyed() && w.isFocused(),
  );
}

feishuPairingMonitor = new FeishuPairingMonitor({
  gateway,
  isAppInForeground,
  onStateChange: (state) => {
    windowManager.pushFeishuPairingState(state);
  },
});

// ── 显示主窗口的统一入口 ──

function showMainWindow(): Promise<void> {
  return windowManager.show({
    port: gateway.getPort(),
    token: gateway.getToken(),
  });
}

function openSettingsInMainWindow(): Promise<void> {
  if (setupManager.isSetupOpen()) {
    setupManager.focusSetup();
    return Promise.resolve();
  }
  return windowManager.openSettings({
    port: gateway.getPort(),
    token: gateway.getToken(),
  });
}

function openRecoverySettings(notice: string): void {
  openSettingsInMainWindow().catch((err) => {
    log.error(`恢复流程打开设置失败(${notice}): ${err}`);
  });
}

// ── Gateway 启动失败提示（避免静默失败） ──

type RecoveryAction = "open-settings" | "restore-last-known-good" | "dismiss";

// 统一弹出配置恢复提示，避免用户在配置损坏时无从下手。
function promptConfigRecovery(opts: {
  title: string;
  message: string;
  detail: string;
}): RecoveryAction {
  const locale = app.getLocale();
  const isZh = locale.startsWith("zh");
  const { hasLastKnownGood } = getConfigRecoveryData();

  const buttons = hasLastKnownGood
    ? [
        isZh ? "一键回退上次可用配置" : "Restore last known good",
        isZh ? "打开设置恢复" : "Open Settings",
        isZh ? "稍后处理" : "Later",
      ]
    : [isZh ? "打开设置恢复" : "Open Settings", isZh ? "稍后处理" : "Later"];

  const index = dialog.showMessageBoxSync({
    type: "error",
    title: opts.title,
    message: opts.message,
    detail: opts.detail,
    buttons,
    defaultId: 0,
    cancelId: buttons.length - 1,
    noLink: true,
  });

  if (hasLastKnownGood) {
    if (index === 0) return "restore-last-known-good";
    if (index === 1) return "open-settings";
    return "dismiss";
  }
  if (index === 0) return "open-settings";
  return "dismiss";
}

// Gateway 启动失败时提示用户进入备份恢复，避免反复重启无效。
function reportGatewayStartFailure(source: string): RecoveryAction {
  const logPath = resolveGatewayLogPath();
  const title = "OpenClaw Gateway 启动失败";
  const detail =
    `来源: ${source}\n` +
    `建议先前往设置 → 备份与恢复，回退到最近可用配置。\n` +
    `诊断日志:\n${logPath}`;
  log.error(`${title} (${source})`);
  log.error(`诊断日志: ${logPath}`);
  return promptConfigRecovery({
    title,
    message: "Gateway 未能成功启动，可能是配置错误导致。",
    detail,
  });
}

// 配置 JSON 结构损坏时，直接给出恢复入口，避免误导用户重新 Setup。
function reportConfigInvalidFailure(parseError?: string): RecoveryAction {
  const recovery = getConfigRecoveryData();
  const detail =
    `配置文件: ${recovery.configPath}\n` +
    `解析错误: ${parseError ?? "unknown"}\n` +
    `建议前往设置 → 备份与恢复，回退到可用版本。`;

  log.error(`配置文件损坏，JSON 解析失败: ${parseError ?? "unknown"}`);
  return promptConfigRecovery({
    title: "OpenClaw 配置文件损坏",
    message: "检测到 openclaw.json 不是有效 JSON，Gateway 无法启动。",
    detail,
  });
}

// ── 统一启动链路：启动 Gateway → 打开主窗口 ──

interface StartMainOptions {
  openOnFailure?: boolean;
  reportFailure?: boolean;
}

const MAX_GATEWAY_START_ATTEMPTS = 3;

// 存量用户迁移：首次升级时默认开启 session-memory hook（幂等，只在 hooks.internal 未配置时写入）
function migrateSessionMemoryHook(): void {
  try {
    const config = readUserConfig();
    if (config.hooks?.internal) return;
    config.hooks ??= {};
    config.hooks.internal = {
      enabled: true,
      entries: { "session-memory": { enabled: true } },
    };
    writeUserConfig(config);
    log.info("[migrate] 已为存量用户默认开启 session-memory hook");
  } catch {
    // 迁移失败不阻塞启动
  }
}

// 从配置同步 search API key 到 gateway 环境变量
function syncKimiSearchEnv(): void {
  try {
    const config = readUserConfig();
    const key = resolveKimiSearchApiKey(config);
    if (key) {
      gateway.setExtraEnv({ KIMI_PLUGIN_API_KEY: key });
    }
  } catch {
    // 配置读取失败不阻塞启动
  }
}

// 启动 Gateway（最多尝试 3 次，覆盖 Windows 冷启动慢导致的前两次超时）
async function ensureGatewayRunning(source: string): Promise<boolean> {
  // 启动前从配置同步 token，避免 Setup 后仍使用旧内存 token。
  gateway.setToken(resolveGatewayAuthToken());
  syncKimiSearchEnv();

  for (let attempt = 1; attempt <= MAX_GATEWAY_START_ATTEMPTS; attempt++) {
    if (attempt === 1) {
      await gateway.start();
    } else {
      log.warn(`Gateway 启动重试 ${attempt}/${MAX_GATEWAY_START_ATTEMPTS}: ${source}`);
      await gateway.restart();
    }

    if (gateway.getState() === "running") {
      // 仅在真正启动成功后刷新“最近可用快照”，保证一键回退目标可启动。
      recordLastKnownGoodConfigSnapshot();
      log.info(`Gateway 启动成功（第 ${attempt} 次尝试）: ${source}`);
      return true;
    }
  }

  return false;
}

async function startGatewayAndShowMain(source: string, opts: StartMainOptions = {}): Promise<boolean> {
  const openOnFailure = opts.openOnFailure ?? true;
  const reportFailure = opts.reportFailure ?? true;

  log.info(`启动链路开始: ${source}`);
  const running = await ensureGatewayRunning(source);
  if (!running) {
    if (reportFailure) {
      const action = reportGatewayStartFailure(source);
      if (action === "open-settings") {
        openRecoverySettings("gateway-start-failed");
      } else if (action === "restore-last-known-good") {
        try {
          restoreLastKnownGoodConfigSnapshot();
          const recovered = await ensureGatewayRunning("recovery:last-known-good");
          if (recovered) {
            await showMainWindow();
            return true;
          }
          openRecoverySettings("gateway-recovery-failed");
        } catch (err: any) {
          log.error(`回退 last-known-good 失败: ${err?.message ?? err}`);
          openRecoverySettings("gateway-recovery-exception");
        }
      }
    } else {
      log.error(`Gateway 启动失败（静默模式）: ${source}`);
    }
    if (!openOnFailure) return false;
  }
  await showMainWindow();
  return running;
}

// 手动控制 Gateway：统一入口，确保启动前同步最新 token。
function requestGatewayStart(source: string): void {
  gateway.setToken(resolveGatewayAuthToken());
  syncKimiSearchEnv();
  gateway.start().catch((err) => {
    log.error(`Gateway 启动失败(${source}): ${err}`);
  });
}

function requestGatewayRestart(source: string): void {
  gateway.setToken(resolveGatewayAuthToken());
  syncKimiSearchEnv();
  gateway.restart().catch((err) => {
    log.error(`Gateway 重启失败(${source}): ${err}`);
  });
}

function requestGatewayStop(source: string): void {
  try {
    gateway.stop();
  } catch (err) {
    log.error(`Gateway 停止失败(${source}): ${err}`);
  }
}

type InstalledSkillInfo = {
  name: string;
  source: "bundled" | "workspace" | "global";
  path: string;
};

type GithubSkillSearchItem = {
  id: string;
  name: string;
  repoFullName: string;
  repoUrl: string;
  skillPath: string;
  htmlUrl: string;
  description: string;
};

type ExportConversationItem = {
  sessionKey: string;
  label?: string | null;
  messages: unknown[];
};

type ExportFormat = "markdown" | "html" | "pdf" | "png";

function collectSkillsFromBase(
  baseDir: string,
  source: "bundled" | "workspace" | "global",
): InstalledSkillInfo[] {
  if (!fs.existsSync(baseDir)) {
    return [];
  }

  const entries = fs.readdirSync(baseDir, { withFileTypes: true });
  const skills: InstalledSkillInfo[] = [];

  const pushIfSkillDir = (skillDir: string, skillName: string) => {
    const skillFile = path.join(skillDir, "SKILL.md");
    if (!fs.existsSync(skillFile)) {
      return;
    }
    skills.push({
      name: skillName,
      source,
      path: skillDir,
    });
  };

  const isDirectoryLike = (parentDir: string, entry: fs.Dirent): boolean => {
    if (entry.isDirectory()) {
      return true;
    }
    if (!entry.isSymbolicLink()) {
      return false;
    }
    try {
      const resolved = path.join(parentDir, entry.name);
      return fs.statSync(resolved).isDirectory();
    } catch {
      return false;
    }
  };

  const readDirEntries = (dir: string): fs.Dirent[] => {
    try {
      return fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return [];
    }
  };

  for (const entry of entries) {
    if (!isDirectoryLike(baseDir, entry)) continue;
    const firstLevel = path.join(baseDir, entry.name);
    pushIfSkillDir(firstLevel, entry.name);

    // Support nested namespaces like skills/vendor/skill-name
    const secondLevelEntries = fs.existsSync(firstLevel)
      ? readDirEntries(firstLevel)
      : [];
    for (const child of secondLevelEntries) {
      if (!isDirectoryLike(firstLevel, child)) continue;
      const secondLevel = path.join(firstLevel, child.name);
      pushIfSkillDir(secondLevel, `${entry.name}/${child.name}`);
    }
  }

  return skills;
}

function resolveUserWorkspaceSkillsDir(): string {
  return path.join(resolveUserStateDir(), "workspace", "skills");
}

function resolveUserGlobalSkillsDir(): string {
  return path.join(resolveUserStateDir(), "skills");
}

function listInstalledSkills(): InstalledSkillInfo[] {
  const bundledSkillsDir = path.join(resolveGatewayCwd(), "skills");
  const workspaceSkillsDir = resolveUserWorkspaceSkillsDir();
  const globalSkillsDir = resolveUserGlobalSkillsDir();
  const merged: InstalledSkillInfo[] = [
    ...collectSkillsFromBase(bundledSkillsDir, "bundled"),
    ...collectSkillsFromBase(workspaceSkillsDir, "workspace"),
    ...collectSkillsFromBase(globalSkillsDir, "global"),
  ];
  const unique = new Map<string, InstalledSkillInfo>();
  for (const item of merged) {
    unique.set(`${item.source}:${item.name}:${item.path}`, item);
  }
  return Array.from(unique.values()).sort((a, b) => {
    const sourceDiff = a.source.localeCompare(b.source);
    if (sourceDiff !== 0) {
      return sourceDiff;
    }
    return a.name.localeCompare(b.name);
  });
}

function sanitizeSkillDirName(input: string): string {
  const normalized = String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || "skill";
}

function sanitizeFileName(input: string): string {
  const normalized = String(input || "")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/-+/g, "-")
    .replace(/^[-.\s]+|[-.\s]+$/g, "");
  return normalized || "conversation";
}

function resolveExportExtension(format: ExportFormat): string {
  if (format === "markdown") return "md";
  if (format === "html") return "html";
  if (format === "pdf") return "pdf";
  return "png";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function extractTextBlocks(message: unknown): string {
  const m = message as Record<string, unknown>;
  const content = m.content;
  if (typeof content === "string") {
    return content.trim();
  }
  if (Array.isArray(content)) {
    const chunks: string[] = [];
    for (const item of content) {
      if (!item || typeof item !== "object") continue;
      const block = item as Record<string, unknown>;
      const text = typeof block.text === "string" ? block.text : "";
      if (text.trim()) chunks.push(text.trim());
    }
    return chunks.join("\n\n").trim();
  }
  if (typeof m.text === "string") {
    return m.text.trim();
  }
  return "";
}

function renderConversationMarkdown(item: ExportConversationItem): string {
  const lines: string[] = [];
  lines.push(`# ${item.label?.trim() || item.sessionKey}`);
  lines.push("");
  lines.push(`- Session: \`${item.sessionKey}\``);
  lines.push(`- Exported at: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("---");
  lines.push("");
  for (const raw of item.messages) {
    const m = raw as Record<string, unknown>;
    const role = typeof m.role === "string" ? m.role : "unknown";
    const ts = typeof m.timestamp === "number" ? new Date(m.timestamp).toISOString() : "";
    const text = extractTextBlocks(raw);
    lines.push(`## ${role}${ts ? ` · ${ts}` : ""}`);
    lines.push("");
    lines.push(text || "_(no text content)_");
    lines.push("");
  }
  return lines.join("\n");
}

function renderConversationHtml(item: ExportConversationItem): string {
  const title = item.label?.trim() || item.sessionKey;
  const messageHtml = item.messages.map((raw) => {
    const m = raw as Record<string, unknown>;
    const role = typeof m.role === "string" ? m.role : "unknown";
    const ts = typeof m.timestamp === "number" ? new Date(m.timestamp).toLocaleString() : "";
    const text = extractTextBlocks(raw);
    return `
      <section class="export-message export-role-${escapeHtml(role)}">
        <header class="export-message__meta">
          <span class="export-message__role">${escapeHtml(role)}</span>
          ${ts ? `<span class="export-message__time">${escapeHtml(ts)}</span>` : ""}
        </header>
        <pre class="export-message__text">${escapeHtml(text || "")}</pre>
      </section>
    `;
  }).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    @import url("https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap");
    :root { color-scheme: dark; }
    body { margin: 0; padding: 24px; background: #12141a; color: #e4e4e7; font-family: "Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .export-wrap { max-width: 940px; margin: 0 auto; }
    .export-title { font-size: 24px; margin: 0 0 8px; color: #fafafa; }
    .export-sub { font-size: 13px; color: #9ca3af; margin: 0 0 20px; }
    .export-message { border: 1px solid #27272a; background: #181b22; border-radius: 10px; padding: 12px 14px; margin-bottom: 10px; }
    .export-message__meta { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 8px; }
    .export-message__role { font-size: 12px; font-weight: 700; color: #c0392b; text-transform: none; }
    .export-message__time { font-size: 12px; color: #71717a; }
    .export-message__text { white-space: pre-wrap; word-break: break-word; margin: 0; font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; line-height: 1.5; color: #e4e4e7; }
  </style>
</head>
<body>
  <main class="export-wrap">
    <h1 class="export-title">${escapeHtml(title)}</h1>
    <p class="export-sub">Session: ${escapeHtml(item.sessionKey)} · Exported at ${escapeHtml(new Date().toLocaleString())}</p>
    ${messageHtml}
  </main>
</body>
</html>`;
}

async function writeConversationExportFile(
  outputDir: string,
  format: ExportFormat,
  item: ExportConversationItem,
): Promise<string> {
  const baseName = sanitizeFileName(item.label?.trim() || item.sessionKey);
  const ext = resolveExportExtension(format);
  const outputPath = path.join(outputDir, `${baseName}.${ext}`);
  if (format === "markdown") {
    fs.writeFileSync(outputPath, renderConversationMarkdown(item), "utf-8");
    return outputPath;
  }
  const htmlDoc = renderConversationHtml(item);
  if (format === "html") {
    fs.writeFileSync(outputPath, htmlDoc, "utf-8");
    return outputPath;
  }

  const exportWindow = new BrowserWindow({
    width: 1200,
    height: 900,
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
    },
  });
  try {
    const encoded = Buffer.from(htmlDoc, "utf-8").toString("base64");
    await exportWindow.loadURL(`data:text/html;base64,${encoded}`);
    await exportWindow.webContents.executeJavaScript(
      `new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`,
      true,
    );
    if (format === "pdf") {
      const pdf = await exportWindow.webContents.printToPDF({
        printBackground: true,
        pageSize: "A4",
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
      });
      fs.writeFileSync(outputPath, pdf);
      return outputPath;
    }
    const height = await exportWindow.webContents.executeJavaScript(
      "Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, 900)",
      true,
    ) as number;
    exportWindow.setSize(1200, Math.min(16000, Math.max(900, Math.ceil(Number(height) || 900))));
    await exportWindow.webContents.executeJavaScript(
      `new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`,
      true,
    );
    const image = await exportWindow.webContents.capturePage();
    fs.writeFileSync(outputPath, image.toPNG());
    return outputPath;
  } finally {
    exportWindow.destroy();
  }
}

function resolveUniqueInstallPath(baseDir: string, baseName: string): string {
  const initial = path.join(baseDir, baseName);
  if (!fs.existsSync(initial)) {
    return initial;
  }
  for (let i = 2; i <= 9999; i += 1) {
    const candidate = path.join(baseDir, `${baseName}-${i}`);
    if (!fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error("Failed to allocate a unique install directory for this skill");
}

function normalizeRepoSkillPath(input: string): string {
  const value = String(input || "").trim().replace(/\\/g, "/");
  if (!value) {
    return ".";
  }
  const normalized = path.posix.normalize(value);
  if (normalized === ".." || normalized.startsWith("../")) {
    throw new Error("Invalid skill path");
  }
  return normalized || ".";
}

async function searchGithubSkills(query: string): Promise<GithubSkillSearchItem[]> {
  const searchText = String(query || "").trim();
  if (searchText.length < 2) {
    return [];
  }
  const q = `${searchText} filename:SKILL.md path:skills`;
  const url = `https://api.github.com/search/code?q=${encodeURIComponent(q)}&per_page=20`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "OpenClawEasy/skill-search",
    },
  });
  if (!response.ok) {
    const message = `GitHub search failed: ${response.status} ${response.statusText}`;
    throw new Error(message);
  }
  const payload = await response.json() as {
    items?: Array<{
      sha?: string;
      path?: string;
      html_url?: string;
      repository?: {
        full_name?: string;
        html_url?: string;
        description?: string;
      };
    }>;
  };
  const items = Array.isArray(payload.items) ? payload.items : [];
  const deduped = new Map<string, GithubSkillSearchItem>();
  for (const item of items) {
    const repoFullName = String(item.repository?.full_name || "").trim();
    const repoUrl = String(item.repository?.html_url || "").trim();
    const filePath = String(item.path || "").trim();
    if (!repoFullName || !repoUrl || !filePath) {
      continue;
    }
    const skillPath = path.posix.dirname(filePath);
    const lastSegment = skillPath === "." ? repoFullName.split("/").pop() ?? "skill" : path.posix.basename(skillPath);
    const key = `${repoFullName}:${skillPath}`;
    if (deduped.has(key)) {
      continue;
    }
    deduped.set(key, {
      id: key,
      name: lastSegment,
      repoFullName,
      repoUrl,
      skillPath,
      htmlUrl: String(item.html_url || repoUrl),
      description: String(item.repository?.description || "").trim(),
    });
  }
  return Array.from(deduped.values()).sort((a, b) => a.name.localeCompare(b.name));
}

async function installGithubSkill(params: {
  repoFullName: string;
  skillPath: string;
  name?: string;
}): Promise<{ name: string; path: string }> {
  const repoFullName = String(params.repoFullName || "").trim();
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repoFullName)) {
    throw new Error("Invalid GitHub repository name");
  }
  const normalizedSkillPath = normalizeRepoSkillPath(params.skillPath);
  const tempRoot = fs.mkdtempSync(path.join(app.getPath("temp"), "openclaw-skill-"));
  const repoDir = path.join(tempRoot, "repo");
  const repoUrl = `https://github.com/${repoFullName}.git`;
  try {
    const cp = await import("child_process");
    cp.execFileSync("git", ["clone", "--depth", "1", repoUrl, repoDir], {
      stdio: "ignore",
      windowsHide: true,
      timeout: 120000,
    });
    const sourceDir = normalizedSkillPath === "."
      ? repoDir
      : path.join(repoDir, ...normalizedSkillPath.split("/"));
    const skillFilePath = path.join(sourceDir, "SKILL.md");
    if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory() || !fs.existsSync(skillFilePath)) {
      throw new Error("The selected GitHub path does not contain a valid SKILL.md");
    }
    const installBaseDir = resolveUserWorkspaceSkillsDir();
    fs.mkdirSync(installBaseDir, { recursive: true });
    const fallbackName = normalizedSkillPath === "."
      ? repoFullName.split("/")[1]
      : path.posix.basename(normalizedSkillPath);
    const requestedName = String(params.name || "").trim() || fallbackName;
    const targetBaseName = sanitizeSkillDirName(requestedName);
    const targetDir = resolveUniqueInstallPath(installBaseDir, targetBaseName);
    fs.cpSync(sourceDir, targetDir, {
      recursive: true,
      force: false,
      errorOnExist: true,
    });
    return {
      name: path.basename(targetDir),
      path: targetDir,
    };
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

// ── IPC 注册 ──

ipcMain.on("gateway:restart", () => requestGatewayRestart("ipc:restart"));
ipcMain.on("gateway:start", () => requestGatewayStart("ipc:start"));
ipcMain.on("gateway:stop", () => requestGatewayStop("ipc:stop"));
ipcMain.handle("gateway:state", () => gateway.getState());
ipcMain.on("app:check-updates", () => checkForUpdates(true));
ipcMain.handle("app:get-update-state", () => getUpdateBannerState());
ipcMain.handle("app:download-and-install-update", () => downloadAndInstallUpdate());
ipcMain.handle("app:get-feishu-pairing-state", () => feishuPairingMonitor?.getState());
ipcMain.on("app:refresh-feishu-pairing-state", () => feishuPairingMonitor?.triggerNow());
ipcMain.handle("app:open-external", (_e, url: string) => shell.openExternal(url));
ipcMain.handle("app:list-installed-skills", () => {
  try {
    return {
      success: true,
      data: listInstalledSkills(),
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || String(err),
    };
  }
});
ipcMain.handle("app:search-github-skills", async (_e, rawQuery: unknown) => {
  try {
    const query = String(rawQuery ?? "");
    return {
      success: true,
      data: await searchGithubSkills(query),
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || String(err),
    };
  }
});
ipcMain.handle("app:install-github-skill", async (_e, payload: unknown) => {
  try {
    const params = payload && typeof payload === "object"
      ? (payload as { repoFullName?: string; skillPath?: string; name?: string })
      : {};
    const result = await installGithubSkill({
      repoFullName: String(params.repoFullName || ""),
      skillPath: String(params.skillPath || "."),
      name: params.name,
    });
    return {
      success: true,
      data: result,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || String(err),
    };
  }
});
ipcMain.handle("app:choose-export-directory", async () => {
  const focusedWindow = BrowserWindow.getFocusedWindow();
  const selected = focusedWindow
    ? await dialog.showOpenDialog(focusedWindow, {
      title: "Choose export directory",
      properties: ["openDirectory", "createDirectory"],
    })
    : await dialog.showOpenDialog({
    title: "Choose export directory",
    properties: ["openDirectory", "createDirectory"],
  });
  if (selected.canceled || selected.filePaths.length === 0) {
    return { success: false, cancelled: true };
  }
  return { success: true, path: selected.filePaths[0] };
});
ipcMain.handle("app:export-conversations", async (_e, payload: unknown) => {
  try {
    const body = payload && typeof payload === "object"
      ? payload as {
        outputDir?: string;
        format?: string;
        items?: unknown[];
      }
      : {};
    const outputDir = String(body.outputDir || "").trim();
    const format = String(body.format || "").trim().toLowerCase() as ExportFormat;
    const itemsRaw = Array.isArray(body.items) ? body.items : [];
    if (!outputDir) {
      throw new Error("Missing output directory");
    }
    if (!["markdown", "html", "pdf", "png"].includes(format)) {
      throw new Error("Unsupported export format");
    }
    fs.mkdirSync(outputDir, { recursive: true });
    const items: ExportConversationItem[] = itemsRaw
      .map((item) => item as ExportConversationItem)
      .filter((item) => item && typeof item.sessionKey === "string" && Array.isArray(item.messages));
    if (items.length === 0) {
      throw new Error("No conversations selected for export");
    }
    const files: string[] = [];
    for (const item of items) {
      // Sequential export keeps memory usage predictable for pdf/png window rendering.
      files.push(await writeConversationExportFile(outputDir, format, item));
    }
    return { success: true, data: { files } };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || String(err),
    };
  }
});

// Chat UI 侧边栏 IPC
ipcMain.on("app:open-settings", () => {
  openSettingsInMainWindow().catch((err) => {
    log.error(`app:open-settings 打开主窗口设置失败: ${err}`);
  });
});
ipcMain.on("app:open-webui", () => {
  const port = gateway.getPort();
  const token = gateway.getToken().trim();
  const query = token ? `?token=${encodeURIComponent(token)}` : "";
  shell.openExternal(`http://127.0.0.1:${port}/${query}`);
});
ipcMain.handle("gateway:port", () => gateway.getPort());

registerSetupIpc({ setupManager });
registerSettingsIpc({
  requestGatewayRestart: () => requestGatewayRestart("settings:kimi-search"),
});

// ── 退出 ──

async function quit(): Promise<void> {
  stopAutoCheckSchedule();
  feishuPairingMonitor?.stop();
  analytics.track("app_closed");
  await analytics.shutdown();
  windowManager.destroy();
  gateway.stop();
  tray.destroy();
  app.quit();
}

// ── Setup 完成后：启动 Gateway → 打开主窗口 ──

setupManager.setOnComplete(async () => {
  const running = await ensureGatewayRunning("setup:complete");
  if (!running) {
    return false;
  }

  try {
    // 只有最后一步成功（Gateway 可用）后，才标记 Setup 完成。
    const config = readUserConfig();
    config.wizard ??= {};
    config.wizard.lastRunAt = new Date().toISOString();
    delete config.wizard.pendingAt;
    writeUserConfig(config);
  } catch (err: any) {
    log.error(`写入 setup 完成标记失败: ${err?.message ?? err}`);
    return false;
  }

  await showMainWindow();
  recordSetupBaselineConfigSnapshot();
  return true;
});

// ── macOS Dock 可见性：窗口全隐藏时切换纯托盘模式 ──

function updateDockVisibility(): void {
  if (process.platform !== "darwin" || !app.dock) return;
  const anyVisible = BrowserWindow.getAllWindows().some(
    (w) => !w.isDestroyed() && w.isVisible(),
  );
  if (anyVisible) {
    app.dock.show();
  } else {
    app.dock.hide();
  }
}

let hasAppFocus = false;

// 仅在“失焦 -> 聚焦”状态跃迁时上报一次，避免窗口切换导致重复埋点。
function syncAppFocusState(trigger: string): void {
  const focused = BrowserWindow.getAllWindows().some(
    (w) => !w.isDestroyed() && w.isFocused(),
  );
  if (focused === hasAppFocus) {
    return;
  }
  hasAppFocus = focused;
  if (focused) {
    analytics.track("app_focused", { trigger });
  }
}

// ── 应用就绪 ──

app.whenReady().then(async () => {
  log.info("app ready");

  // 所有窗口的 show/hide/closed 事件统一驱动 Dock 可见性
  app.on("browser-window-created", (_e, win) => {
    win.on("show", updateDockVisibility);
    win.on("hide", updateDockVisibility);
    win.on("closed", updateDockVisibility);
  });
  app.on("browser-window-focus", () => {
    syncAppFocusState("browser-window-focus");
  });
  app.on("browser-window-blur", () => {
    // blur 与 focus 可能连续触发，延迟到当前事件循环末尾再判定全局焦点。
    setTimeout(() => syncAppFocusState("browser-window-blur"), 0);
  });
  // macOS: 最小化应用菜单，保留 Cmd+, 打开设置
  // Windows: 隐藏菜单栏，避免标题栏下方出现菜单条
  if (process.platform === "darwin") {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      {
        label: app.name,
        submenu: [
          { role: "about" },
          { type: "separator" },
          {
            label: "Settings…",
            accelerator: "CommandOrControl+,",
            click: () => {
              openSettingsInMainWindow().catch((err) => {
                log.error(`Cmd+, 打开主窗口设置失败: ${err}`);
              });
            },
          },
          { type: "separator" },
          { role: "services" },
          { type: "separator" },
          { role: "hide" },
          { role: "hideOthers" },
          { role: "unhide" },
          { type: "separator" },
          { role: "quit" },
        ],
      },
      { role: "fileMenu" },
      { role: "editMenu" },
      { role: "windowMenu" },
    ]));
  } else {
    Menu.setApplicationMenu(null);
  }
  analytics.init();
  analytics.track("app_launched");
  setupAutoUpdater();
  // 自动更新状态变化后推送给当前主窗口，驱动侧栏“重启更新”按钮。
  setUpdateBannerStateCallback((state) => {
    windowManager.pushUpdateBannerState(state);
  });
  startAutoCheckSchedule();

  // 更新安装前先放行窗口关闭，避免托盘“隐藏而不退出”拦截 quitAndInstall。
  setBeforeQuitForInstallCallback(() => {
    stopAutoCheckSchedule();
    windowManager.prepareForAppQuit();
  });

  // 下载进度 → 更新托盘 tooltip
  setProgressCallback((pct) => {
    tray.setTooltip(pct != null ? `OpenClaw — 下载更新 ${pct.toFixed(0)}%` : "OpenClaw");
  });

  tray.create({
    windowManager,
    gateway,
    onRestartGateway: () => requestGatewayRestart("tray:restart"),
    onStartGateway: () => requestGatewayStart("tray:start"),
    onStopGateway: () => requestGatewayStop("tray:stop"),
    onOpenSettings: () => {
      openSettingsInMainWindow().catch((err) => {
        log.error(`托盘设置打开失败: ${err}`);
      });
    },
    onQuit: quit,
    onCheckUpdates: () => checkForUpdates(true),
  });
  feishuPairingMonitor?.start();

  const configHealth = inspectUserConfigHealth();
  if (configHealth.exists && !configHealth.validJson) {
    const action = reportConfigInvalidFailure(configHealth.parseError);
    if (action === "restore-last-known-good") {
      try {
        restoreLastKnownGoodConfigSnapshot();
        await startGatewayAndShowMain("startup:restore-last-known-good");
        return;
      } catch (err: any) {
        log.error(`启动前恢复 last-known-good 失败: ${err?.message ?? err}`);
        openRecoverySettings("gateway-recovery-failed");
        return;
      }
    }
    if (action === "open-settings") {
      openRecoverySettings("config-invalid-json");
      return;
    }
    return;
  }

  if (!isSetupComplete()) {
    // 无配置 → 先走 Setup，Gateway 在 Setup 完成回调里启动
    setupManager.showSetup();
  } else {
    // 存量用户迁移：首次升级时默认开启 session-memory hook
    migrateSessionMemoryHook();
    await startGatewayAndShowMain("app:startup");
  }
});

// ── 二次启动 → 聚焦已有窗口 ──

app.on("second-instance", () => {
  if (setupManager.isSetupOpen()) {
    setupManager.focusSetup();
  } else {
    showMainWindow().catch((err) => {
      log.error(`second-instance 打开主窗口失败: ${err}`);
    });
  }
});

app.on("web-contents-created", (_event, webContents) => {
  if (webContents.getType() !== "window") {
    return;
  }
  attachRendererDebugHandlers(`id=${webContents.id}`, webContents);
});

// ── macOS: 点击 Dock 图标时恢复窗口 ──

app.on("activate", () => {
  if (setupManager.isSetupOpen()) {
    setupManager.focusSetup();
  } else {
    showMainWindow().catch((err) => {
      log.error(`activate 打开主窗口失败: ${err}`);
    });
  }
});

// ── 托盘应用：所有窗口关闭不退出 ──

app.on("window-all-closed", () => {
  // 不退出 — 后台保持运行
});

// ── 退出前清理 ──

app.on("before-quit", () => {
  feishuPairingMonitor?.stop();
  windowManager.destroy();
  gateway.stop();
});
