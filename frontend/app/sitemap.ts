import { MetadataRoute } from "next";
import { COMPETITORS } from "@/lib/competitors";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://songscore.app";
  const now = new Date();
  return [
    { url: base, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/app`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${base}/pricing`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/demo`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/accuracy`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/compare`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    ...COMPETITORS.map((c) => ({
      url: `${base}/compare/${c.slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    { url: `${base}/viewer`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/docs`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
  ];
}
