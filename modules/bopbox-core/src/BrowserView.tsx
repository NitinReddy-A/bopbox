import { requireNativeView } from 'expo';
import * as React from 'react';

import type { BrowserViewProps, BrowserViewRef } from './BopboxCore.types';

const NativeBrowserView = requireNativeView<BrowserViewProps & { ref?: React.Ref<BrowserViewRef> }>('BopboxCore');

/**
 * Hosts the long-lived native WebView for one app. Unmounting never kills the page: the
 * WebView returns to a native pool so audio keeps playing.
 */
const BrowserView = React.forwardRef<BrowserViewRef, BrowserViewProps>(function BrowserView(props, ref) {
  return <NativeBrowserView {...props} ref={ref} />;
});

export default BrowserView;
