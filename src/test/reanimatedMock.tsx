/**
 * Jest stand-in for react-native-reanimated 4. Its official mock still loads the native
 * initializer (which throws under JSReanimated), so tests use this: plain RN components, shared
 * values as boxes, animations that jump straight to their target, and chainable no-op builders.
 */
import { createElement, forwardRef, type ComponentType } from 'react';
import { ScrollView, Text, View } from 'react-native';

type AnyProps = Record<string, unknown>;

function animated<P extends AnyProps>(Component: ComponentType<P>) {
  return forwardRef<unknown, P>(function AnimatedMock(props, ref) {
    const { entering: _entering, exiting: _exiting, layout: _layout, ...rest } = props as AnyProps;
    return createElement(Component as ComponentType<AnyProps>, { ...rest, ref });
  });
}

const Animated = {
  View: animated(View),
  Text: animated(Text),
  ScrollView: animated(ScrollView),
  createAnimatedComponent: animated,
};
export default Animated;

export function useSharedValue<T>(initial: T) {
  let value = initial;
  return {
    get: () => value,
    set: (next: T | ((v: T) => T)) => {
      value = typeof next === 'function' ? (next as (v: T) => T)(value) : next;
    },
    get value() {
      return value;
    },
    set value(next: T) {
      value = next;
    },
  };
}

export const useAnimatedStyle = (factory: () => object) => factory();
export const useAnimatedScrollHandler = () => () => {};
export const useAnimatedReaction = () => {};
export const useReducedMotion = () => false;

/** Animations land on their target immediately and report completion. */
export function withTiming<T>(to: T, _config?: unknown, done?: (finished: boolean) => void): T {
  done?.(true);
  return to;
}
export function withSpring<T>(to: T, _config?: unknown, done?: (finished: boolean) => void): T {
  done?.(true);
  return to;
}

export function interpolate(x: number, input: number[], output: number[]): number {
  if (x <= input[0]) return output[0];
  if (x >= input[input.length - 1]) return output[output.length - 1];
  for (let i = 0; i < input.length - 1; i++) {
    if (x <= input[i + 1]) {
      const t = (x - input[i]) / (input[i + 1] - input[i]);
      return output[i] + t * (output[i + 1] - output[i]);
    }
  }
  return output[output.length - 1];
}

export const Extrapolation = { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' };

const identityEasing = () => (t: number) => t;
export const Easing = { bezier: identityEasing, linear: (t: number) => t, ease: (t: number) => t };
export const cubicBezier = () => 'cubic-bezier';

/** Layout-animation builders: every chain call returns the builder. */
function builder(): unknown {
  const chain: Record<string, unknown> = {};
  for (const method of ['duration', 'delay', 'easing', 'springify', 'damping', 'withCallback']) {
    chain[method] = () => chain;
  }
  return chain;
}
export const FadeIn = builder();
export const FadeOut = builder();
export const FadeInDown = builder();
export const FadeOutDown = builder();
export const LinearTransition = builder();

// Hooks gesture-handler reaches for when Reanimated is installed.
export const isSharedValue = (v: unknown) =>
  !!v && typeof v === 'object' && typeof (v as { get?: unknown }).get === 'function' && 'value' in (v as object);
export const useEvent = (handler: unknown) => handler;
export const useHandler = () => ({ context: {}, doDependenciesDiffer: false, useWeb: false });
export const useComposedEventHandler = () => () => {};
export const setGestureState = () => {};
