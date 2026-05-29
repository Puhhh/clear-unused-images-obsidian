import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldClearEmptyFoldersAfterAttachmentCleanup } from '../src/cleanupFlow.ts';

test('empty folder cleanup only follows image cleanup that deleted files when enabled', () => {
    assert.equal(
        shouldClearEmptyFoldersAfterAttachmentCleanup({
            cleanupType: 'image',
            deletedFiles: 1,
            clearEmptyFoldersAfterImageCleanup: true,
        }),
        true
    );
    assert.equal(
        shouldClearEmptyFoldersAfterAttachmentCleanup({
            cleanupType: 'image',
            deletedFiles: 0,
            clearEmptyFoldersAfterImageCleanup: true,
        }),
        false
    );
    assert.equal(
        shouldClearEmptyFoldersAfterAttachmentCleanup({
            cleanupType: 'all',
            deletedFiles: 1,
            clearEmptyFoldersAfterImageCleanup: true,
        }),
        false
    );
    assert.equal(
        shouldClearEmptyFoldersAfterAttachmentCleanup({
            cleanupType: 'image',
            deletedFiles: 1,
            clearEmptyFoldersAfterImageCleanup: false,
        }),
        false
    );
});
