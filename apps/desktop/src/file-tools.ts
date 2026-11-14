import { access, mkdir, readdir, rename, rm, stat, writeFile, readFile } from "node:fs/promises";
import { existsSync, type Dirent } from "node:fs";
import { join, sep, dirname } from "node:path";
import { dialog, BrowserWindow, type SaveDialogReturnValue } from "electron";

/**
 * Represents a file or directory entry.
 */
export interface FileEntry {
  name: string;
  path: string;
  dir: boolean;
  size: number;
}

/**
 * Utility class for file system operations within the Electron environment.
 */
export class FileTools {
  /**
   * Reads the content of a file.
   */
  async read(path: string): Promise<string> {
    return readFile(path, "utf8");
  }

  /**
   * Writes content to a file, creating directories if they don't exist.
   */
  async write(path: string, content: string): Promise<void> {
    const dir = dirname(path);
    await mkdir(dir, { recursive: true });
    await writeFile(path, content, "utf8");
  }

  /**
   * Lists entries in a directory.
   */
  async list(dir: string): Promise<FileEntry[]> {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      return Promise.all(
        entries.map(async (entry) => {
          const full = join(dir, entry.name);
          const s = await stat(full);
          return {
            name: entry.name,
            path: full,
            dir: entry.isDirectory(),
            size: s.size,
          };
        })
      );
    } catch {
      return [];
    }
  }

  /**
   * Generates a string representation of a directory tree.
   */
  async tree(dir: string): Promise<string> {
    const lines: string[] = [];
    const walk = async (d: string, prefix: string) => {
      let entries: Dirent[] = [];
      try {
        entries = (await readdir(d, { withFileTypes: true })).sort((a, b) =>
          a.name.localeCompare(b.name)
        );
      } catch {
        return;
      }

      for (const entry of entries) {
        const isDir = entry.isDirectory();
        lines.push(`${prefix}${entry.name}${isDir ? "/" : ""}`);
        if (isDir) {
          await walk(join(d, entry.name), `${prefix}  `);
        }
      }
    };

    await walk(dir, "");
    return lines.join("\n");
  }

  /**
   * Checks if a path exists.
   */
  async exists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Creates a directory recursively.
   */
  async mkdir(path: string): Promise<void> {
    await mkdir(path, { recursive: true });
  }

  /**
   * Removes a file or directory recursively.
   */
  async remove(path: string): Promise<void> {
    try {
      await rm(path, { recursive: true, force: true });
    } catch {
      // Silently fail to match existing behavior
    }
  }

  /**
   * Renames/moves a file or directory.
   */
  async rename(oldPath: string, newPath: string): Promise<void> {
    try {
      await rename(oldPath, newPath);
    } catch {
      // Silently fail
    }
  }

  /**
   * Placeholder for file watching functionality.
   */
  watch(path: string): string {
    return path;
  }

  /**
   * Retrieves the current focused window.
   */
  private win(): BrowserWindow | null {
    return (
      BrowserWindow.getFocusedWindow() ||
      BrowserWindow.getAllWindows()[0] ||
      null
    );
  }

  /**
   * Opens a native directory selection dialog.
   */
  openDialog(): string | null {
    const r = dialog.showOpenDialogSync(this.win() ?? undefined, {
      properties: ["openDirectory", "createDirectory"],
    });
    if (Array.isArray(r) && r.length) {
      return r[0];
    }
    return null;
  }

  /**
   * Opens a native file save dialog.
   */
  saveDialog(defaultName?: string): string | null {
    const r = dialog.showSaveDialogSync(this.win() ?? undefined, {
      defaultPath: defaultName ?? "",
    });

    if (typeof r === "string") return r;
    const result = r as SaveDialogReturnValue | undefined;
    if (result && !result.canceled) return result.filePath;
    return null;
  }

}


