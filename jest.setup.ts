import { resetBopboxMock } from '@/test/mockBopboxCore';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);

beforeEach(() => {
  resetBopboxMock();
});
