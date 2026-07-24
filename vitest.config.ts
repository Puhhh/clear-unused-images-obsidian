import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: {
        alias: {
            // The published `obsidian` package has no runtime entry point, so tests that import
            // plugin sources resolve it to a local stub instead.
            obsidian: fileURLToPath(new URL('./tests/stubs/obsidian.ts', import.meta.url)),
        },
    },
});
