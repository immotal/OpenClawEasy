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
  // Text-first export mode: prioritize crisp readable text over background fidelity.
  const scale = Math.min((window.devicePixelRatio || 1) * 1.5, 3);
  const palette = resolveCapturePalette();
  const shotId = `shot-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  target.setAttribute("data-shot-id", shotId);
  let canvas: HTMLCanvasElement;
  try {
    const options = {
      backgroundColor: palette.canvasBg,
      useCORS: true,
      logging: false,
      scale,
      imageTimeout: 3000,
      onclone: (doc: Document) => {
        const cloned = doc.querySelector(`[data-shot-id="${shotId}"]`) as HTMLElement | null;
        if (!cloned) {
          return;
        }
        solidifyBubbleForCapture(cloned, palette);
      },
      ignoreElements: (element: Element) =>
        element instanceof HTMLElement && element.classList.contains("chat-bubble-actions"),
    };
    try {
      canvas = await html2canvas(target, {
        ...options,
        foreignObjectRendering: true,
      });
      if (isLikelyBlankCanvas(canvas, palette.canvasBg)) {
        canvas = await html2canvas(target, {
          ...options,
          foreignObjectRendering: false,
        });
      }
    } catch {
      canvas = await html2canvas(target, {
        ...options,
        foreignObjectRendering: false,
      });
    }
  } finally {
    target.removeAttribute("data-shot-id");
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) {
    throw new Error("Failed to encode PNG blob.");
  }
  return blob;
}

type CapturePalette = {
  canvasBg: string;
  bubbleBg: string;
  text: string;
  muted: string;
  link: string;
  border: string;
  codeBg: string;
  quoteBg: string;
};

function resolveCapturePalette(): CapturePalette {
  const rootToken = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
  const bodyBg = getComputedStyle(document.body).backgroundColor;
  const base =
    parseColor(rootToken) ??
    parseColor(bodyBg) ?? {
      r: 18,
      g: 20,
      b: 26,
      a: 1,
    };
  const dark = relativeLuminance(base) < 0.45;
  if (dark) {
    return {
      canvasBg: "rgb(17, 20, 27)",
      bubbleBg: "rgb(23, 27, 36)",
      text: "rgb(245, 247, 250)",
      muted: "rgb(197, 203, 213)",
      link: "rgb(239, 93, 80)",
      border: "rgba(245, 247, 250, 0.28)",
      codeBg: "rgba(245, 247, 250, 0.08)",
      quoteBg: "rgba(245, 247, 250, 0.06)",
    };
  }
  return {
    canvasBg: "rgb(255, 255, 255)",
    bubbleBg: "rgb(248, 250, 252)",
    text: "rgb(18, 22, 28)",
    muted: "rgb(74, 85, 101)",
    link: "rgb(192, 57, 43)",
    border: "rgba(18, 22, 28, 0.24)",
    codeBg: "rgba(18, 22, 28, 0.07)",
    quoteBg: "rgba(18, 22, 28, 0.05)",
  };
}

function solidifyBubbleForCapture(bubble: HTMLElement, palette: CapturePalette) {
  bubble.style.backgroundColor = palette.bubbleBg;
  bubble.style.borderColor = palette.border;
  bubble.style.boxShadow = "none";
  bubble.style.color = palette.text;
  bubble.style.webkitTextFillColor = palette.text;
  bubble.style.mixBlendMode = "normal";
  bubble.style.opacity = "1";
  bubble.style.filter = "none";
  bubble.style.backdropFilter = "none";
  bubble.style.webkitBackdropFilter = "none";
  bubble.style.animation = "none";
  bubble.style.transition = "none";
  bubble.style.transform = "none";
  bubble.style.textShadow = "none";
  bubble.style.webkitFontSmoothing = "antialiased";
  bubble.style.textRendering = "geometricPrecision";

  const descendants = bubble.querySelectorAll<HTMLElement>("*");
  descendants.forEach((el) => {
    const tag = el.tagName.toLowerCase();
    const isInlineCode = tag === "code" && el.parentElement?.tagName.toLowerCase() !== "pre";
    const isCodeBlock = tag === "pre" || isInlineCode;
    const isQuote = tag === "blockquote";
    const isTablePart = tag === "table" || tag === "th" || tag === "td" || tag === "hr";
    const isIcon = tag === "svg" || tag === "path" || tag === "line" || tag === "polyline";

    if (!isIcon) {
      if (tag === "a") {
        el.style.color = palette.link;
        el.style.webkitTextFillColor = palette.link;
      } else if (el.classList.contains("chat-group-timestamp")) {
        el.style.color = palette.muted;
        el.style.webkitTextFillColor = palette.muted;
      } else {
        el.style.color = palette.text;
        el.style.webkitTextFillColor = palette.text;
      }
    }

    if (isCodeBlock) {
      el.style.backgroundColor = palette.codeBg;
      el.style.borderColor = palette.border;
    } else if (isQuote) {
      el.style.backgroundColor = palette.quoteBg;
      el.style.borderColor = palette.border;
    } else if (isTablePart) {
      if (tag === "th") {
        el.style.backgroundColor = palette.codeBg;
      } else {
        el.style.backgroundColor = "transparent";
      }
      el.style.borderColor = palette.border;
    } else if (tag !== "img" && tag !== "video" && tag !== "canvas" && !isIcon) {
      el.style.backgroundColor = "transparent";
    }

    el.style.opacity = "1";
    el.style.filter = "none";
    el.style.backdropFilter = "none";
    el.style.webkitBackdropFilter = "none";
    el.style.mixBlendMode = "normal";
    el.style.animation = "none";
    el.style.transition = "none";
    el.style.transform = "none";
    el.style.textShadow = "none";
  });
}

type Rgba = { r: number; g: number; b: number; a: number };

function relativeLuminance(color: Rgba): number {
  const toLinear = (v: number) => {
    const c = clamp01(v / 255);
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const r = toLinear(color.r);
  const g = toLinear(color.g);
  const b = toLinear(color.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function isLikelyBlankCanvas(canvas: HTMLCanvasElement, expectedBg: string): boolean {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx || canvas.width <= 0 || canvas.height <= 0) {
    return true;
  }
  const sampleW = Math.min(canvas.width, 220);
  const sampleH = Math.min(canvas.height, 220);
  const offsetX = Math.floor((canvas.width - sampleW) / 2);
  const offsetY = Math.floor((canvas.height - sampleH) / 2);
  const img = ctx.getImageData(offsetX, offsetY, sampleW, sampleH).data;
  const bg = parseColor(expectedBg) ?? { r: 255, g: 255, b: 255, a: 1 };
  let diff = 0;
  const total = sampleW * sampleH;
  for (let i = 0; i < img.length; i += 4) {
    const dr = Math.abs(img[i] - bg.r);
    const dg = Math.abs(img[i + 1] - bg.g);
    const db = Math.abs(img[i + 2] - bg.b);
    const da = Math.abs(img[i + 3] - 255);
    if (dr + dg + db + da > 18) {
      diff += 1;
    }
  }
  // If almost all sampled pixels are nearly identical to the background color,
  // this rendering pass likely produced a blank image.
  return diff / total < 0.005;
}

function parseColor(input: string): Rgba | null {
  const value = input.trim().toLowerCase();
  if (!value || value === "transparent") {
    return { r: 0, g: 0, b: 0, a: 0 };
  }
  const hex = value.match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    const raw = hex[1];
    if (raw.length === 3 || raw.length === 4) {
      const r = Number.parseInt(raw[0] + raw[0], 16);
      const g = Number.parseInt(raw[1] + raw[1], 16);
      const b = Number.parseInt(raw[2] + raw[2], 16);
      const a = raw.length === 4 ? Number.parseInt(raw[3] + raw[3], 16) / 255 : 1;
      return { r, g, b, a: clamp01(a) };
    }
    if (raw.length === 6 || raw.length === 8) {
      const r = Number.parseInt(raw.slice(0, 2), 16);
      const g = Number.parseInt(raw.slice(2, 4), 16);
      const b = Number.parseInt(raw.slice(4, 6), 16);
      const a = raw.length === 8 ? Number.parseInt(raw.slice(6, 8), 16) / 255 : 1;
      return { r, g, b, a: clamp01(a) };
    }
  }
  const rgb = value.match(/^rgb\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*\)$/);
  if (rgb) {
    return {
      r: clamp255(Number.parseFloat(rgb[1])),
      g: clamp255(Number.parseFloat(rgb[2])),
      b: clamp255(Number.parseFloat(rgb[3])),
      a: 1,
    };
  }
  const rgba = value.match(
    /^rgba\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*\)$/,
  );
  if (rgba) {
    return {
      r: clamp255(Number.parseFloat(rgba[1])),
      g: clamp255(Number.parseFloat(rgba[2])),
      b: clamp255(Number.parseFloat(rgba[3])),
      a: clamp01(Number.parseFloat(rgba[4])),
    };
  }
  return null;
}

function clamp255(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(255, Math.round(v)));
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 1;
  return Math.max(0, Math.min(1, v));
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
      <span class="chat-screenshot-btn__icon" aria-hidden="true">${icons.camera}</span>
    </button>
  `;
}
