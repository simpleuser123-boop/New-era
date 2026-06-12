import type { MetadataRoute } from "next";

import { getSiteUrlString } from "@/lib/site-url";

const STATIC_ROUTES = [
  "",
  "/evaluate",
  "/resume",
  "/risks",
  "/insights",
  "/reports",
  "/settings",
  "/auth",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrlString();
  const lastModified = new Date();

  return STATIC_ROUTES.map((route) => ({
    url: `${siteUrl}${route}`,
    lastModified,
    changeFrequency: route === "" ? "weekly" : "monthly",
    priority: route === "" ? 1 : 0.7,
  }));
}
