import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
    // The command tests write real files into a temporary directory, and a
    // loaded windows machine can take a while over that. Fifteen seconds is
    // long enough that a slow disk is not a failure and short enough that a
    // genuine hang still shows up as one.
    testTimeout: 30000,
    // Some command suites build a whole yard in a hook before the first
    // assertion, which is a dozen writes to a temporary directory.
    hookTimeout: 30000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      reporter: ['text', 'lcov'],
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 90,
        lines: 90,
      },
    },
  },
});
