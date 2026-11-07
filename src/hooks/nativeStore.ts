import { BopboxCore, type BopboxCoreEvents } from '@bopbox/core';
import { useSyncExternalStore } from 'react';

type EventName = keyof BopboxCoreEvents;
type Payload<E extends EventName> = Parameters<BopboxCoreEvents[E]>[0];

export type NativeStore<T> = {
  subscribe(listener: () => void): () => void;
  getSnapshot(): T;
  /** Replace the cached value, e.g. with the result of a synchronous native write. */
  set(value: T): void;
};

/**
 * Mirrors one piece of native state: seeded from a sync getter, kept fresh by a native event.
 * The native listener only exists while at least one component is subscribed, and the value is
 * re-read on (re)subscription so updates emitted while nobody listened are never lost.
 */
export function createNativeStore<T, E extends EventName>(
  event: E,
  read: () => T,
  select: (payload: Payload<E>) => T,
): NativeStore<T> {
  const listeners = new Set<() => void>();
  let cached: { value: T } | null = null;
  let nativeSub: { remove(): void } | null = null;

  const set = (value: T) => {
    cached = { value };
    listeners.forEach((l) => l());
  };

  const onEvent = (payload: Payload<E>) => set(select(payload));

  return {
    getSnapshot() {
      if (!cached) cached = { value: read() };
      return cached.value;
    },
    set,
    subscribe(listener) {
      listeners.add(listener);
      if (!nativeSub) {
        // The listener type of a generic event can't be narrowed by TS; `onEvent` matches it.
        nativeSub = BopboxCore.addListener(event, onEvent as BopboxCoreEvents[E]);
        cached = { value: read() };
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && nativeSub) {
          nativeSub.remove();
          nativeSub = null;
          cached = null;
        }
      };
    },
  };
}

export function useNativeStore<T>(store: NativeStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
