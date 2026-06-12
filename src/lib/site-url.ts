const DEFAULT_SITE_URL = "https://neweracareer.cn";

export function getSiteUrl(): URL {
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();

  try {
    return new URL(configuredUrl || DEFAULT_SITE_URL);
  } catch {
    return new URL(DEFAULT_SITE_URL);
  }
}

export function getSiteUrlString(): string {
  return getSiteUrl().toString().replace(/\/+$/, "");
}
