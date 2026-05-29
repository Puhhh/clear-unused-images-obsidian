import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('file deletion snapshots parent folder before vault trash can detach the file', () => {
    const utilSource = readFileSync(new URL('../src/util.ts', import.meta.url), 'utf8');
    const snapshotIndex = utilSource.indexOf('const parentFolderPath = file.parent.path;');
    const trashIndex = utilSource.indexOf('await app.vault.trash(file');

    assert.notEqual(snapshotIndex, -1);
    assert.notEqual(trashIndex, -1);
    assert.ok(snapshotIndex < trashIndex);
});
