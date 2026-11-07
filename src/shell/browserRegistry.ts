import type { AppId, BrowserViewRef } from '@bopbox/core';

export type BrowserCommand = (browser: BrowserViewRef) => Promise<void>;

/**
 * Holds the imperative handle of each app's BrowserView. Because views are mounted lazily,
 * a command for an app that isn't mounted yet (e.g. "search on Spotify" from a cold home
 * screen) is queued and flushed as soon as its ref attaches.
 */
export class BrowserRegistry {
  private refs = new Map<AppId, BrowserViewRef>();
  private pending = new Map<AppId, BrowserCommand[]>();

  attach(app: AppId, ref: BrowserViewRef | null): void {
    if (!ref) {
      this.refs.delete(app);
      return;
    }
    this.refs.set(app, ref);
    const queued = this.pending.get(app) ?? [];
    this.pending.delete(app);
    queued.forEach((command) => this.execute(ref, command));
  }

  run(app: AppId, command: BrowserCommand): void {
    const ref = this.refs.get(app);
    if (ref) {
      this.execute(ref, command);
    } else {
      this.pending.set(app, [...(this.pending.get(app) ?? []), command]);
    }
  }

  private execute(ref: BrowserViewRef, command: BrowserCommand): void {
    command(ref).catch((error: unknown) => {
      console.warn('[bopbox] browser command failed', error);
    });
  }
}
