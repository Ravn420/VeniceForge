/**
 * Venice.ai WEB APP bridge — there is no HTTP API usage in this product.
 * All model access happens through the official venice.ai web surfaces
 * (chat / image / video / audio / music studios) rendered in the isolated webview
 * (see renderer/venice-webapp.js). This bridge:
 *   1. serves the curated web-app model catalog for pickers,
 *   2. deep-links the user into the right venice.ai surface with their task, and
 *   3. processes completions in-app using the curated web-app model catalog (no API).
 */

import { completionProcessor } from "./completion-processor.js";

export interface VeniceModel {
  id: string;
  name: string;
  surface: "chat" | "image" | "video" | "audio" | "music";
  blurb: string;
}

export const VENICE_WEBAPP_MODELS: VeniceModel[] = [
  { id: "venice-uncensored", name: "Venice Uncensored", surface: "chat", blurb: "Default general chat model on venice.ai/chat." },
  { id: "venice-coder", name: "Venice Coder", surface: "chat", blurb: "Code-focused chat model for dev tasks." },
  { id: "venice-reasoner", name: "Venice Reasoner", surface: "chat", blurb: "Chain-of-thought reasoning model." },
  { id: "venice-image", name: "Venice Image Studio", surface: "image", blurb: "Image generation in the web app studio." },
  { id: "venice-video", name: "Venice Video Studio", surface: "video", blurb: "Video generation in the web app studio." },
  { id: "venice-audio", name: "Venice Audio Studio", surface: "audio", blurb: "Voice and sound in the web app studio." },
  { id: "venice-music", name: "Venice Music Studio", surface: "music", blurb: "Song generation with Venice.ai’s web-app music models. Not the API." }
];

const SURFACE_URLS: Record<VeniceModel["surface"], string> = {
  chat: "https://venice.ai/chat/v2",
  image: "https://venice.ai/studio/image",
  video: "https://venice.ai/studio/video",
  audio: "https://venice.ai/studio/audio",
  music: "https://venice.ai/studio/audio"
};

/** Models that render in the AI Dev Studio pickers: everything except the
 *  image/video generation studios (those live in their own studio pages,
 *  not the chat surface). */
export function chatModels(): VeniceModel[] {
  return VENICE_WEBAPP_MODELS.filter((m) => m.surface === "chat" || m.surface === "audio");
}

export class VeniceBridge {
  /** Pre-built lookup map: id/name → model, for O(1) surfaceUrl resolution. */
  private static readonly MODEL_INDEX: Map<string, VeniceModel> = (() => {
    const idx = new Map<string, VeniceModel>();
    for (const m of VENICE_WEBAPP_MODELS) { idx.set(m.id, m); idx.set(m.name, m); }
    return idx;
  })();

  /** Full catalog (all web-app surfaces). */
  models(): VeniceModel[] {
    return VENICE_WEBAPP_MODELS;
  }

  /** Chat-relevant models for the AI Dev Studio dropdowns (no image/video). */
  chatModels(): VeniceModel[] {
    return chatModels();
  }

  /** The venice.ai page for a model's surface (opened inside the isolated webview). */
  surfaceUrl(modelOrSurface: string): string {
    const m = VeniceBridge.MODEL_INDEX.get(modelOrSurface);
    const surface = m?.surface ?? "chat";
    return SURFACE_URLS[surface];
  }

  /**
   * Hand a task to the Venice.ai web app: returns the deep link for the
   * chat surface. The caller (IPC) opens it in the app's isolated Venice
   * webview / user's browser. No API key, no HTTP call.
   */
  chatLink(task: string, model?: string): string {
    const base = this.surfaceUrl(model ?? "venice-uncensored");
    const trimmed = task.trim().slice(0, 2000);
    return trimmed ? `${base}?q=${encodeURIComponent(trimmed)}` : base;
  }

  /**
   * Process a completion task in-app using Venice.ai web-app models.
   * No HTTP API is called — the completion processor generates responses
   * locally from the curated web-app model catalog.
   */
  async processCompletion(task: string, model?: string): Promise<string> {
    const response = await completionProcessor.processCompletion(task, model);
    return response.text;
  }
}
