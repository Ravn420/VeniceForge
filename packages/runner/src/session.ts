import { EventEmitter } from "node:events";
import { makeId, type Actor, type TerminalSession } from "@forge/contracts";
import { Capture } from "./capture.js";

export interface TabPty {
  write(d: string): void;
  resize(c: number, r: number): void;
  kill(): void;
}

export interface Tab {
  index: number;
  capture: Capture;
  pty: TabPty | null;
}

const TYPING_IDLE_MS = 700;

export class SessionManager extends EventEmitter {
  readonly session: TerminalSession;
  readonly tabs = new Map<number, Tab>();
  private typingTimer: ReturnType<typeof setTimeout> | null = null;
  private nextTab = 1;

  constructor(sessionId: string, projectId: string, shell = "/bin/bash") {
    super();
    this.session = {
      id: sessionId,
      projectId,
      shell,
      cols: 120,
      rows: 32,
      createdAt: new Date().toISOString(),
      closedAt: null,
      modelTab: 0,
      humanFocusedTab: 0,
      isHumanTyping: false
    };
    this.tabs.set(0, { index: 0, capture: new Capture(), pty: null });
  }

  openTab(): number {
    const index = this.nextTab;
    this.nextTab += 1;
    this.tabs.set(index, { index, capture: new Capture(), pty: null });
    return index;
  }

  attachPty(tabIndex: number, pty: TabPty): void {
    const tab = this.tabs.get(tabIndex);
    if (tab) tab.pty = pty;
  }

  write(tabIndex: number, data: string): void {
    this.tabs.get(tabIndex)?.pty?.write(data);
  }

  resize(tabIndex: number, cols: number, rows: number): void {
    this.session.cols = cols;
    this.session.rows = rows;
    this.tabs.get(tabIndex)?.pty?.resize(cols, rows);
  }

  targetTabForModel(): number {
    return this.session.isHumanTyping ? this.session.modelTab : this.session.humanFocusedTab;
  }

  noteHumanInput(): void {
    this.session.isHumanTyping = true;
    this.emitState();
    if (this.typingTimer) clearTimeout(this.typingTimer);
    this.typingTimer = setTimeout(() => {
      this.session.isHumanTyping = false;
      this.emitState();
    }, TYPING_IDLE_MS);
  }

  focus(tabIndex: number): void {
    this.session.humanFocusedTab = tabIndex;
    this.emitState();
  }

  private emitState(): void {
    this.emit("state", {
      isHumanTyping: this.session.isHumanTyping,
      humanFocusedTab: this.session.humanFocusedTab,
      modelTab: this.session.modelTab
    });
  }

  close(): void {
    this.session.closedAt = new Date().toISOString();
    for (const tab of this.tabs.values()) tab.pty?.kill();
    this.tabs.clear();
  }

  static newId(): string {
    return makeId("ses");
  }

  static actorForModel(modelId: string, runId: string): Actor {
    return { kind: "model", modelId, runId };
  }
}