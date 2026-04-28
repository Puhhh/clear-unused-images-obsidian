import test from 'node:test';
import assert from 'node:assert/strict';

import {
    extractMarkdownLinkMatches,
    hasImageExtension,
    isPathCoveredByExcludedFolder,
    resolveVaultAttachmentReference,
} from '../src/referenceUtils.ts';

test('hasImageExtension recognizes webp and strips query strings', () => {
    assert.equal(hasImageExtension('assets/cover.webp'), true);
    assert.equal(hasImageExtension('assets/cover.png?version=2'), true);
    assert.equal(hasImageExtension('https://example.com/file.txt'), false);
});

test('resolveVaultAttachmentReference prefers resolved vault path and ignores external references', () => {
    const resolvedPath = resolveVaultAttachmentReference(
        'cover.webp',
        'notes/daily.md',
        (referencePath) => (referencePath === 'cover.webp' ? 'assets/cover.webp' : null),
        () => false
    );

    assert.equal(resolvedPath, 'assets/cover.webp');
    assert.equal(
        resolveVaultAttachmentReference('https://example.com/cover.webp', 'notes/daily.md', () => null, () => false),
        null
    );
});

test('resolveVaultAttachmentReference falls back to exact vault path lookup', () => {
    const resolvedPath = resolveVaultAttachmentReference(
        'assets/cover.webp',
        'notes/daily.md',
        () => null,
        (referencePath) => referencePath === 'assets/cover.webp'
    );

    assert.equal(resolvedPath, 'assets/cover.webp');
});

test('isPathCoveredByExcludedFolder respects folder boundaries', () => {
    assert.equal(isPathCoveredByExcludedFolder('foo/bar', 'foo/bar', false), true);
    assert.equal(isPathCoveredByExcludedFolder('foo/bar/nested', 'foo/bar', true), true);
    assert.equal(isPathCoveredByExcludedFolder('foo/barista', 'foo/bar', true), false);
    assert.equal(isPathCoveredByExcludedFolder('foo/bar/nested', 'foo/bar', false), false);
});

test('extractMarkdownLinkMatches keeps paths with parentheses intact', () => {
    const matches = extractMarkdownLinkMatches(
        'A [photo](assets/photo (1).png) and [doc](files/report.pdf) inside the same note.'
    );

    assert.deepEqual(matches, ['[photo](assets/photo (1).png)', '[doc](files/report.pdf)']);
});
