import { ErrorCode } from "@forge/contracts";

interface WindowEntry {
  count: number;
  resetAt: number;
}

export class RateLimiter {
  private readonly windows = new Map<string, WindowEntry>();
  private readonly windowMs = 60_000;

  constructor(private readonly maxPerMinute: number) {}

  take(key: string): { code: typeof ErrorCode.E_RATE_LIMITED; message: string } | null {
    const now = Date.now();
    let entry = this.windows.get(key);
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + this.windowMs };
      this.windows.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > this.maxPerMinute) {
      return {
        code: ErrorCode.E_RATE_LIMITED,
        message: `Rate limit exceeded (${this.maxPerMinute}/min)`
      };
    }
    return null;
  }

  sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.windows.entries()) {
      if (now >= entry.resetAt) this.windows.delete(key);
    }
  }
}
