import { describe, expect, it } from 'vitest';

import { matchAttachmentFolderRule, parseAttachmentFolderRules } from '../src/attachmentFolderRules';

describe('attachment folder rules', () => {
    it('preserves legacy case-insensitive suffix matching and removes duplicates', () => {
        const parsed = parseAttachmentFolderRules('.HTML, .html, .Excalidraw');

        expect(parsed.error).toBeUndefined();
        expect(parsed.canonicalRules).toEqual(['suffix:.html', 'suffix:.excalidraw']);
        expect(matchAttachmentFolderRule('exports/Test.HTML', 'Test.HTML', 'exports', parsed.rules)?.kind).toBe(
            'suffix'
        );
    });

    it('parses case-sensitive parent paths and anchored regular expressions', () => {
        const parsed = parseAttachmentFolderRules('Attachments\n/^Exports\\/[^/]+$/');

        expect(parsed.error).toBeUndefined();
        expect(parsed.canonicalRules).toEqual([
            'parent-path:Attachments',
            'regex:^Exports\\/[^/]+$',
        ]);
        expect(matchAttachmentFolderRule('Attachments/Project', 'Project', 'Attachments', parsed.rules)?.kind).toBe(
            'parent-path'
        );
        expect(matchAttachmentFolderRule('attachments/Project', 'Project', 'attachments', parsed.rules)).toBeNull();
        expect(matchAttachmentFolderRule('Exports/Project', 'Project', 'Exports', parsed.rules)?.kind).toBe('regex');
    });

    it('fails the entire ruleset closed when any rule is invalid', () => {
        const parsed = parseAttachmentFolderRules('.html, ../Attachments');

        expect(parsed.rules).toEqual([]);
        expect(parsed.canonicalRules).toEqual([]);
        expect(parsed.error).toContain('Invalid attachment folder');
    });

    it.each([
        '/Attachments/',
        '/^Attachments.*$/',
        '/^(Attachments)+$/',
        '/^Attachments\\/[^/]+$/i',
        '/^Attachments\\/[a/]+$/',
        '/^Attachments\\/[^/]+[^/]+$/',
        '/^Attachments\\/\\1$/',
    ])('rejects unsafe or ambiguous regular expression %s', (rule) => {
        const parsed = parseAttachmentFolderRules(rule);

        expect(parsed.rules).toEqual([]);
        expect(parsed.error).toContain('Invalid attachment folder regular expression');
    });

    it('keeps commas inside regular-expression character classes', () => {
        const parsed = parseAttachmentFolderRules('/^Exports\\/[A,B]+$/');

        expect(parsed.error).toBeUndefined();
        expect(parsed.rules).toHaveLength(1);
    });

    it.each([
        ['.html, Attachments'],
        ['Attachments, .html'],
    ])('prefers parent cleanup semantics when legacy suffix and parent rules overlap: %s', (input) => {
        const parsed = parseAttachmentFolderRules(input);

        expect(
            matchAttachmentFolderRule('Attachments/Test.html', 'Test.html', 'Attachments', parsed.rules)?.kind
        ).toBe('parent-path');
    });
});
