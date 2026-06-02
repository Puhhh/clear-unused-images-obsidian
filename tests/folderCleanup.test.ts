import { describe, expect, it } from 'vitest';

import { getEmptyCandidateFoldersInDeleteOrder, getEmptyFoldersInDeleteOrder } from '../src/folderCleanup';

interface TestFile {
    path: string;
}

interface TestFolder {
    path: string;
    children: Array<TestFile | TestFolder>;
}

const file = (path: string): TestFile => ({ path });
const folder = (path: string, children: Array<TestFile | TestFolder> = []): TestFolder => ({ path, children });

describe('getEmptyFoldersInDeleteOrder', () => {
    it('skips root and returns deepest empty folders before parents', () => {
        const root = folder('', [
            folder('empty-parent', [
                folder('empty-parent/empty-child'),
            ]),
        ]);

        const folders = getEmptyFoldersInDeleteOrder(root, (candidate): candidate is TestFolder => 'children' in candidate);

        expect(folders.map((candidate) => candidate.path)).toEqual([
            'empty-parent/empty-child',
            'empty-parent',
        ]);
    });

    it('keeps folders that contain files', () => {
        const root = folder('', [
            folder('has-file', [
                file('has-file/note.md'),
            ]),
            folder('empty'),
        ]);

        const folders = getEmptyFoldersInDeleteOrder(root, (candidate): candidate is TestFolder => 'children' in candidate);

        expect(folders.map((candidate) => candidate.path)).toEqual(['empty']);
    });

    it('protects excluded folder trees', () => {
        const root = folder('', [
            folder('keep', [
                folder('keep/empty-child'),
            ]),
            folder('remove'),
        ]);

        const folders = getEmptyFoldersInDeleteOrder(
            root,
            (candidate): candidate is TestFolder => 'children' in candidate,
            (candidate) => candidate.path === 'keep' || candidate.path.startsWith('keep/')
        );

        expect(folders.map((candidate) => candidate.path)).toEqual(['remove']);
    });
});

describe('getEmptyCandidateFoldersInDeleteOrder', () => {
    it('only removes empty direct candidate folders', () => {
        const root = folder('', [
            folder('was-empty-before-cleanup'),
            folder('image-parent'),
        ]);

        const folders = getEmptyCandidateFoldersInDeleteOrder(
            root,
            (candidate): candidate is TestFolder => 'children' in candidate,
            new Set(['image-parent'])
        );

        expect(folders.map((candidate) => candidate.path)).toEqual(['image-parent']);
    });

    it('does not remove parent folders without direct deleted images', () => {
        const root = folder('', [
            folder('parent', [
                folder('parent/child'),
            ]),
        ]);

        const folders = getEmptyCandidateFoldersInDeleteOrder(
            root,
            (candidate): candidate is TestFolder => 'children' in candidate,
            new Set(['parent/child'])
        );

        expect(folders.map((candidate) => candidate.path)).toEqual(['parent/child']);
    });

    it('allows parent cleanup when it is also a direct candidate', () => {
        const root = folder('', [
            folder('parent', [
                folder('parent/child'),
            ]),
        ]);

        const folders = getEmptyCandidateFoldersInDeleteOrder(
            root,
            (candidate): candidate is TestFolder => 'children' in candidate,
            new Set(['parent', 'parent/child'])
        );

        expect(folders.map((candidate) => candidate.path)).toEqual(['parent/child', 'parent']);
    });
});
