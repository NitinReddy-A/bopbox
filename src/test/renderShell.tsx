import { render, screen } from '@testing-library/react-native';
import { BackHandler, StyleSheet } from 'react-native';

import { Shell } from '@/shell/Shell';
import { ShellProvider } from '@/shell/ShellContext';
import { ThemeProvider } from '@/theme/ThemeProvider';

export async function renderShell() {
  return render(
    <ThemeProvider>
      <ShellProvider>
        <Shell />
      </ShellProvider>
    </ThemeProvider>,
  );
}

/** Whether an app's BrowserView wrapper is mounted, visible and touchable. */
export function browserState(app: 'youtube' | 'spotify'): 'unmounted' | 'hidden' | 'visible' {
  const wrapper = screen.queryByTestId(`browser-${app}`, { includeHiddenElements: true });
  if (!wrapper) return 'unmounted';
  const { opacity } = StyleSheet.flatten(wrapper.props.style);
  return opacity === 1 && wrapper.props.pointerEvents === 'auto' ? 'visible' : 'hidden';
}

/**
 * RN's BackHandler never fires under Jest, so capture listeners and replay a press the way
 * Android does: newest listener first, stop at the first one that returns true.
 */
export function captureBackHandler() {
  type Handler = Parameters<typeof BackHandler.addEventListener>[1];
  const handlers: Handler[] = [];
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
    handlers.push(handler);
    return {
      remove: () => {
        const index = handlers.indexOf(handler);
        if (index >= 0) handlers.splice(index, 1);
      },
    };
  });
  return {
    pressBack(): boolean {
      for (let i = handlers.length - 1; i >= 0; i--) {
        if (handlers[i]({ type: 'hardwareBackPress', timeStamp: Date.now() })) return true;
      }
      return false;
    },
  };
}
