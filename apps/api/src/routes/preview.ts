import { request as httpRequest } from "node:http";
import type { ServerResponse } from "node:http";

export type PortMap = Map<string, Set<number>>;

export function createPortMap(): PortMap {
  return new Map<string, Set<number>>();
}

export function registerPort(map: PortMap, projectId: string, port: number): void {
  if (!Number.isInteger(port) || port < 1 || port > 65535) return;
  let set = map.get(projectId);
  if (!set) {
    set = new Set<number>();
    map.set(projectId, set);
  }
  set.add(port);
}

export function portsFromSs(map: PortMap, projectId: string): number[] {
  return [...(map.get(projectId) ?? [])].sort((a, b) => a - b);
}

export function proxy(port: number, targetPath: string, basePrefix: string, res: ServerResponse): void {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ code: "E_BAD_REQUEST", message: "Invalid port" }));
    return;
  }

  const normalizedPath = targetPath.startsWith("/") ? targetPath : `/${targetPath}`;
  const prefix = basePrefix.endsWith("/") ? basePrefix.slice(0, -1) : basePrefix;

  const upstream = httpRequest(
    {
      hostname: "127.0.0.1",
      port,
      path: normalizedPath,
      method: "GET",
      headers: {
        host: `127.0.0.1:${port}`,
        "x-forwarded-prefix": prefix
      }
    },
    (upRes) => {
      const headers: Record<string, string | string[] | undefined> = { ...upRes.headers };
      if (typeof headers.location === "string" && headers.location.startsWith("/")) {
        headers.location = `${prefix}${headers.location}`;
      }
      res.writeHead(upRes.statusCode ?? 502, headers);
      upRes.pipe(res);
    }
  );

  upstream.on("error", (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { "content-type": "application/json" });
    }
    res.end(JSON.stringify({ code: "E_BAD_GATEWAY", message: err.message }));
  });

  upstream.end();
}
