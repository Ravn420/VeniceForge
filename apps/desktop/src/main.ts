import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import { registerIpcHandlers } from "./ipc.js";
import { SubagentManager } from "./subagents.js";
import { BrowserAutomation } from "./browser.js";
import { FileTools } from "./file-tools.js";
import { TerminalManager } from "./terminal.js";
import { VeniceBridge } from "./venice-bridge.js";

let mainWindow: BrowserWindow | null = null;

const subagents = new SubagentManager();
const browser = new BrowserAutomation();
const files = new FileTools();
const terminals = new TerminalManager();
const venice = new VeniceBridge();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1100,
    minHeight: 640,
    title: "Venice Forge",
    backgroundColor: "#0b0f19",
    titleBarStyle: "hiddenInset",
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      webviewTag: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) mainWindow.loadURL(devUrl);
  else mainWindow.loadFile(join(__dirname, "renderer", "index.html"));

  mainWindow.on("closed", () => { mainWindow = null; });
}

app.whenReady().then(() => {
  registerIpcHandlers(ipcMain, { subagents, browser, files, terminals, venice });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  subagents.stopAll();
  browser.close();
  terminals.closeAll();
  if (process.platform !== "darwin") app.quit();
});
