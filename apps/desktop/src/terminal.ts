import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import os from "node:os";
import { EventEmitter } from "node:events";
interface TermEntry {
  proc: ChildProcess;
  emitter: EventEmitter;
}
export class TerminalManager {
  private buffers = new Map<string, string>();
  private terms = new Map<string, TermEntry>();
  create(cwd: string): string {
    const id = randomUUID();
    const shell = os.platform() === "win32" ? "powershell.exe" : "/bin/bash";
    const proc = spawn(shell, [], { cwd, env: { ...process.env, TERM: "xterm-256color" }, stdio: ["pipe", "pipe", "pipe"] });
    const emitter = new EventEmitter();
    proc.stdout?.on("data", (b: Buffer) => {
      const s = b.toString();
      const prev = this.buffers.get(id) ?? "";
      this.buffers.set(id, (prev + s).slice(-160000));
      emitter.emit("data", s);
    });
    proc.stderr?.on("data", (b: Buffer) => emitter.emit("stderr", b.toString()));
    proc.on("exit", (code) => emitter.emit("exit", code));
    this.terms.set(id, { proc, emitter });
    return id;
  }
  write(id: string, data: string): void {
    const entry = this.terms.get(id);
    if (entry && entry.proc) entry.proc.stdin?.write(data);
  }
  resize(id: string, cols: number, rows: number): void { /* ... */ }
  kill(id: string): void {
    const entry = this.terms.get(id);
    if (entry && entry.proc) entry.proc.kill();
    this.terms.delete(id);
    this.buffers.delete(id);
  }
  closeAll(): void {
    for (const [id] of this.terms) this.kill(id);
  }
  onData(id: string, cb: (data: string) => void): void {
    const entry = this.terms.get(id);
    if (entry) entry.emitter.on("data", cb);
  }
  onExit(id: string, cb: (code: number | null) => void): void {
    const entry = this.terms.get(id);
    if (entry) entry.emitter.on("exit", cb);
  }
  getData(id: string): string {
    return this.buffers.get(id) ?? "";
  }
}