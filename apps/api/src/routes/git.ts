import { git } from "@forge/runner";

export const gitRoutes = {
  init(root: string): void {
    git.init(root);
  },

  status(root: string): git.GitStatus {
    return git.status(root);
  },

  diff(root: string): string {
    return git.diff(root);
  },

  remotes(root: string): git.Remote[] {
    return git.remotes(root).map((r) => ({ name: r.name, url: git.redact(r.url) }));
  },

  commit(root: string, message?: string): { hash: string; message: string } {
    const resolved = message?.trim() ? message.trim() : git.generateMessage(root);
    const hash = git.commit(root, resolved);
    return { hash, message: resolved };
  },

  addRemote(root: string, name: string, url: string): void {
    git.addRemote(root, name, url);
  },

  push(root: string, remote: string, ref: string): string {
    return git.push(root, remote, ref);
  }
};
