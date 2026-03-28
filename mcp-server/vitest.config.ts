import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    // Allow importing CJS modules (server workspace) from ESM tests
    server: {
      deps: {
        inline: ['better-sqlite3'],
      },
    },
  },
});
