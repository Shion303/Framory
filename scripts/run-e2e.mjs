import { spawn, spawnSync } from "node:child_process";

const port = 3000;
const url = `http://127.0.0.1:${port}`;

const e2eEnv = {
  ...process.env,
  FRAMORY_STORAGE: "file",
  FRAMORY_DATA_FILE: ".framory/e2e-data.json",
  FRAMORY_ALLOW_TEST_RESET: "1",
  FRAMORY_OWNER_EMAIL: "owner@framory.test",
  FRAMORY_OWNER_USERNAME: "owner",
  FRAMORY_OWNER_PASSWORD: "OwnerPassword123!",
  FRAMORY_OWNER_DISPLAY_NAME: "Owner Framory",
  FRAMORY_SESSION_SECRET: "e2e-session-secret",
  FRAMORY_DISABLE_ANILIST_AUTO_IMPORT: "1",
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/framory?schema=public",
  PLAYWRIGHT_SKIP_WEBSERVER: "1"
};

async function isReady() {
  try {
    const response = await fetch(url, { cache: "no-store" });
    return response.ok || response.status < 500;
  } catch {
    return false;
  }
}

async function waitForServer() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 120000) {
    if (await isReady()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Il server Next non ha risposto entro 120 secondi.");
}

function stopServer(server) {
  if (!server || server.killed || server.exitCode !== null) {
    return;
  }
  if (process.platform === "win32" && server.pid) {
    spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  server.kill("SIGTERM");
}

const alreadyRunning = await isReady();
const server = alreadyRunning
  ? null
  : spawn(
      process.execPath,
      ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(port)],
      {
        env: e2eEnv,
        stdio: ["ignore", "pipe", "pipe"]
      }
    );

let exitCode = 1;

try {
  if (server) {
    server.stdout.on("data", () => undefined);
    server.stderr.on("data", (chunk) => {
      const text = String(chunk);
      if (/error|failed|EADDRINUSE/i.test(text)) {
        process.stderr.write(text);
      }
    });
    await waitForServer();
  }

  const result = spawnSync(process.execPath, ["node_modules/playwright/cli.js", "test"], {
    env: e2eEnv,
    stdio: "inherit"
  });
  exitCode = result.status ?? 1;
} finally {
  stopServer(server);
}

process.exit(exitCode);
