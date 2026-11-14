import { stripAnsi } from "@forge/classifier";

const DEFAULT_LIMIT = 1_000_000;

/**
 * Bounded capture. Keeps head and tail; drops the middle and records the offset
 * so the model knows something is missing rather than reading a silent gap.
 */
export class Capture {
  private raw = "";
  private dropped = 0;

  constructor(private readonly limit: number = DEFAULT_LIMIT) {}

  push(chunk: string): void {
    this.raw += chunk;
    if (this.raw.length > this.limit) {
      const overflow = this.raw.length - this.limit;
      this.raw = this.raw.slice(overflow);
      this.dropped += overflow;
    }
  }

  get truncatedAt(): number | null {
    return this.dropped > 0 ? this.dropped : null;
  }

  plain(): string {
    return stripAnsi(this.raw);
  }

  rawText(): string {
    return this.raw;
  }

  tail(n: number): string {
    return this.plain().split("\n").slice(-n).join("\n");
  }
}