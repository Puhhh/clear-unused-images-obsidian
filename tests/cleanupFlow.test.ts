import { describe, expect, it } from 'vitest';

import { shouldClearEmptyFoldersAfterAttachmentCleanup } from '../src/cleanupFlow';

describe('shouldClearEmptyFoldersAfterAttachmentCleanup', () => {
    it('only follows image cleanup that deleted files when enabled', () => {
        expect(shouldClearEmptyFoldersAfterAttachmentCleanup({
            cleanupType: 'image',
            deletedFiles: 1,
            clearEmptyFoldersAfterImageCleanup: true,
        })).toBe(true);
        expect(shouldClearEmptyFoldersAfterAttachmentCleanup({
            cleanupType: 'image',
            deletedFiles: 0,
            clearEmptyFoldersAfterImageCleanup: true,
        })).toBe(false);
        expect(shouldClearEmptyFoldersAfterAttachmentCleanup({
            cleanupType: 'all',
            deletedFiles: 1,
            clearEmptyFoldersAfterImageCleanup: true,
        })).toBe(false);
        expect(shouldClearEmptyFoldersAfterAttachmentCleanup({
            cleanupType: 'image',
            deletedFiles: 1,
            clearEmptyFoldersAfterImageCleanup: false,
        })).toBe(false);
    });
});
