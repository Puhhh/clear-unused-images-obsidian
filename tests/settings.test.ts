import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('plugin settings defaults', () => {
    it('keeps clear empty folders after image cleanup disabled by default', () => {
        const settingsSource = readFileSync(join(process.cwd(), 'src/settings.ts'), 'utf8');

        expect(settingsSource).toMatch(/clearEmptyFoldersAfterImageCleanup:\s*boolean/);
        expect(settingsSource).toMatch(/clearEmptyFoldersAfterImageCleanup:\s*false/);
    });

    it('uses Obsidian-configured trash by default', () => {
        const settingsSource = readFileSync(join(process.cwd(), 'src/settings.ts'), 'utf8');

        expect(settingsSource).toMatch(/deleteOption:\s*'trash'/);
    });

    it('migrates old trash destinations to Obsidian-configured trash', () => {
        const settingsSource = readFileSync(join(process.cwd(), 'src/settings.ts'), 'utf8');
        const mainSource = readFileSync(join(process.cwd(), 'src/main.ts'), 'utf8');

        expect(settingsSource).toMatch(/export const normalizeDeleteOption/);
        expect(settingsSource).toMatch(/deleteOption === '\.trash' \|\| deleteOption === 'system-trash'/);
        expect(mainSource).toMatch(/deleteOption: normalizeDeleteOption\(settingsOverride\.deleteOption\)/);
    });
});
