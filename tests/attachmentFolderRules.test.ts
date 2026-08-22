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

    it('parses recursive parent paths and removes duplicates', () => {
        const parsed = parseAttachmentFolderRules('**/attachments\n**/attachments');

        expect(parsed.error).toBeUndefined();
        expect(parsed.canonicalRules).toEqual(['recursive-parent-path:attachments']);
        expect(parsed.rules).toHaveLength(1);
        expect(parsed.rules[0]).toMatchObject({
            kind: 'recursive-parent-path',
            value: 'attachments',
            label: 'recursive parent path **/attachments',
        });
    });

    it('matches a recursive parent folder at the vault root or any nesting depth', () => {
        const parsed = parseAttachmentFolderRules('**/attachments');

        expect(
            matchAttachmentFolderRule('attachments/Project', 'Project', 'attachments', parsed.rules)?.kind
        ).toBe('recursive-parent-path');
        expect(
            matchAttachmentFolderRule(
                'Projects/attachments/Project A',
                'Project A',
                'Projects/attachments',
                parsed.rules
            )?.kind
        ).toBe('recursive-parent-path');
        expect(
            matchAttachmentFolderRule(
                'Work/2024/attachments/Project',
                'Project',
                'Work/2024/attachments',
                parsed.rules
            )?.kind
        ).toBe('recursive-parent-path');
        expect(
            matchAttachmentFolderRule('**/attachments/Project', 'Project', '**/attachments', parsed.rules)?.kind
        ).toBe('recursive-parent-path');
    });

    it.each([
        ['Attachments/Project', 'Project', 'Attachments'],
        ['attachments-old/Project', 'Project', 'attachments-old'],
        ['my attachments/Project', 'Project', 'my attachments'],
        ['notes/attachments', 'attachments', 'notes'],
    ])('does not match a non-exact recursive parent segment: %s', (folderPath, folderName, parentPath) => {
        const parsed = parseAttachmentFolderRules('**/attachments');

        expect(matchAttachmentFolderRule(folderPath, folderName, parentPath, parsed.rules)).toBeNull();
    });

    it.each([
        '**',
        '**/',
        '**/attachments/',
        '**/attachments/**',
        '**/Projects/attachments',
        '**/at*tachments',
        '**/attachment?',
        '**/..',
    ])('rejects ambiguous recursive parent rule %s', (rule) => {
        const parsed = parseAttachmentFolderRules(rule);

        expect(parsed.rules).toEqual([]);
        expect(parsed.canonicalRules).toEqual([]);
        expect(parsed.error).toContain('Invalid recursive parent folder rule');
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
