import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('plugin settings defaults', () => {
    it('keeps clear empty folders after image cleanup disabled by default', () => {
        const settingsSource = readFileSync(join(process.cwd(), 'src/settings.ts'), 'utf8');

        expect(settingsSource).toMatch(/clearEmptyFoldersAfterImageCleanup:\s*boolean/);
        expect(settingsSource).toMatch(/clearEmptyFoldersAfterImageCleanup:\s*false/);
    });
});
