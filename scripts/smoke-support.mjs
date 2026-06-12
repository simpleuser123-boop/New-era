import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const rootDir = path.resolve(__dirname, "..");
export const defaultHost = "127.0.0.1";
export const defaultExistingBaseUrl = "http://127.0.0.1:3000";
export const defaultStartPort = 3110;
export const authSessionCookieName = "new_era_session";
export const newEraDbPathEnvName = "NEW_ERA_DB_PATH";
export const smokeUseRealDbEnvName = "SMOKE_USE_REAL_DB";

export const requestTimeoutMs = readPositiveIntegerEnv(
  "SMOKE_REQUEST_TIMEOUT_MS",
  10_000,
);
export const serverWaitMs = readPositiveIntegerEnv("SMOKE_WAIT_MS", 45_000);

let spawnedServer = null;

export function configureSmokeDatabaseEnv() {
  if (process.env.SMOKE_BASE_URL) {
    return {
      description: "external server selected by SMOKE_BASE_URL",
      path: process.env[newEraDbPathEnvName] ?? null,
    };
  }

  if (process.env[smokeUseRealDbEnvName] === "1") {
    return {
      description: "real project database selected by SMOKE_USE_REAL_DB=1",
      path: null,
    };
  }

  if (process.env[newEraDbPathEnvName]) {
    return {
      description: `${newEraDbPathEnvName} override`,
      path: process.env[newEraDbPathEnvName],
    };
  }

  const smokeDbPath = path.join(rootDir, "data", "smoke-auth", "new-era-smoke.db");
  process.env[newEraDbPathEnvName] = smokeDbPath;

  return {
    description: "isolated smoke database",
    path: smokeDbPath,
  };
}

export function readPositiveIntegerEnv(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? "", 10);

  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, "");
}

export function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function expectObject(value, label) {
  assert(isObject(value), `${label} should be an object.`);
}

export function expectArray(value, label) {
  assert(Array.isArray(value), `${label} should be an array.`);
}

export function expectNumber(value, label) {
  assert(
    typeof value === "number" && Number.isFinite(value),
    `${label} should be a number.`,
  );
}

export function expectString(value, label) {
  assert(
    typeof value === "string" && value.length > 0,
    `${label} should be a non-empty string.`,
  );
}

export function expectOkEnvelope(body, label) {
  expectObject(body, label);
  assert(body.ok === true, `${label} should return ok: true.`);
}

export function expectErrorEnvelope(body, code, label) {
  expectObject(body, label);
  assert(body.ok === false, `${label} should return ok: false.`);
  expectObject(body.error, `${label}.error`);
  assert(
    body.error.code === code,
    `${label} should return error code ${code}, got ${String(body.error.code)}.`,
  );
}

export class CookieJar {
  #cookies = new Map();

  header() {
    return Array.from(this.#cookies.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }

  applyFromHeaders(headers) {
    for (const cookieHeader of getSetCookieHeaders(headers)) {
      const [nameValue, ...attributes] = cookieHeader.split(";");
      const [rawName, ...rawValueParts] = nameValue.split("=");
      const name = rawName?.trim();

      if (!name) {
        continue;
      }

      const value = rawValueParts.join("=");
      const lowerAttributes = attributes.map((attribute) =>
        attribute.trim().toLowerCase(),
      );
      const shouldDelete =
        value.length === 0 ||
        lowerAttributes.includes("max-age=0") ||
        lowerAttributes.some((attribute) =>
          attribute.startsWith("expires=thu, 01 jan 1970"),
        );

      if (shouldDelete) {
        this.#cookies.delete(name);
        continue;
      }

      this.#cookies.set(name, value);
    }
  }
}

function getSetCookieHeaders(headers) {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }

  const raw = headers.get("set-cookie");

  if (!raw) {
    return [];
  }

  return raw.split(/,(?=\s*[^;,=\s]+=[^;,]+)/).map((item) => item.trim());
}

export async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function requestJson(baseUrl, check) {
  const jar = check.jar;
  const cookieHeader = jar?.header();
  const headers = {
    Accept: "application/json",
    ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    ...(check.headers ?? {}),
  };
  const hasBody = check.body !== undefined;
  const response = await fetchWithTimeout(`${baseUrl}${check.path}`, {
    method: check.method ?? "GET",
    headers: hasBody
      ? {
          ...headers,
          "Content-Type": "application/json",
        }
      : headers,
    body: hasBody ? JSON.stringify(check.body) : undefined,
  });

  jar?.applyFromHeaders(response.headers);

  let body;

  try {
    body = await response.json();
  } catch (error) {
    throw new Error(
      `Expected JSON from ${check.path}, got status ${response.status}: ${error.message}`,
    );
  }

  return {
    body,
    headers: response.headers,
    status: response.status,
  };
}

async function healthResponds(baseUrl) {
  try {
    const response = await requestJson(baseUrl, {
      path: "/api/health",
    });

    return response.status === 200 && response.body.ok === true;
  } catch {
    return false;
  }
}

async function findAvailablePort(startPort) {
  const maxAttempts = 40;

  for (let offset = 0; offset < maxAttempts; offset += 1) {
    const port = startPort + offset;

    if (await isPortOccupied(port)) {
      continue;
    }

    const available = await new Promise((resolve) => {
      const server = net.createServer();

      server.unref();
      server.once("error", () => {
        resolve(false);
      });
      server.listen(port, defaultHost, () => {
        server.close(() => {
          resolve(true);
        });
      });
    });

    if (available) {
      return port;
    }
  }

  throw new Error(`No available port found from ${startPort}.`);
}

async function isPortOccupied(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({
      host: defaultHost,
      port,
    });

    let settled = false;

    const finish = (value) => {
      if (settled) {
        return;
      }

      settled = true;
      socket.destroy();
      resolve(value);
    };

    socket.setTimeout(250);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

async function waitForServer(baseUrl, child, outputBuffer) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < serverWaitMs) {
    if (child.exitCode !== null) {
      throw new Error(
        `next start exited before smoke checks could run.\n${outputBuffer()}`,
      );
    }

    if (await healthResponds(baseUrl)) {
      return;
    }

    await delay(500);
  }

  throw new Error(
    `Timed out waiting for ${baseUrl}/api/health after ${serverWaitMs}ms.\n${outputBuffer()}`,
  );
}

async function startNextServer() {
  const nextBuildDir = path.join(rootDir, ".next");
  const nextCli = path.join(rootDir, "node_modules", "next", "dist", "bin", "next");

  if (!existsSync(nextBuildDir)) {
    throw new Error(
      "No .next build found. Run npm run build first or set SMOKE_BASE_URL to an existing server.",
    );
  }

  if (!existsSync(nextCli)) {
    throw new Error("Next.js CLI was not found under node_modules.");
  }

  const port = await findAvailablePort(
    readPositiveIntegerEnv("SMOKE_PORT", defaultStartPort),
  );
  const baseUrl = `http://${defaultHost}:${port}`;
  const output = [];
  const child = spawn(
    process.execPath,
    [nextCli, "start", "-H", defaultHost, "-p", String(port)],
    {
      cwd: rootDir,
      env: {
        ...process.env,
        NODE_ENV: "production",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const captureOutput = (chunk) => {
    output.push(chunk.toString());

    while (output.join("").length > 4_000) {
      output.shift();
    }
  };

  child.stdout.on("data", captureOutput);
  child.stderr.on("data", captureOutput);

  spawnedServer = child;
  await waitForServer(baseUrl, child, () => output.join(""));

  return {
    baseUrl,
    mode: "spawned next start",
  };
}

export async function resolveBaseUrl() {
  if (process.env.SMOKE_BASE_URL) {
    return {
      baseUrl: normalizeBaseUrl(process.env.SMOKE_BASE_URL),
      mode: "SMOKE_BASE_URL",
    };
  }

  if (existsSync(path.join(rootDir, ".next"))) {
    return startNextServer();
  }

  if (await healthResponds(defaultExistingBaseUrl)) {
    return {
      baseUrl: defaultExistingBaseUrl,
      mode: "existing local server",
    };
  }

  throw new Error(
    "No .next build or responsive local server found. Run npm run build first, or set SMOKE_BASE_URL.",
  );
}

export async function stopSpawnedServer() {
  if (!spawnedServer || spawnedServer.exitCode !== null) {
    return;
  }

  const child = spawnedServer;
  child.kill("SIGTERM");

  await Promise.race([
    new Promise((resolve) => {
      child.once("exit", resolve);
    }),
    delay(5_000).then(() => {
      if (child.exitCode === null) {
        child.kill("SIGKILL");
      }
    }),
  ]);
}

export async function runCheck(baseUrl, check) {
  const startedAt = Date.now();
  const result = await requestJson(baseUrl, check);

  assert(
    result.status === check.expectedStatus,
    `${check.name} expected HTTP ${check.expectedStatus}, got ${result.status}.`,
  );

  check.expect(result);

  const elapsedMs = Date.now() - startedAt;
  console.log(`[ok] ${check.name} (${elapsedMs}ms)`);
}

export function getSmokeAuthCredentials() {
  const identifier =
    process.env.SMOKE_AUTH_IDENTIFIER ?? "owner.smoke@new-era.local";
  const password = process.env.SMOKE_AUTH_PASSWORD ?? "NewEraSmoke!2026";
  const displayName =
    process.env.SMOKE_AUTH_DISPLAY_NAME ?? "New Era Smoke Owner";

  return {
    displayName,
    hasExplicitCredentials:
      Boolean(process.env.SMOKE_AUTH_IDENTIFIER) &&
      Boolean(process.env.SMOKE_AUTH_PASSWORD),
    identifier,
    password,
  };
}

export function buildRegisterPayload(credentials = getSmokeAuthCredentials()) {
  const account = credentials.identifier.trim();

  return {
    confirmPassword: credentials.password,
    displayName: credentials.displayName,
    password: credentials.password,
    ...(account.includes("@")
      ? { email: account.toLowerCase() }
      : { phone: account }),
  };
}

export async function ensureSmokeOwnerAndLogin(baseUrl) {
  const credentials = getSmokeAuthCredentials();
  const register = await requestJson(baseUrl, {
    body: buildRegisterPayload(credentials),
    method: "POST",
    path: "/api/auth/register",
  });

  if (register.status === 201) {
    expectOkEnvelope(register.body, "auth register");
    expectObject(register.body.user, "auth register.user");
  } else if (register.status === 409) {
    expectErrorEnvelope(register.body, "OWNER_ALREADY_EXISTS", "auth register existing owner");
  } else {
    throw new Error(
      `auth register expected HTTP 201 or 409, got ${register.status}.`,
    );
  }

  const jar = new CookieJar();
  const login = await requestJson(baseUrl, {
    body: {
      identifier: credentials.identifier,
      password: credentials.password,
    },
    jar,
    method: "POST",
    path: "/api/auth/login",
  });

  if (login.status !== 200) {
    const code =
      isObject(login.body) && isObject(login.body.error)
        ? String(login.body.error.code)
        : "UNKNOWN";
    const ownerMessage =
      register.status === 409 && !credentials.hasExplicitCredentials
        ? "A local owner already exists, but the default smoke credentials could not log in. Set SMOKE_AUTH_IDENTIFIER and SMOKE_AUTH_PASSWORD for the existing owner, or run smoke against a separate test database/checkout. The script did not clear, delete, or rebuild data/new-era.db."
        : "Auth smoke could not log in with the configured credentials.";

    throw new Error(`${ownerMessage} Login status ${login.status}, code ${code}.`);
  }

  expectOkEnvelope(login.body, "auth login");
  expectObject(login.body.user, "auth login.user");
  assert(
    jar.header().includes(`${authSessionCookieName}=`),
    "auth login should set the session cookie.",
  );

  return {
    credentials,
    jar,
    ownerWasCreated: register.status === 201,
    registerStatus: register.status,
  };
}

export function installSmokeSignalHandlers() {
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, async () => {
      await stopSpawnedServer();
      process.exit(signal === "SIGINT" ? 130 : 143);
    });
  }
}
