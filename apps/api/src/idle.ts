import type { CheckpointStore, Sandbox, SessionManager } from "@forge/runner";

export type LiveEntry = {
  sandbox: Sandbox;
  manager: SessionManager;
  checkpoints?: CheckpointStore;
  lastActivity: number;
};

export class IdleReaper {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly live: Map<string, LiveEntry>,
    private readonly timeoutMs: number,
    private readonly onIdle: (id: string) => void
  ) {}

  touch(id: string): void {
    const entry = this.live.get(id);
    if (entry) entry.lastActivity = Date.now();
  }

  sweep(now = Date.now()): string[] {
    const reaped: string[] = [];
    for (const [id, entry] of this.live.entries()) {
      if (now - entry.lastActivity > this.timeoutMs) {
        try {
          entry.manager.close();
        } catch {
          /* ignore */
        }
        try {
          entry.sandbox.destroy();
        } catch {
          /* ignore */
        }
        this.live.delete(id);
        this.onIdle(id);
        reaped.push(id);
      }
    }
    return reaped;
  }

  start(): void {
    if (this.timer) return;
    const intervalMs = Math.max(1_000, Math.min(this.timeoutMs, 15_000));
    this.timer = setInterval(() => {
      this.sweep();
    }, intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export function idleMs(): number {
  const configured = Number(process.env.SESSION_IDLE_MS ?? 600_000);
  return Number.isFinite(configured) && configured > 0 ? configured : 600_000;
}
