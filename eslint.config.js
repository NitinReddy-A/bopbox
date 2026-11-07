// https://docs.expo.dev/guides/using-eslint/
const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const globals = require('globals');

module.exports = defineConfig([
  globalIgnores(['dist/*', 'android/*', 'modules/bopbox-core/android/*', '.expo/*']),
  expoConfig,
  {
    files: ['**/__tests__/**/*.{js,ts,tsx}', 'jest.setup.ts'],
    languageOptions: { globals: { ...globals.jest, ...globals.node } },
  },
]);
