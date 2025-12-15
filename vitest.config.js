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
    // The command suites all write into the system temporary directory, so
    // running one worker per core has them queueing on the same filesystem
    // rather than on the cpu. Four is faster here and far steadier.
    pool: 'threads',
    poolOptions: { threads: { minThreads: 1, maxThreads: 4 } },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      reporter: ['text', 'lcov'],
      // Measured at 98.7 statements and 94.4 branches. The floors sit a
      // couple of points under that: high enough that a module landing
      // untested fails the build, loose enough that one uncovered branch in a
      // refactor does not.
      thresholds: {
        statements: 96,
        branches: 92,
        functions: 96,
        lines: 96,
      },
    },
  },
});
