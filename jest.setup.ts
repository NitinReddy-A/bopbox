import 'react-native-gesture-handler/jestSetup';

import { resetBopboxMock } from '@/test/mockBopboxCore';

// Reanimated 4 runs worklets in a native runtime; under Jest both use their official mocks.
jest.mock('react-native-worklets', () => jest.requireActual('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => jest.requireActual('@/test/reanimatedMock'));

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);

beforeEach(() => {
  resetBopboxMock();
});
