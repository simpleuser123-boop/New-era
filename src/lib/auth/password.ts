import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

import type { PasswordHashParams, PasswordHashResult } from "./types";

const DEFAULT_SCRYPT_PARAMS = {
  algorithm: "scrypt",
  keyLength: 64,
  N: 16_384,
  p: 1,
  r: 8,
  saltBytes: 16,
} as const satisfies PasswordHashParams;

const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;

export function hashPassword(password: string): PasswordHashResult {
  const salt = randomBytes(DEFAULT_SCRYPT_PARAMS.saltBytes).toString("base64url");
  const hash = runScrypt(password, salt, DEFAULT_SCRYPT_PARAMS).toString("base64url");

  return {
    passwordHash: hash,
    passwordParamsJson: JSON.stringify(DEFAULT_SCRYPT_PARAMS),
    passwordSalt: salt,
  };
}

export function verifyPassword(
  password: string,
  passwordHash: string,
  passwordSalt: string,
  passwordParamsJson: string,
): boolean {
  let params: PasswordHashParams;

  try {
    params = parsePasswordParams(passwordParamsJson);
  } catch {
    return false;
  }

  const expected = Buffer.from(passwordHash, "base64url");
  const actual = runScrypt(password, passwordSalt, params);

  if (expected.length !== actual.length) {
    return false;
  }

  return timingSafeEqual(expected, actual);
}

function runScrypt(
  password: string,
  salt: string,
  params: PasswordHashParams,
): Buffer {
  return scryptSync(password, salt, params.keyLength, {
    N: params.N,
    maxmem: SCRYPT_MAX_MEMORY,
    p: params.p,
    r: params.r,
  });
}

function parsePasswordParams(raw: string): PasswordHashParams {
  const parsed = JSON.parse(raw) as Partial<PasswordHashParams>;

  if (
    parsed.algorithm !== "scrypt" ||
    !isPositiveInteger(parsed.keyLength) ||
    !isPositiveInteger(parsed.N) ||
    !isPositiveInteger(parsed.p) ||
    !isPositiveInteger(parsed.r) ||
    !isPositiveInteger(parsed.saltBytes)
  ) {
    throw new Error("Invalid password hash params.");
  }

  return {
    algorithm: "scrypt",
    keyLength: parsed.keyLength,
    N: parsed.N,
    p: parsed.p,
    r: parsed.r,
    saltBytes: parsed.saltBytes,
  };
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}
