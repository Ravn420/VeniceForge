import { Event, type Event as EventType } from "@forge/contracts";

type Listener = (event: EventType) => void;

export class Broadcaster {
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly seqs = new Map<string, number>();

  attach(sessionId: string, fn: Listener): () => void {
    let set = this.listeners.get(sessionId);
    if (!set) {
      set = new Set();
      this.listeners.set(sessionId, set);
    }
    set.add(fn);
    return () => {
      set?.delete(fn);
      if (set && set.size === 0) this.listeners.delete(sessionId);
    };
  }

  emit(sessionId: string, payload: Record<string, unknown>): EventType | null {
    const nextSeq = (this.seqs.get(sessionId) ?? 0) + 1;
    this.seqs.set(sessionId, nextSeq);
    const parsed = Event.safeParse({
      seq: nextSeq,
      at: Date.now(),
      ...payload
    });
    if (!parsed.success) return null;
    const set = this.listeners.get(sessionId);
    if (set) {
      for (const fn of set) {
        try {
          fn(parsed.data);
        } catch {
          /* ignore closed subscriber */
        }
      }
    }
    return parsed.data;
  }
}
