import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('file deletion source order', () => {
    it('snapshots parent folder before vault trash can detach the file', () => {
        const utilSource = readFileSync(join(process.cwd(), 'src/util.ts'), 'utf8');
        const snapshotIndex = utilSource.indexOf('const parentFolderPath = file.parent.path;');
        const trashIndex = utilSource.indexOf('await app.vault.trash(file');

        expect(snapshotIndex).not.toBe(-1);
        expect(trashIndex).not.toBe(-1);
        expect(snapshotIndex).toBeLessThan(trashIndex);
    });
});
