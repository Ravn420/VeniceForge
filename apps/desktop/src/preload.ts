import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("forge", {
  files: {
    read: (path: string) => ipcRenderer.invoke("files:read", path),
    write: (path: string, content: string) => ipcRenderer.invoke("files:write", path, content),
    list: (dir: string) => ipcRenderer.invoke("files:list", dir),
    tree: (dir: string) => ipcRenderer.invoke("files:tree", dir),
    exists: (path: string) => ipcRenderer.invoke("files:exists", path),
    mkdir: (path: string) => ipcRenderer.invoke("files:mkdir", path),
    remove: (path: string) => ipcRenderer.invoke("files:remove", path),
    rename: (oldPath: string, newPath: string) => ipcRenderer.invoke("files:rename", oldPath, newPath),
    watch: (path: string) => ipcRenderer.invoke("files:watch", path),
    openDialog: () => ipcRenderer.invoke("files:openDialog"),
    saveDialog: (defaultName?: string) => ipcRenderer.invoke("files:saveDialog", defaultName),
  },
  terminal: {
    create: (cwd: string) => ipcRenderer.invoke("terminal:create", cwd),
    write: (id: string, data: string) => ipcRenderer.invoke("terminal:write", id, data),
    resize: (id: string, cols: number, rows: number) => ipcRenderer.invoke("terminal:resize", id, cols, rows),
    kill: (id: string) => ipcRenderer.invoke("terminal:kill", id),
    getData: (id: string) => ipcRenderer.invoke("terminal:getData", id),
    onData: (id: string, cb: (data: string) => void) => {
      ipcRenderer.on(`terminal:data:${id}`, (_e, data: string) => cb(data));
    },
    onExit: (id: string, cb: (code: number | null) => void) => {
      ipcRenderer.on(`terminal:exit:${id}`, (_e, code: number | null) => cb(code));
    },
  },
  browser: {
    open: (url: string) => ipcRenderer.invoke("browser:open", url),
    screenshot: () => ipcRenderer.invoke("browser:screenshot"),
    click: (selector: string) => ipcRenderer.invoke("browser:click", selector),
    type: (selector: string, text: string) => ipcRenderer.invoke("browser:type", selector, text),
    evaluate: (expr: string) => ipcRenderer.invoke("browser:evaluate", expr),
    navigate: (url: string) => ipcRenderer.invoke("browser:navigate", url),
    getTitle: () => ipcRenderer.invoke("browser:getTitle"),
    close: () => ipcRenderer.invoke("browser:close"),
  },
  subagents: {
    spawn: (goal: string, model: string, context?: string) =>
      ipcRenderer.invoke("subagents:spawn", goal, model, context),
    list: () => ipcRenderer.invoke("subagents:list"),
    stop: (id: string) => ipcRenderer.invoke("subagents:stop", id),
    steer: (id: string, message: string) => ipcRenderer.invoke("subagents:steer", id, message),
    onResult: (cb: (id: string, summary: string) => void) => {
      ipcRenderer.on("subagents:result", (_e, id: string, summary: string) => cb(id, summary));
    },
  },
  git: {
    status: (root: string) => ipcRenderer.invoke("git:status", root),
    diff: (root: string) => ipcRenderer.invoke("git:diff", root),
    commit: (root: string, message: string) => ipcRenderer.invoke("git:commit", root, message),
    log: (root: string, count?: number) => ipcRenderer.invoke("git:log", root, count),
    branch: (root: string) => ipcRenderer.invoke("git:branch", root),
    checkout: (root: string, ref: string) => ipcRenderer.invoke("git:checkout", root, ref),
    init: (root: string) => ipcRenderer.invoke("git:init", root),
  },
  venice: {
    /** Full Venice.ai web-app model catalog. */
    models: () => ipcRenderer.invoke("venice:models"),
    /** Chat-relevant models for AI Dev Studio dropdowns (no image/video). */
    chatModels: () => ipcRenderer.invoke("venice:chatModels"),
    /** URL of the venice.ai surface for a model (chat/image/video/audio studio). */
    surfaceUrl: (modelOrSurface: string) => ipcRenderer.invoke("venice:surfaceUrl", modelOrSurface),
    /** Deep link handing a task to the Venice.ai chat web app. */
    chatLink: (task: string, model?: string) => ipcRenderer.invoke("venice:chatLink", task, model),
    /** Process a completion task in-app using Venice.ai web-app models (no HTTP API). */
    processCompletion: (task: string, model?: string) => ipcRenderer.invoke("venice:processCompletion", task, model),
    /** Import venice.ai cookies from installed browsers → SSO login. */
    importCookies: () => ipcRenderer.invoke("venice:importCookies"),
    /** Current venice.ai login state inside the app's persisted session. */
    loginState: () => ipcRenderer.invoke("venice:loginState"),
  },
  shell: {
    exec: (argv: string[], cwd: string) => ipcRenderer.invoke("shell:exec", argv, cwd),
    which: (bin: string) => ipcRenderer.invoke("shell:which", bin),
  },
});
