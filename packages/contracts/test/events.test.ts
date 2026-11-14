import { describe, expect, it } from "vitest";
import { EVENT_TYPES, Event } from "../src/events.js";

describe("event union", () => {
  it("declares every type exactly once", () => {
    expect(new Set(EVENT_TYPES).size).toBe(EVENT_TYPES.length);
  });

  it("accepts a session.closed frame", () => {
    const parsed = Event.parse({ seq: 1, at: 1, type: "session.closed", reason: "idle" });
    expect(parsed.type).toBe("session.closed");
  });

  it("rejects an unknown close reason", () => {
    expect(() => Event.parse({ seq: 1, at: 1, type: "session.closed", reason: "gone" })).toThrow();
  });
});