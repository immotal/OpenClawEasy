const ARCHIVES_KEY = "openclaw.chat.archives.v1";
const MAX_ARCHIVES = 50;

export type ChatArchiveEntry = {
  id: string;
  sessionKey: string;
  label: string;
  archivedAt: number;
  messageCount: number;
  preview: string;
  messages: unknown[];
};

type SaveArchiveInput = {
  sessionKey: string;
  label?: string;
  messages: unknown[];
};

export function loadChatArchives(): ChatArchiveEntry[] {
  try {
    const raw = localStorage.getItem(ARCHIVES_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((entry) => normalizeArchiveEntry(entry))
      .filter((entry): entry is ChatArchiveEntry => entry !== null)
      .sort((a, b) => b.archivedAt - a.archivedAt);
  } catch {
    return [];
  }
}

export function saveChatArchive(input: SaveArchiveInput): ChatArchiveEntry[] {
  const sessionKey = (input.sessionKey || "").trim();
  const sourceMessages = Array.isArray(input.messages) ? input.messages : [];
  const messages = cloneSerializable(sourceMessages);
  if (!sessionKey || messages.length === 0) {
    return loadChatArchives();
  }

  const nextEntry: ChatArchiveEntry = {
    id: `arc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sessionKey,
    label: (input.label || "").trim() || sessionKey,
    archivedAt: Date.now(),
    messageCount: messages.length,
    preview: buildArchivePreview(messages),
    messages,
  };

  const existing = loadChatArchives();
  const next = [nextEntry, ...existing].slice(0, MAX_ARCHIVES);
  persist(next);
  return next;
}

function persist(entries: ChatArchiveEntry[]) {
  localStorage.setItem(ARCHIVES_KEY, JSON.stringify(entries));
}

function normalizeArchiveEntry(input: unknown): ChatArchiveEntry | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  const row = input as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id.trim() : "";
  const sessionKey = typeof row.sessionKey === "string" ? row.sessionKey.trim() : "";
  const label = typeof row.label === "string" ? row.label.trim() : "";
  const archivedAt = typeof row.archivedAt === "number" ? row.archivedAt : 0;
  const messageCount = typeof row.messageCount === "number" ? row.messageCount : 0;
  const preview = typeof row.preview === "string" ? row.preview.trim() : "";
  const messages = Array.isArray(row.messages) ? row.messages : [];
  if (!id || !sessionKey || !archivedAt || messages.length === 0) {
    return null;
  }
  return {
    id,
    sessionKey,
    label: label || sessionKey,
    archivedAt,
    messageCount: messageCount > 0 ? messageCount : messages.length,
    preview: preview || buildArchivePreview(messages),
    messages: cloneSerializable(messages),
  };
}

function buildArchivePreview(messages: unknown[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const text = extractTextPreview(messages[i]);
    if (text) {
      return text;
    }
  }
  return "Conversation archive";
}

function extractTextPreview(message: unknown): string {
  if (typeof message === "string") {
    return compactText(message);
  }
  if (!message || typeof message !== "object") {
    return "";
  }
  const row = message as Record<string, unknown>;
  const content = row.content;
  if (typeof content === "string") {
    return compactText(content);
  }
  if (Array.isArray(content)) {
    for (const block of content) {
      if (!block || typeof block !== "object") {
        continue;
      }
      const item = block as Record<string, unknown>;
      if (typeof item.text === "string" && item.text.trim()) {
        return compactText(item.text);
      }
    }
  }
  return "";
}

function compactText(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  if (normalized.length <= 120) {
    return normalized;
  }
  return `${normalized.slice(0, 117)}...`;
}

function cloneSerializable<T>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
}
