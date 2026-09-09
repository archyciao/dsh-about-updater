import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import z from "@deepseek-ai/schemastery";
import { settingsNamespace } from "@deepseek-ai/dsh-settings";

const require = createRequire(import.meta.url);

const UPSTREAM = "@deepseek-ai/dsh";
const NAMESPACE = "about-updater";
const DEFAULT_PORT = 31201;
const UI_PORT = 3080;
const REGISTRY_URL = `https://registry.npmjs.org/${UPSTREAM}/latest`;
const RELEASES_URL = "https://api.github.com/repos/deepseek-ai/deepseek-harness/releases?per_page=10";
const UPDATE_LOG = join(tmpdir(), "opencode", "dsh-update.log");

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

async function fetchChangelog(version) {
  try {
    const response = await fetch(RELEASES_URL, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "dsh-about-updater" },
      signal: AbortSignal.timeout(6000)
    });
    if (!response.ok) return "";
    const releases = await response.json();
    if (!Array.isArray(releases)) return "";
    const exact = releases.find((r) => r?.tag_name === version || r?.tag_name === `v${version}`);
    const release = exact ?? releases[0];
    return typeof release?.body === "string" ? release.body : "";
  } catch {
    return "";
  }
}

function downloadUpdate() {
  return new Promise((resolve) => {
    const dir = mkdtempSync(join(tmpdir(), "dsh-update-"));
    const command = process.platform === "win32" ? "npm.cmd" : "npm";
    let child;
    try {
      child = spawn(command, ["pack", `${UPSTREAM}@latest`, "--pack-destination", dir], {
        shell: process.platform === "win32",
        windowsHide: true
      });
    } catch (error) {
      resolve({ ok: false, code: -1, output: String(error), tarball: null });
      return;
    }
    let output = "";
    child.stdout?.on("data", (chunk) => { output += String(chunk); });
    child.stderr?.on("data", (chunk) => { output += String(chunk); });
    child.on("close", (code) => {
      const match = output.match(/([\w@.\-]+\.tgz)/);
      const tarball = match ? join(dir, match[1]) : null;
      resolve({ ok: code === 0 && Boolean(tarball), code, output: output.slice(-4000), tarball });
    });
    child.on("error", (error) => {
      resolve({ ok: false, code: -1, output: String(error), tarball: null });
    });
  });
}

function spawnRestartHelper(tarball) {
  const nodePath = process.execPath;
  const binJs = require.resolve(`${UPSTREAM}/lib/bin.js`);
  const installStep = tarball ? `
      const npm = process.platform === "win32" ? "npm.cmd" : "npm";
      log("[install] npm install -g " + ${JSON.stringify(tarball)});
      let npmChild;
      try {
        npmChild = spawn(npm, ["install", "-g", ${JSON.stringify(tarball)}], { shell: process.platform === "win32", windowsHide: true });
      } catch (e) {
        log("[install] spawn error: " + String(e));
        return;
      }
      const out = await new Promise((resolve) => {
        let buf = "";
        npmChild.stdout?.on("data", (c) => buf += String(c));
        npmChild.stderr?.on("data", (c) => buf += String(c));
        npmChild.on("close", (code) => resolve({ code, buf }));
        npmChild.on("error", (e) => resolve({ code: -1, buf: String(e) }));
      });
      log("[install] exit=" + out.code + "\\n" + out.buf.slice(-2000));
      if (out.code !== 0) return;
  ` : "";
  const helper = `
    const { spawn, execFileSync } = require("child_process");
    const { appendFileSync } = require("fs");
    const log = (msg) => appendFileSync(${JSON.stringify(UPDATE_LOG)}, msg + "\\n");
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    (async () => {
      log("[restart] waiting for dsh to exit");
      await wait(2500);
      ${installStep}
      const deadline = Date.now() + 120000;
      const free = () => {
        try {
          const r = execFileSync("netstat", ["-ano", "-p", "tcp"], { encoding: "utf8" });
          return !r.split(/\\r?\\n/).some((l) =>
            /:${UI_PORT}\\s/.test(l) && /TIME_WAIT|LISTENING|ESTABLISHED|CLOSE_WAIT/.test(l)
          );
        } catch { return false; }
      };
      while (!free() && Date.now() < deadline) await wait(2000);
      log("[restart] starting dsh");
      const child = spawn(${JSON.stringify(nodePath)}, [${JSON.stringify(binJs)}, "web"], {
        detached: true,
        stdio: "ignore",
        windowsHide: true
      });
      child.unref();
    })();
  `;
  const child = spawn(nodePath, ["-e", helper], {
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });
  child.unref();
  setTimeout(() => process.exit(0), 800);
}

export const name = "about-updater";
export const inject = ["settings"];

export function apply(ctx) {
  ctx.inject(["settings"], (settingsCtx) => {
    const scope = settingsCtx.settings.register(
      settingsNamespace(NAMESPACE),
      z.object({ port: z.number().default(DEFAULT_PORT) })
    );
    let tarballPath = "";
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
      if (req.method === "OPTIONS") return send(res, 204, {});
      if (req.method === "GET" && url.pathname === "/check") {
        checkLatest()
          .then(async (info) => {
            const latest = info.ok ? info.latest : null;
            const hasUpdate = Boolean(latest && currentVersion && latest !== currentVersion);
            const changelog = info.ok && hasUpdate ? await fetchChangelog(latest) : "";
            send(res, 200, {
              ok: true,
              current: currentVersion,
              latest,
              hasUpdate,
              changelog,
              error: info.ok ? null : info.error
            });
          })
          .catch((error) => send(res, 500, { ok: false, error: String(error) }));
        return;
      }
      if (req.method === "POST" && url.pathname === "/update") {
        downloadUpdate().then((result) => {
          if (result.ok && result.tarball) tarballPath = result.tarball;
          send(res, result.ok ? 200 : 500, result);
        });
        return;
      }
      if (req.method === "POST" && url.pathname === "/install") {
        if (!tarballPath) return send(res, 400, { ok: false, error: "no downloaded tarball" });
        spawnRestartHelper(tarballPath);
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