import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('file deletion source order', () => {
    it('snapshots parent folder before file manager trash can detach the file', () => {
        const utilSource = readFileSync(join(process.cwd(), 'src/util.ts'), 'utf8');
        const snapshotIndex = utilSource.indexOf('const parentFolderPath = file.parent.path;');
        const trashIndex = utilSource.indexOf('await app.fileManager.trashFile(file');

        expect(snapshotIndex).not.toBe(-1);
        expect(trashIndex).not.toBe(-1);
        expect(snapshotIndex).toBeLessThan(trashIndex);
    });

    it('does not bypass the Obsidian file manager deletion preference', () => {
        const utilSource = readFileSync(join(process.cwd(), 'src/util.ts'), 'utf8');

        expect(utilSource).not.toContain('obsidianmd/prefer-file-manager-trash-file');
        expect(utilSource).not.toContain('app.vault.delete');
        expect(utilSource).not.toContain('app.vault.trash');
        expect(utilSource).toContain('app.fileManager.trashFile(file');
        expect(utilSource).toContain('app.fileManager.trashFile(folder');
    });
});
