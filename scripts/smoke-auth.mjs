#!/usr/bin/env node

import {
  CookieJar,
  assert,
  buildRegisterPayload,
  configureSmokeDatabaseEnv,
  expectArray,
  expectErrorEnvelope,
  expectNumber,
  expectObject,
  expectOkEnvelope,
  expectString,
  getSmokeAuthCredentials,
  installSmokeSignalHandlers,
  isObject,
  requestJson,
  resolveBaseUrl,
  stopSpawnedServer,
} from "./smoke-support.mjs";

function logOk(name) {
  console.log(`[ok] ${name}`);
}

function expectUnauthenticated(body, label) {
  expectObject(body, label);
  assert(body.ok === false, `${label} should return ok: false.`);
  expectObject(body.error, `${label}.error`);
  assert(
    body.error.code === "UNAUTHENTICATED" ||
      body.error.code === "SESSION_EXPIRED",
    `${label} should return UNAUTHENTICATED or SESSION_EXPIRED, got ${String(
      body.error.code,
    )}.`,
  );
}

function expectSafeUser(user, label) {
  expectObject(user, label);
  expectNumber(user.id, `${label}.id`);
  expectString(user.displayName, `${label}.displayName`);
  expectString(user.role, `${label}.role`);
  expectString(user.createdAt, `${label}.createdAt`);
  assert(user.role === "owner", `${label}.role should be owner.`);
  assert(
    user.email === null || typeof user.email === "string",
    `${label}.email should be string or null.`,
  );
  assert(
    user.phone === null || typeof user.phone === "string",
    `${label}.phone should be string or null.`,
  );
  assert(
    user.lastLoginAt === null || typeof user.lastLoginAt === "string",
    `${label}.lastLoginAt should be string or null.`,
  );

  for (const unsafeKey of [
    "password",
    "passwordHash",
    "passwordSalt",
    "passwordParamsJson",
    "token",
    "tokenHash",
    "session",
  ]) {
    assert(
      !(unsafeKey in user),
      `${label} should not expose ${unsafeKey}.`,
    );
  }
}

function wrongPasswordFor(password) {
  const wrongPassword = "DefinitelyWrong!2026";

  return password === wrongPassword ? "DefinitelyWrong!2027" : wrongPassword;
}

async function runAuthSmoke(baseUrl) {
  const credentials = getSmokeAuthCredentials();
  const registerPayload = buildRegisterPayload(credentials);

  const firstRegister = await requestJson(baseUrl, {
    body: registerPayload,
    method: "POST",
    path: "/api/auth/register",
  });

  if (firstRegister.status === 201) {
    expectOkEnvelope(firstRegister.body, "first owner register");
    expectSafeUser(firstRegister.body.user, "first owner register.user");
    logOk("register first local owner");
  } else if (firstRegister.status === 409) {
    expectErrorEnvelope(
      firstRegister.body,
      "OWNER_ALREADY_EXISTS",
      "existing owner register guard",
    );
    logOk("detected existing owner and switched to login path");
  } else {
    throw new Error(
      `first owner register expected HTTP 201 or 409, got ${firstRegister.status}.`,
    );
  }

  const duplicateRegister = await requestJson(baseUrl, {
    body: registerPayload,
    method: "POST",
    path: "/api/auth/register",
  });

  assert(
    duplicateRegister.status === 409,
    `duplicate owner register expected HTTP 409, got ${duplicateRegister.status}.`,
  );
  expectErrorEnvelope(
    duplicateRegister.body,
    "OWNER_ALREADY_EXISTS",
    "duplicate owner register",
  );
  logOk("duplicate owner register returns OWNER_ALREADY_EXISTS");

  const wrongPasswordLogin = await requestJson(baseUrl, {
    body: {
      identifier: credentials.identifier,
      password: wrongPasswordFor(credentials.password),
    },
    method: "POST",
    path: "/api/auth/login",
  });

  assert(
    wrongPasswordLogin.status === 401,
    `wrong password login expected HTTP 401, got ${wrongPasswordLogin.status}.`,
  );
  expectErrorEnvelope(
    wrongPasswordLogin.body,
    "INVALID_CREDENTIALS",
    "wrong password login",
  );
  logOk("wrong password login fails");

  const jar = new CookieJar();
  const correctLogin = await requestJson(baseUrl, {
    body: {
      identifier: credentials.identifier,
      password: credentials.password,
    },
    jar,
    method: "POST",
    path: "/api/auth/login",
  });

  if (correctLogin.status !== 200) {
    const code =
      isObject(correctLogin.body) && isObject(correctLogin.body.error)
        ? String(correctLogin.body.error.code)
        : "UNKNOWN";
    const ownerMessage =
      firstRegister.status === 409 && !credentials.hasExplicitCredentials
        ? "A local owner already exists, but the default smoke credentials could not log in. Set SMOKE_AUTH_IDENTIFIER and SMOKE_AUTH_PASSWORD for the existing owner, or run auth smoke against a separate test database/checkout. The script did not clear, delete, or rebuild data/new-era.db."
        : "Auth smoke could not log in with the configured credentials.";

    throw new Error(`${ownerMessage} Login status ${correctLogin.status}, code ${code}.`);
  }

  expectOkEnvelope(correctLogin.body, "correct password login");
  expectSafeUser(correctLogin.body.user, "correct password login.user");
  logOk("correct password login succeeds");

  const currentUser = await requestJson(baseUrl, {
    jar,
    path: "/api/auth/me",
  });

  assert(
    currentUser.status === 200,
    `/api/auth/me after login expected HTTP 200, got ${currentUser.status}.`,
  );
  expectOkEnvelope(currentUser.body, "auth me after login");
  expectSafeUser(currentUser.body.user, "auth me after login.user");
  logOk("/api/auth/me returns safe current user fields");

  const unauthenticatedApplications = await requestJson(baseUrl, {
    path: "/api/applications?limit=1",
  });

  assert(
    unauthenticatedApplications.status === 401,
    `unauthenticated protected API expected HTTP 401, got ${unauthenticatedApplications.status}.`,
  );
  expectUnauthenticated(
    unauthenticatedApplications.body,
    "unauthenticated protected API",
  );
  logOk("unauthenticated protected API returns 401");

  const authenticatedApplications = await requestJson(baseUrl, {
    jar,
    path: "/api/applications?limit=1",
  });

  assert(
    authenticatedApplications.status === 200,
    `authenticated protected API expected HTTP 200, got ${authenticatedApplications.status}.`,
  );
  expectOkEnvelope(authenticatedApplications.body, "authenticated protected API");
  expectArray(
    authenticatedApplications.body.applications,
    "authenticated protected API.applications",
  );
  expectNumber(
    authenticatedApplications.body.count,
    "authenticated protected API.count",
  );
  assert(
    authenticatedApplications.body.limit === 1,
    "authenticated protected API.limit should echo 1.",
  );
  logOk("authenticated protected API succeeds");

  const logout = await requestJson(baseUrl, {
    jar,
    method: "POST",
    path: "/api/auth/logout",
  });

  assert(logout.status === 200, `logout expected HTTP 200, got ${logout.status}.`);
  expectOkEnvelope(logout.body, "auth logout");
  assert(logout.body.loggedOut === true, "auth logout should return loggedOut: true.");
  logOk("logout succeeds");

  const afterLogout = await requestJson(baseUrl, {
    jar,
    path: "/api/auth/me",
  });

  assert(
    afterLogout.status === 401,
    `/api/auth/me after logout expected HTTP 401, got ${afterLogout.status}.`,
  );
  expectUnauthenticated(afterLogout.body, "auth me after logout");
  logOk("/api/auth/me after logout returns 401");
}

installSmokeSignalHandlers();

try {
  const smokeDatabase = configureSmokeDatabaseEnv();
  const { baseUrl, mode } = await resolveBaseUrl();

  console.log(`New Era auth smoke against ${baseUrl} (${mode})`);
  console.log(
    `Smoke database: ${smokeDatabase.description}${
      smokeDatabase.path ? ` (${smokeDatabase.path})` : ""
    }`,
  );
  await runAuthSmoke(baseUrl);
  console.log("Auth smoke complete: 9/9 scenarios passed.");
} catch (error) {
  console.error(`[fail] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await stopSpawnedServer();
}
