import type { AppId } from '@bopbox/core';

export type ResolvedSearch =
  | { kind: 'url'; app: AppId; url: string }
  | { kind: 'query'; app: null; query: string }
  | null;

const APP_HOSTS: Record<AppId, readonly string[]> = {
  youtube: ['youtube.com', 'youtu.be', 'youtube-nocookie.com'],
  spotify: ['spotify.com', 'spotify.link'],
};

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

function parseUrl(input: string): URL | null {
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `https://${input}`;
  try {
    const url = new URL(candidate);
    return url.hostname.includes('.') ? url : null;
  } catch {
    return null;
  }
}

/** The app that owns a URL, or null if neither does. */
export function appForUrl(input: string): AppId | null {
  const url = parseUrl(input);
  if (!url) return null;
  const host = url.hostname.toLowerCase();
  const match = (Object.keys(APP_HOSTS) as AppId[]).find((app) =>
    APP_HOSTS[app].some((domain) => hostMatches(host, domain)),
  );
  return match ?? null;
}

/**
 * Classifies what the user typed in the home search bar: a link one of the apps can open
 * directly, or a free-text query that still needs a target app.
 */
export function resolveSearch(input: string): ResolvedSearch {
  const text = input.trim();
  if (!text) return null;
  if (!/\s/.test(text)) {
    const url = parseUrl(text);
    const app = url && appForUrl(text);
    if (url && app) return { kind: 'url', app, url: url.toString() };
  }
  return { kind: 'query', app: null, query: text };
}
