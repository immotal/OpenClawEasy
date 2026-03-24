import { html, type TemplateResult } from "lit";
import html2canvas from "html2canvas";
import { icons } from "../icons.ts";

const SHOT_LABEL = "Screenshot bubble";
const SHOT_DONE_LABEL = "Saved";
const SHOT_ERROR_LABEL = "Screenshot failed";
const SHOT_DONE_FOR_MS = 1500;
const SHOT_ERROR_FOR_MS = 2000;

function setButtonLabel(button: HTMLButtonElement, label: string) {
  button.title = label;
  button.setAttribute("aria-label", label);
}

function createFileName() {
  const now = new Date();
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");
  const time = [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");
  return `oneclaw-chat-bubble-${date}-${time}.png`;
}

async function renderBubbleToBlob(target: HTMLElement): Promise<Blob> {
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = await html2canvas(target, {
    backgroundColor: null,
    useCORS: true,
    logging: false,
    scale,
    imageTimeout: 3000,
  });
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) {
    throw new Error("Failed to encode PNG blob.");
  }
  return blob;
}

async function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.rel = "noopener";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export function renderBubbleScreenshotButton(): TemplateResult {
  return html`
    <button
      class="chat-screenshot-btn"
      type="button"
      title=${SHOT_LABEL}
      aria-label=${SHOT_LABEL}
      @click=${async (e: Event) => {
        const btn = e.currentTarget as HTMLButtonElement | null;
        const bubble = btn?.closest(".chat-bubble") as HTMLElement | null;
        if (!btn || !bubble || btn.dataset.shotting === "1") {
          return;
        }

        btn.dataset.shotting = "1";
        btn.setAttribute("aria-busy", "true");
        btn.disabled = true;

        try {
          const blob = await renderBubbleToBlob(bubble);
          if (!btn.isConnected) {
            return;
          }
          await saveBlob(blob, createFileName());
          if (!btn.isConnected) {
            return;
          }
          btn.dataset.done = "1";
          setButtonLabel(btn, SHOT_DONE_LABEL);
          window.setTimeout(() => {
            if (!btn.isConnected) {
              return;
            }
            delete btn.dataset.done;
            setButtonLabel(btn, SHOT_LABEL);
          }, SHOT_DONE_FOR_MS);
        } catch {
          if (!btn.isConnected) {
            return;
          }
          btn.dataset.error = "1";
          setButtonLabel(btn, SHOT_ERROR_LABEL);
          window.setTimeout(() => {
            if (!btn.isConnected) {
              return;
            }
            delete btn.dataset.error;
            setButtonLabel(btn, SHOT_LABEL);
          }, SHOT_ERROR_FOR_MS);
        } finally {
          if (!btn.isConnected) {
            return;
          }
          delete btn.dataset.shotting;
          btn.removeAttribute("aria-busy");
          btn.disabled = false;
        }
      }}
    >
      <span class="chat-screenshot-btn__icon" aria-hidden="true">${icons.image}</span>
    </button>
  `;
}
