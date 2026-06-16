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

    it('migrates old delete destinations to Obsidian-configured trash', () => {
        const settingsSource = readFileSync(join(process.cwd(), 'src/settings.ts'), 'utf8');
        const mainSource = readFileSync(join(process.cwd(), 'src/main.ts'), 'utf8');

        expect(settingsSource).toMatch(/export const normalizeDeleteOption/);
        expect(settingsSource).toMatch(/deleteOption === '\.trash' \|\| deleteOption === 'system-trash' \|\| deleteOption === 'permanent'/);
        expect(mainSource).toMatch(/deleteOption: normalizeDeleteOption\(settingsOverride\.deleteOption\)/);
    });

    it('does not expose plugin-controlled permanent delete', () => {
        const settingsSource = readFileSync(join(process.cwd(), 'src/settings.ts'), 'utf8');
        const mainSource = readFileSync(join(process.cwd(), 'src/main.ts'), 'utf8');

        expect(settingsSource).not.toContain("DeleteOption = 'trash' | 'permanent'");
        expect(settingsSource).not.toContain('Delete permanently');
        expect(settingsSource).not.toContain("dropdown.addOption('permanent'");
        expect(settingsSource).not.toContain('permanently deleted');
        expect(mainSource).not.toContain('PermanentDeleteConfirmationModal');
        expect(mainSource).not.toContain('confirmPermanentDelete');
    });
});
