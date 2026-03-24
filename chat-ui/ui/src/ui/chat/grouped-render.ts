import { html, nothing } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import type { AssistantIdentity } from "../assistant-identity.ts";
import type { MessageGroup } from "../types/chat-types.ts";
import { toSanitizedMarkdownHtml } from "../markdown.ts";
import { detectTextDirection } from "../text-direction.ts";
import { renderCopyAsMarkdownButton } from "./copy-as-markdown.ts";
import { renderBubbleScreenshotButton } from "./screenshot.ts";
import {
  extractTextCached,
  extractThinkingCached,
  formatReasoningMarkdown,
} from "./message-extract.ts";
import { isToolResultMessage, normalizeRoleForGrouping } from "./message-normalizer.ts";
import { extractToolCards, renderToolCardSidebar } from "./tool-cards.ts";
import type { ToolCard } from "../types/chat-types.ts";

type ImageBlock = {
  url: string;
  alt?: string;
};

function extractImages(message: unknown): ImageBlock[] {
  const m = message as Record<string, unknown>;
  const content = m.content;
  const images: ImageBlock[] = [];

  if (Array.isArray(content)) {
    for (const block of content) {
      if (typeof block !== "object" || block === null) {
        continue;
      }
      const b = block as Record<string, unknown>;

      if (b.type === "image") {
        // Handle source object format (from sendChatMessage)
        const source = b.source as Record<string, unknown> | undefined;
        if (source?.type === "base64" && typeof source.data === "string") {
          const data = source.data;
          const mediaType = (source.media_type as string) || "image/png";
          // If data is already a data URL, use it directly
          const url = data.startsWith("data:") ? data : `data:${mediaType};base64,${data}`;
          images.push({ url });
        } else if (typeof b.url === "string") {
          images.push({ url: b.url });
        }
      } else if (b.type === "image_url") {
        // OpenAI format
        const imageUrl = b.image_url as Record<string, unknown> | undefined;
        if (typeof imageUrl?.url === "string") {
          images.push({ url: imageUrl.url });
        }
      }
    }
  }

  return images;
}

export function renderReadingIndicatorGroup(assistant?: AssistantIdentity) {
  return html`
    <div class="chat-group assistant">
      ${renderAvatar("assistant", assistant)}
      <div class="chat-group-messages">
        <div class="chat-bubble chat-reading-indicator" aria-hidden="true">
          <span class="chat-reading-indicator__dots">
            <span></span><span></span><span></span>
          </span>
        </div>
      </div>
    </div>
  `;
}

export function renderStreamingGroup(
  text: string,
  startedAt: number,
  onOpenSidebar?: (content: string) => void,
  assistant?: AssistantIdentity,
) {
  const timestamp = new Date(startedAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const name = assistant?.name ?? "Assistant";

  return html`
    <div class="chat-group assistant">
      ${renderAvatar("assistant", assistant)}
      <div class="chat-group-messages">
        ${renderGroupedMessage(
          {
            role: "assistant",
            content: [{ type: "text", text }],
            timestamp: startedAt,
          },
          { isStreaming: true, showReasoning: false },
          onOpenSidebar,
        )}
        <div class="chat-group-footer">
          <span class="chat-sender-name">${name}</span>
          <span class="chat-group-timestamp">${timestamp}</span>
        </div>
      </div>
    </div>
  `;
}

export function renderMessageGroup(
  group: MessageGroup,
  opts: {
    onOpenSidebar?: (content: string) => void;
    showReasoning: boolean;
    assistantName?: string;
    assistantAvatar?: string | null;
  },
) {
  const normalizedRole = normalizeRoleForGrouping(group.role);
  const assistantName = opts.assistantName ?? "Assistant";
  const who =
    normalizedRole === "user"
      ? "You"
      : normalizedRole === "assistant"
        ? assistantName
        : normalizedRole === "tool"
          ? "Tools"
        : normalizedRole;
  const roleClass =
    normalizedRole === "user"
      ? "user"
      : normalizedRole === "assistant"
        ? "assistant"
        : normalizedRole === "tool"
          ? "tool"
          : "other";
  const timestamp = new Date(group.timestamp).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  return html`
    <div class="chat-group ${roleClass}">
      ${renderAvatar(group.role, {
        name: assistantName,
        avatar: opts.assistantAvatar ?? null,
      })}
      <div class="chat-group-messages">
        ${
          normalizedRole === "tool"
            ? renderToolRoundGroup(group, opts.onOpenSidebar)
            : group.messages.map((item, index) =>
                renderGroupedMessage(
                  item.message,
                  {
                    isStreaming: group.isStreaming && index === group.messages.length - 1,
                    showReasoning: opts.showReasoning,
                  },
                  opts.onOpenSidebar,
                ),
              )
        }
        <div class="chat-group-footer">
          <span class="chat-sender-name">${who}</span>
          <span class="chat-group-timestamp">${timestamp}</span>
        </div>
      </div>
    </div>
  `;
}

export function renderToolActivityStack(
  stack: { key: string; groups: MessageGroup[]; timestamp: number },
  opts: {
    onOpenSidebar?: (content: string) => void;
    showReasoning: boolean;
    assistantName?: string;
    assistantAvatar?: string | null;
  },
) {
  const count = stack.groups.length;
  const timestamp = new Date(stack.timestamp).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const assistantName = opts.assistantName ?? "Assistant";
  return html`
    <div class="chat-group tool">
      ${renderAvatar("tool", {
        name: assistantName,
        avatar: null,
      })}
      <div class="chat-group-messages">
        <details class="chat-tool-stack">
          <summary class="chat-tool-stack__summary">
            <span class="chat-tool-stack__title-wrap">
              <span class="chat-tool-stack__title">Tool activity</span>
              <span class="chat-tool-stack__meta">${count} items</span>
            </span>
            <span class="chat-tool-stack__chevron" aria-hidden="true">›</span>
          </summary>
          <div class="chat-tool-stack__list">
            ${stack.groups.map((group) =>
              renderMessageGroup(group, {
                onOpenSidebar: opts.onOpenSidebar,
                showReasoning: opts.showReasoning,
                assistantName: opts.assistantName,
                assistantAvatar: opts.assistantAvatar,
              }),
            )}
          </div>
        </details>
        <div class="chat-group-footer">
          <span class="chat-sender-name">Tools</span>
          <span class="chat-group-timestamp">${timestamp}</span>
        </div>
      </div>
    </div>
  `;
}

function renderAvatar(role: string, assistant?: Pick<AssistantIdentity, "name" | "avatar">) {
  const normalized = normalizeRoleForGrouping(role);
  const assistantName = assistant?.name?.trim() || "Assistant";
  const assistantAvatar = assistant?.avatar?.trim() || "";
  const initial =
    normalized === "user"
      ? "U"
      : normalized === "assistant"
        ? assistantName.charAt(0).toUpperCase() || "A"
        : normalized === "tool"
          ? "⚙"
          : "?";
  const className =
    normalized === "user"
      ? "user"
      : normalized === "assistant"
        ? "assistant"
        : normalized === "tool"
          ? "tool"
          : "other";

  if (assistantAvatar && normalized === "assistant") {
    if (isAvatarUrl(assistantAvatar)) {
      return html`<img
        class="chat-avatar ${className}"
        src="${assistantAvatar}"
        alt="${assistantName}"
      />`;
    }
    return html`<div class="chat-avatar ${className}">${assistantAvatar}</div>`;
  }

  return html`<div class="chat-avatar ${className}">${initial}</div>`;
}

function isAvatarUrl(value: string): boolean {
  return (
    /^https?:\/\//i.test(value) || /^data:image\//i.test(value) || value.startsWith("/") // Relative paths from avatar endpoint
  );
}

function renderMessageImages(images: ImageBlock[]) {
  if (images.length === 0) {
    return nothing;
  }

  return html`
    <div class="chat-message-images">
      ${images.map(
        (img) => html`
          <img
            src=${img.url}
            alt=${img.alt ?? "Attached image"}
            class="chat-message-image"
            @click=${() => window.open(img.url, "_blank")}
          />
        `,
      )}
    </div>
  `;
}

function renderGroupedMessage(
  message: unknown,
  opts: { isStreaming: boolean; showReasoning: boolean },
  onOpenSidebar?: (content: string) => void,
) {
  const m = message as Record<string, unknown>;
  const role = typeof m.role === "string" ? m.role : "unknown";
  const roleLower = role.toLowerCase();
  const isToolResult =
    isToolResultMessage(message) ||
    roleLower === "toolresult" ||
    roleLower === "tool_result" ||
    typeof m.toolCallId === "string" ||
    typeof m.tool_call_id === "string";
  const isToolRole =
    roleLower === "tool" ||
    roleLower === "tool_call" ||
    roleLower === "toolcall" ||
    isToolResult;

  const toolCards = extractToolCards(message);
  const hasToolCards = toolCards.length > 0;
  const images = extractImages(message);
  const hasImages = images.length > 0;

  const extractedText = extractTextCached(message);
  const extractedThinking =
    opts.showReasoning && role === "assistant" ? extractThinkingCached(message) : null;
  const markdownBase = extractedText?.trim() ? extractedText : null;
  const reasoningMarkdown = extractedThinking ? formatReasoningMarkdown(extractedThinking) : null;
  const markdown = markdownBase;
  const canCopyMarkdown = role === "assistant" && Boolean(markdown?.trim());
  const isAssistantToolOnly =
    roleLower === "assistant" &&
    hasToolCards &&
    !markdown &&
    !reasoningMarkdown &&
    !hasImages;

  const bubbleClasses = [
    "chat-bubble",
    canCopyMarkdown ? "has-copy" : "",
    opts.isStreaming ? "streaming" : "",
    "fade-in",
  ]
    .filter(Boolean)
    .join(" ");

  // Tool role messages must stay collapsed to a single line by default.
  // Never render full markdown/text bubble for tool payloads.
  if (isToolRole) {
    if (hasToolCards) {
      return html`${toolCards.map((card) => renderToolCardSidebar(card, onOpenSidebar))}`;
    }
    const fallbackCard = {
      kind: "result" as const,
      name:
        (typeof m.toolName === "string" && m.toolName) ||
        (typeof m.tool_name === "string" && m.tool_name) ||
        "tool",
      text: markdown ?? undefined,
    };
    return html`${renderToolCardSidebar(fallbackCard, onOpenSidebar)}`;
  }

  // Assistant messages that are effectively tool-only should render
  // as standalone tool rounds (without an outer assistant bubble).
  if (isAssistantToolOnly) {
    return renderToolRoundFromCards(toolCards, onOpenSidebar, "Tool activity");
  }

  // Keep all assistant content inside a single collapsible tool section
  // when tool activity exists, so there is no extra outer chat bubble.
  if (roleLower === "assistant" && hasToolCards) {
    return renderToolRoundFromCards(toolCards, onOpenSidebar, "Tool activity", {
      markdown,
      reasoningMarkdown,
      images,
    });
  }

  if (!markdown && !hasToolCards && !hasImages) {
    return nothing;
  }

  return html`
    <div class="${bubbleClasses}">
      <div class="chat-bubble-actions">
        ${canCopyMarkdown ? renderCopyAsMarkdownButton(markdown!) : nothing}
        ${renderBubbleScreenshotButton()}
      </div>
      ${renderMessageImages(images)}
      ${
        reasoningMarkdown
          ? html`<div class="chat-thinking">${unsafeHTML(
              toSanitizedMarkdownHtml(reasoningMarkdown),
            )}</div>`
          : nothing
      }
      ${
        markdown
          ? html`<div class="chat-text" dir="${detectTextDirection(markdown)}">${unsafeHTML(toSanitizedMarkdownHtml(markdown))}</div>`
          : nothing
      }
      ${hasToolCards ? renderToolRoundFromCards(toolCards, onOpenSidebar, "Tool activity") : nothing}
    </div>
  `;
}

function renderToolRoundGroup(group: MessageGroup, onOpenSidebar?: (content: string) => void) {
  const cards = collectToolCardsFromGroup(group);
  return renderToolRoundFromCards(cards, onOpenSidebar, "Tool activity");
}

function renderToolRoundFromCards(
  cards: Array<{ kind: "call" | "result"; name: string; text?: string }>,
  onOpenSidebar?: (content: string) => void,
  title = "Tool activity",
  extraContent?: {
    markdown?: string | null;
    reasoningMarkdown?: string | null;
    images?: ImageBlock[];
  },
) {
  if (cards.length === 0) {
    return nothing;
  }
  const callCount = cards.filter((card) => card.kind === "call").length;
  const resultCount = cards.filter((card) => card.kind === "result").length;
  const uniqueNames = Array.from(new Set(cards.map((card) => card.name).filter(Boolean)));
  const namesLabel = uniqueNames.slice(0, 3).join(", ");
  const extraNames = Math.max(0, uniqueNames.length - 3);
  const stateLabel =
    callCount > resultCount ? "running" : resultCount > 0 ? "completed" : "pending";
  const hasExtraContent = Boolean(
    extraContent?.markdown || extraContent?.reasoningMarkdown || extraContent?.images?.length,
  );

  return html`
    <details class="chat-tool-round">
      <summary class="chat-tool-round__summary">
        <div class="chat-tool-round__title-wrap">
          <span class="chat-tool-round__title">${title}</span>
          <span class="chat-tool-round__meta">${callCount} calls · ${resultCount} results</span>
          ${
            namesLabel
              ? html`
                  <span class="chat-tool-round__names" title=${uniqueNames.join(", ")}>
                    ${namesLabel}${extraNames > 0 ? ` +${extraNames}` : ""}
                  </span>
                `
              : nothing
          }
        </div>
        <span class="chat-tool-round__state">${stateLabel}</span>
      </summary>
      <div class="chat-tool-round__list">
        ${
          hasExtraContent
            ? html`
                <div class="chat-tool-round__extra">
                  ${extraContent?.images?.length ? renderMessageImages(extraContent.images) : nothing}
                  ${
                    extraContent?.reasoningMarkdown
                      ? html`<div class="chat-thinking">${unsafeHTML(
                          toSanitizedMarkdownHtml(extraContent.reasoningMarkdown),
                        )}</div>`
                      : nothing
                  }
                  ${
                    extraContent?.markdown
                      ? html`<div class="chat-text" dir="${detectTextDirection(extraContent.markdown)}">
                          ${unsafeHTML(toSanitizedMarkdownHtml(extraContent.markdown))}
                        </div>`
                      : nothing
                  }
                </div>
              `
            : nothing
        }
        ${cards.map((card) => {
          const text = getToolCardText(card);
          const canOpenSidebar = Boolean(onOpenSidebar && text);
          const preview = text ? compactPreview(text, 180) : "";
          return html`
            <div class="chat-tool-round__item">
              <div class="chat-tool-round__item-head">
                <span class="chat-tool-round__item-kind">${card.kind === "call" ? "Call" : "Result"}</span>
                <span class="chat-tool-round__item-name">${card.name}</span>
                ${
                  canOpenSidebar
                    ? html`
                        <button
                          class="chat-tool-round__raw"
                          type="button"
                          @click=${() => onOpenSidebar?.(text!)}
                        >
                          Raw
                        </button>
                      `
                    : nothing
                }
              </div>
              ${preview ? html`<div class="chat-tool-round__item-preview mono">${preview}</div>` : nothing}
            </div>
          `;
        })}
      </div>
    </details>
  `;
}

function collectToolCardsFromGroup(group: MessageGroup): Array<{ kind: "call" | "result"; name: string; text?: string }> {
  const out: Array<{ kind: "call" | "result"; name: string; text?: string }> = [];
  for (const entry of group.messages as Array<{ message?: unknown }>) {
    const message = entry?.message;
    if (!message) continue;
    const cards = extractToolCards(message);
    if (cards.length > 0) {
      for (const card of cards) {
        out.push({
          kind: card.kind,
          name: card.name || "tool",
          text: getToolCardText(card),
        });
      }
      continue;
    }
    const m = message as Record<string, unknown>;
    const fallbackText = extractTextCached(message) ?? undefined;
    out.push({
      kind: "result",
      name:
        (typeof m.toolName === "string" && m.toolName) ||
        (typeof m.tool_name === "string" && m.tool_name) ||
        "tool",
      text: fallbackText,
    });
  }
  return out;
}

function getToolCardText(card: ToolCard): string | undefined {
  const raw = card.text;
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed ? trimmed : undefined;
}

function compactPreview(value: string, maxLen: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= maxLen) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLen - 1)).trim()}...`;
}
