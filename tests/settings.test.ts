import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('clear empty folders after image cleanup is disabled by default in plugin settings', () => {
    const settingsSource = readFileSync(new URL('../src/settings.ts', import.meta.url), 'utf8');

    assert.match(settingsSource, /clearEmptyFoldersAfterImageCleanup:\s*boolean/);
    assert.match(settingsSource, /clearEmptyFoldersAfterImageCleanup:\s*false/);
});
