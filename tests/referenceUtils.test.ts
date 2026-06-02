import { describe, expect, it } from 'vitest';

import {
    extractMarkdownLinkMatches,
    hasImageExtension,
    isPathCoveredByExcludedFolder,
    parseMarkdownLinkDestination,
    resolveVaultAttachmentReference,
} from '../src/referenceUtils';

describe('hasImageExtension', () => {
    it('recognizes webp and strips query strings', () => {
        expect(hasImageExtension('assets/cover.webp')).toBe(true);
        expect(hasImageExtension('assets/cover.png?version=2')).toBe(true);
        expect(hasImageExtension('https://example.com/file.txt')).toBe(false);
    });
});

describe('resolveVaultAttachmentReference', () => {
    it('prefers resolved vault path and ignores external references', () => {
        const resolvedPath = resolveVaultAttachmentReference(
            'cover.webp',
            'notes/daily.md',
            (referencePath) => (referencePath === 'cover.webp' ? 'assets/cover.webp' : null),
            () => false
        );

        expect(resolvedPath).toBe('assets/cover.webp');
        expect(
            resolveVaultAttachmentReference('https://example.com/cover.webp', 'notes/daily.md', () => null, () => false)
        ).toBe(null);
    });

    it('respects cleanup scope', () => {
        expect(resolveVaultAttachmentReference(
            'report.pdf',
            'notes/daily.md',
            (referencePath) => (referencePath === 'report.pdf' ? 'docs/report.pdf' : null),
            () => false,
            'all'
        )).toBe('docs/report.pdf');

        expect(resolveVaultAttachmentReference(
            'report.pdf',
            'notes/daily.md',
            (referencePath) => (referencePath === 'report.pdf' ? 'docs/report.pdf' : null),
            () => false,
            'image'
        )).toBe(null);
    });

    it('falls back to exact vault path lookup', () => {
        const resolvedPath = resolveVaultAttachmentReference(
            'assets/cover.webp',
            'notes/daily.md',
            () => null,
            (referencePath) => referencePath === 'assets/cover.webp'
        );

        expect(resolvedPath).toBe('assets/cover.webp');
    });
});

describe('isPathCoveredByExcludedFolder', () => {
    it('respects folder boundaries', () => {
        expect(isPathCoveredByExcludedFolder('foo/bar', 'foo/bar', false)).toBe(true);
        expect(isPathCoveredByExcludedFolder('foo/bar/nested', 'foo/bar', true)).toBe(true);
        expect(isPathCoveredByExcludedFolder('foo/barista', 'foo/bar', true)).toBe(false);
        expect(isPathCoveredByExcludedFolder('foo/bar/nested', 'foo/bar', false)).toBe(false);
    });
});

describe('extractMarkdownLinkMatches', () => {
    it('keeps paths with parentheses intact', () => {
        const matches = extractMarkdownLinkMatches(
            'A [photo](assets/photo (1).png) and [doc](files/report.pdf) inside the same note.'
        );

        expect(matches).toEqual(['[photo](assets/photo (1).png)', '[doc](files/report.pdf)']);
    });
});

describe('parseMarkdownLinkDestination', () => {
    it('strips titles and angle brackets', () => {
        expect(parseMarkdownLinkDestination('[img](assets/photo.png "caption")')).toBe('assets/photo.png');
        expect(parseMarkdownLinkDestination('[img](<assets/photo (1).png>)')).toBe('assets/photo (1).png');
        expect(parseMarkdownLinkDestination('[doc](<files/report.pdf> "caption")')).toBe('files/report.pdf');
    });
});
