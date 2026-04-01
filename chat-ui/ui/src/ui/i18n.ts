/**
 * Minimal i18n module for OpenClaw Chat UI.
 * ~25 string keys, Chinese / English.
 * Language detection: navigator.language or ?lang= URL param.
 */

export type Locale = "zh" | "en";

const dict: Record<Locale, Record<string, string>> = {
  zh: {
    // Sidebar
    "sidebar.brand": "OpenClaw",
    "sidebar.chat": "当前对话",
    "sidebar.newChat": "新建对话",
    "sidebar.settings": "设置",
    "sidebar.openWebUI": "完整 Web UI",
    "sidebar.docs": "文档",
    "sidebar.history": "历史记录",
    "sidebar.historySubtitle": "查看已归档的历史会话",
    "sidebar.historyEmpty": "暂无历史记录",
    "sidebar.more": "更多",
    "sidebar.updateReady": "重新启动即可更新",
    "sidebar.updateDownloading": "正在下载更新 {percent}%",
    "sidebar.agent": "会话列表",
    "sidebar.skills": "Skills",
    "sidebar.skillsSearch": "搜索已安装 skills",
    "sidebar.skillsRefresh": "刷新 skills",
    "sidebar.skillsLoading": "正在加载已安装 skills…",
    "sidebar.skillsEmpty": "未找到已安装 skills",
    "sidebar.skillsError": "读取 skills 失败",
    "sidebar.skillsSourceBundled": "内置",
    "sidebar.skillsSourceWorkspace": "工作区用户目录",
    "sidebar.skillsSourceGlobal": "全局用户目录",
    "sidebar.skillsSourceUser": "用户",
    "skills.pageTitle": "Skills 管理",
    "skills.pageSubtitle": "搜索、查看并维护已安装的 skills",
    "skills.searchPlaceholder": "搜索 skills（名称 / 来源 / 路径）",
    "skills.refresh": "刷新列表",
    "skills.loading": "正在加载已安装 skills…",
    "skills.empty": "没有找到匹配的 skills",
    "skills.loadError": "读取 skills 失败",
    "skills.openFolder": "打开目录",
    "skills.openRepo": "打开仓库",
    "skills.detailsTitle": "技能详情",
    "skills.clickHint": "点击上方表格中的任意技能查看详情",
    "skills.tabBuiltIn": "内置",
    "skills.tabInstalled": "已安装",
    "skills.tabSearchInstall": "搜索并安装",
    "skills.searchGithub": "搜索 GitHub",
    "skills.searchingGithub": "搜索中…",
    "skills.searchGithubPlaceholder": "输入关键词（例如: feishu / postgres / ui）",
    "skills.searchGithubHint": "将从 GitHub 搜索包含 SKILL.md 的仓库路径，安装到 .openclaw/workspace/skills",
    "skills.searchGithubNeedQuery": "请输入至少 2 个字符后再搜索",
    "skills.searchGithubEmpty": "还没有搜索结果，请输入关键词并点击“搜索 GitHub”",
    "skills.searchGithubError": "GitHub 搜索失败",
    "skills.installToWorkspace": "安装到用户目录",
    "skills.installingGithub": "安装中…",
    "skills.installGithubSuccess": "已安装到用户目录：{name}",
    "skills.installGithubError": "安装失败",
    "sidebar.preferences": "偏好设置",
    "sidebar.appearance": "外观显示",
    "sidebar.theme": "主题",
    "sidebar.showThinking": "显示思考过程",
    "sidebar.on": "开启",
    "sidebar.off": "关闭",
    "sidebar.refresh": "刷新",
    "sidebar.collapse": "折叠菜单",
    "sidebar.expand": "展开菜单",
    "sidebar.connected": "已连接",
    "sidebar.disconnected": "未连接",
    "sidebar.connecting": "连接中…",
    "feishu.pendingTitle": "检测到飞书待审批请求",
    "feishu.pendingDesc": "待审批人：{name}",
    "feishu.approveNow": "立即批准",
    "feishu.approving": "批准中…",
    "feishu.rejectNow": "拒绝",
    "feishu.rejecting": "拒绝中…",
    "feishu.openSettings": "打开设置",
    "feishu.dismiss": "关闭通知",
    "feishu.pendingUnknown": "未知用户",
    "feishu.approveFailed": "飞书配对批准失败",
    "feishu.rejectFailed": "飞书配对拒绝失败",

    // OpenClaw settings page
    "settings.title": "设置",
    "settings.subtitle": "管理外观显示与聊天展示偏好",
    "settings.backToChat": "返回对话",

    // Chat
    "chat.placeholder": "输入消息（↩ 发送，Shift+↩ 换行，粘贴图片）",
    "chat.placeholder.image": "添加消息或粘贴更多图片…",
    "chat.placeholder.disconnected": "连接 Gateway 后即可聊天…",
    "chat.send": "发送",
    "chat.queue": "排队",
    "chat.stop": "停止",
    "chat.newSession": "新对话",
    "chat.confirmNewSession": "当前对话中未记忆的内容将被清除，是否继续新建对话？",
    "chat.loading": "加载中…",
    "chat.newMessages": "新消息",
    "chat.queued": "排队中",
    "chat.compacting": "正在压缩上下文…",
    "chat.compacted": "上下文已压缩",
    "chat.exitFocus": "退出专注模式",
    "chat.messageLabel": "消息",
    "chat.image": "图片",
    "chat.removeAttachment": "移除图片",
    "chat.removeQueuedMessage": "移除排队消息",
    "chat.attachmentPreview": "图片预览",

    // Share prompt
    "sharePrompt.title": "分享 OpenClaw 给朋友",
    "sharePrompt.subtitle": "复制下面这段文案分享给你的朋友或群聊，作者会非常感谢你哟😘",
    "sharePrompt.copy": "复制文案",
    "sharePrompt.copied": "已复制",
    "sharePrompt.close": "关闭",
    "sharePrompt.copyFailed": "复制失败，请手动选择文案复制",

    // Senders
    "sender.you": "你",
    "sender.assistant": "助手",
    "sender.system": "系统",

    // Status
    "status.health": "健康状态",
    "status.ok": "正常",
    "status.offline": "离线",

    // Theme
    "theme.system": "跟随系统",
    "theme.light": "浅色",
    "theme.dark": "深色",

    // Errors
    "error.disconnected": "已断开与 Gateway 的连接。",
  },
  en: {
    // Sidebar
    "sidebar.brand": "OpenClaw",
    "sidebar.chat": "Current Chat",
    "sidebar.newChat": "New Chat",
    "sidebar.settings": "Settings",
    "sidebar.openWebUI": "Full Web UI",
    "sidebar.docs": "Docs",
    "sidebar.history": "History",
    "sidebar.historySubtitle": "Browse archived conversations",
    "sidebar.historyEmpty": "No archived conversations yet",
    "sidebar.more": "More",
    "sidebar.updateReady": "Restart to update",
    "sidebar.updateDownloading": "Downloading update {percent}%",
    "sidebar.agent": "Sessions",
    "sidebar.skills": "Skills",
    "sidebar.skillsSearch": "Search installed skills",
    "sidebar.skillsRefresh": "Refresh skills",
    "sidebar.skillsLoading": "Loading installed skills…",
    "sidebar.skillsEmpty": "No installed skills found",
    "sidebar.skillsError": "Failed to load skills",
    "sidebar.skillsSourceBundled": "Bundled",
    "sidebar.skillsSourceWorkspace": "Workspace User Dir",
    "sidebar.skillsSourceGlobal": "Global User Dir",
    "sidebar.skillsSourceUser": "User",
    "skills.pageTitle": "Skills Manager",
    "skills.pageSubtitle": "Search, browse, and maintain installed skills",
    "skills.searchPlaceholder": "Search skills (name / source / path)",
    "skills.refresh": "Refresh list",
    "skills.loading": "Loading installed skills…",
    "skills.empty": "No matching skills found",
    "skills.loadError": "Failed to load skills",
    "skills.openFolder": "Open Folder",
    "skills.openRepo": "Open Repo",
    "skills.detailsTitle": "Skill Details",
    "skills.clickHint": "Click any skill in the table above to view details",
    "skills.tabBuiltIn": "Built-in",
    "skills.tabInstalled": "Installed",
    "skills.tabSearchInstall": "Search & Install",
    "skills.searchGithub": "Search GitHub",
    "skills.searchingGithub": "Searching…",
    "skills.searchGithubPlaceholder": "Enter keywords (e.g. feishu / postgres / ui)",
    "skills.searchGithubHint":
      "Searches GitHub paths containing SKILL.md, then installs to .openclaw/workspace/skills",
    "skills.searchGithubNeedQuery": "Please enter at least 2 characters",
    "skills.searchGithubEmpty": "No search results yet. Enter a keyword and search GitHub.",
    "skills.searchGithubError": "GitHub search failed",
    "skills.installToWorkspace": "Install to user directory",
    "skills.installingGithub": "Installing…",
    "skills.installGithubSuccess": "Installed to user directory: {name}",
    "skills.installGithubError": "Install failed",
    "sidebar.preferences": "Preferences",
    "sidebar.appearance": "Appearance",
    "sidebar.theme": "Theme",
    "sidebar.showThinking": "Show thinking output",
    "sidebar.on": "On",
    "sidebar.off": "Off",
    "sidebar.refresh": "Refresh",
    "sidebar.collapse": "Collapse sidebar",
    "sidebar.expand": "Expand sidebar",
    "sidebar.connected": "Connected",
    "sidebar.disconnected": "Disconnected",
    "sidebar.connecting": "Connecting…",
    "feishu.pendingTitle": "Feishu pairing request detected",
    "feishu.pendingDesc": "Pending user: {name}",
    "feishu.approveNow": "Approve now",
    "feishu.approving": "Approving…",
    "feishu.rejectNow": "Reject",
    "feishu.rejecting": "Rejecting…",
    "feishu.openSettings": "Open settings",
    "feishu.dismiss": "Dismiss notice",
    "feishu.pendingUnknown": "Unknown user",
    "feishu.approveFailed": "Failed to approve Feishu pairing",
    "feishu.rejectFailed": "Failed to reject Feishu pairing",

    // OpenClaw settings page
    "settings.title": "Settings",
    "settings.subtitle": "Manage appearance and chat display preferences",
    "settings.backToChat": "Back to chat",

    // Chat
    "chat.placeholder": "Message (↩ to send, Shift+↩ for line breaks, paste images)",
    "chat.placeholder.image": "Add a message or paste more images...",
    "chat.placeholder.disconnected": "Connect to the gateway to start chatting…",
    "chat.send": "Send",
    "chat.queue": "Queue",
    "chat.stop": "Stop",
    "chat.newSession": "New session",
    "chat.confirmNewSession":
      "Unmemorized content in the current conversation will be cleared. Continue?",
    "chat.loading": "Loading chat…",
    "chat.newMessages": "New messages",
    "chat.queued": "Queued",
    "chat.compacting": "Compacting context...",
    "chat.compacted": "Context compacted",
    "chat.exitFocus": "Exit focus mode",
    "chat.messageLabel": "Message",
    "chat.image": "Image",
    "chat.removeAttachment": "Remove attachment",
    "chat.removeQueuedMessage": "Remove queued message",
    "chat.attachmentPreview": "Attachment preview",

    // Share prompt
    "sharePrompt.title": "Share OpenClaw with friends",
    "sharePrompt.subtitle":
      "Copy this text and share it with your friends or group chats. The creator will really appreciate it 😘",
    "sharePrompt.copy": "Copy text",
    "sharePrompt.copied": "Copied",
    "sharePrompt.close": "Close",
    "sharePrompt.copyFailed": "Copy failed. Please select and copy manually",

    // Senders
    "sender.you": "You",
    "sender.assistant": "Assistant",
    "sender.system": "System",

    // Status
    "status.health": "Health",
    "status.ok": "OK",
    "status.offline": "Offline",

    // Theme
    "theme.system": "System",
    "theme.light": "Light",
    "theme.dark": "Dark",

    // Errors
    "error.disconnected": "Disconnected from gateway.",
  },
};

let currentLocale: Locale = detectLocale();

function detectLocale(): Locale {
  // URL param takes priority
  if (typeof window !== "undefined" && window.location?.search) {
    const params = new URLSearchParams(window.location.search);
    const lang = params.get("lang");
    if (lang?.startsWith("zh")) return "zh";
    if (lang?.startsWith("en")) return "en";
  }
  // Browser language
  if (typeof navigator !== "undefined") {
    const lang = navigator.language || "";
    if (lang.startsWith("zh")) return "zh";
  }
  return "en";
}

/**
 * Translate a key to the current locale.
 * Falls back to English, then to the key itself.
 */
export function t(key: string): string {
  return dict[currentLocale]?.[key] ?? dict.en[key] ?? key;
}

/** Get the current locale. */
export function getLocale(): Locale {
  return currentLocale;
}

/** Set the locale explicitly. */
export function setLocale(locale: Locale): void {
  currentLocale = locale;
}
