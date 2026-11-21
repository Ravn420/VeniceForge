import { BrowserWindow, shell } from "electron";
export class BrowserAutomation {
  private win: BrowserWindow | null = null;
  async open(url: string): Promise<void> {
    const host = new URL(url).hostname || "";
    if (/(^|\.)venice\.ai$/i.test(host)) {
      await shell.openExternal(url);
      return;
    }
    if (this.win && !this.win.isDestroyed()) {
      await this.win.loadURL(url).catch(() => undefined); // redirects (e.g. venice.ai → /login) report ERR_ABORTED
      return;
    }
    this.win = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, allowRunningInsecureContent: false }
    });
    await this.win.loadURL(url).catch(() => undefined);
  }
  async screenshot(): Promise<string> {
    if (!this.win || this.win.isDestroyed()) throw new Error("Browser not open");
    return this.win.webContents.capturePage().then((img: any) => img.toDataURL());
  }
  async click(selector: string): Promise<void> {
    if (!this.win || this.win.isDestroyed()) throw new Error("Browser not open");
    await this.win.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(selector)})?.click()`);
  }
  async type(selector: string, text: string): Promise<void> {
    if (!this.win || this.win.isDestroyed()) throw new Error("Browser not open");
    await this.win.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(selector)})?.value = ${JSON.stringify(text)}`);
  }
  async evaluate(expr: string): Promise<any> {
    if (!this.win || this.win.isDestroyed()) throw new Error("Browser not open");
    return this.win.webContents.executeJavaScript(expr);
  }
  async navigate(url: string): Promise<void> { await this.open(url); }
  async getTitle(): Promise<string> {
    if (!this.win || this.win.isDestroyed()) throw new Error("Browser not open");
    return this.win.getTitle();
  }
  close(): void { if (this.win && !this.win.isDestroyed()) this.win.close(); }
}