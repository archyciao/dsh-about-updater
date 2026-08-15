import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import z from "@deepseek-ai/schemastery";
import { settingsNamespace } from "@deepseek-ai/dsh-settings";

const require = createRequire(import.meta.url);

const UPSTREAM = "@deepseek-ai/dsh";
const NAMESPACE = "about-updater";
const DEFAULT_PORT = 31201;
const REGISTRY_URL = `https://registry.npmjs.org/${UPSTREAM}/latest`;

let currentVersion = "";
try {
  currentVersion = require(`${UPSTREAM}/package.json`).version;
} catch {}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json"
};

function send(res, status, body) {
  res.writeHead(status, corsHeaders);
  res.end(JSON.stringify(body));
}

async function checkLatest() {
  try {
    const response = await fetch(REGISTRY_URL, { headers: { Accept: "application/json" } });
    if (!response.ok) return { ok: false, error: `registry HTTP ${response.status}` };
    const data = await response.json();
    return { ok: true, latest: data.version };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
}

function runUpdate() {
  return new Promise((resolve) => {
    const command = process.platform === "win32" ? "npm.cmd" : "npm";
    const child = spawn(command, ["install", "-g", `${UPSTREAM}@latest`], {
      windowsHide: true
    });
    let output = "";
    child.stdout?.on("data", (chunk) => { output += String(chunk); });
    child.stderr?.on("data", (chunk) => { output += String(chunk); });
    child.on("close", (code) => {
      resolve({ ok: code === 0, code, output: output.slice(-4000) });
    });
    child.on("error", (error) => {
      resolve({ ok: false, code: -1, output: String(error) });
    });
  });
}

function scheduleRestart() {
  const nodePath = process.execPath;
  const binJs = require.resolve(`${UPSTREAM}/lib/bin.js`);
  const helper = `
    setTimeout(() => {
      const { spawn } = require("child_process");
      const child = spawn(${JSON.stringify(nodePath)}, [${JSON.stringify(binJs)}, "web"], {
        detached: true,
        stdio: "ignore",
        windowsHide: true
      });
      child.unref();
    }, 4000);
  `;
  const child = spawn(nodePath, ["-e", helper], {
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });
  child.unref();
  setTimeout(() => process.exit(0), 600);
}

export const name = "about-updater";
export const inject = ["settings"];

export function apply(ctx) {
  ctx.inject(["settings"], (settingsCtx) => {
    const scope = settingsCtx.settings.register(
      settingsNamespace(NAMESPACE),
      z.object({ port: z.number().default(DEFAULT_PORT) })
    );
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
      if (req.method === "OPTIONS") return send(res, 204, {});
      if (req.method === "GET" && url.pathname === "/check") {
        checkLatest()
          .then((info) => {
            const latest = info.ok ? info.latest : null;
            const hasUpdate = Boolean(latest && currentVersion && latest !== currentVersion);
            send(res, 200, {
              ok: true,
              current: currentVersion,
              latest,
              hasUpdate,
              error: info.ok ? null : info.error
            });
          })
          .catch((error) => send(res, 500, { ok: false, error: String(error) }));
        return;
      }
      if (req.method === "POST" && url.pathname === "/update") {
        runUpdate().then((result) => send(res, result.ok ? 200 : 500, result));
        return;
      }
      if (req.method === "POST" && url.pathname === "/restart") {
        scheduleRestart();
        send(res, 200, { ok: true });
        return;
      }
      send(res, 404, { ok: false, error: "not found" });
    });
    const tryListen = (port) =>
      new Promise((resolve, reject) => {
        const onError = (error) => {
          server.removeListener("listening", onListening);
          reject(error);
        };
        const onListening = () => {
          server.removeListener("error", onError);
          resolve(port);
        };
        server.once("error", onError);
        server.once("listening", onListening);
        server.listen(port, "127.0.0.1");
      });
    (async () => {
      for (let port = DEFAULT_PORT; port < DEFAULT_PORT + 20; port += 1) {
        try {
          await tryListen(port);
          await scope.update({ port });
          ctx.logger?.info?.(`[about-updater] update server listening on http://127.0.0.1:${port}`);
          return;
        } catch (error) {
          if (error?.code !== "EADDRINUSE") throw error;
        }
      }
      ctx.logger?.warn?.("[about-updater] no free port found; update server not started");
    })();
    ctx.effect(() => () => server.close());
  });
}