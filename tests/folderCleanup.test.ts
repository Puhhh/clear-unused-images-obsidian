import test from 'node:test';
import assert from 'node:assert/strict';

import { getEmptyCandidateFoldersInDeleteOrder, getEmptyFoldersInDeleteOrder } from '../src/folderCleanup.ts';

interface TestFile {
    path: string;
}

interface TestFolder {
    path: string;
    children: Array<TestFile | TestFolder>;
}

const file = (path: string): TestFile => ({ path });
const folder = (path: string, children: Array<TestFile | TestFolder> = []): TestFolder => ({ path, children });

test('getEmptyFoldersInDeleteOrder skips root and returns deepest empty folders before parents', () => {
    const root = folder('', [
        folder('empty-parent', [
            folder('empty-parent/empty-child'),
        ]),
    ]);

    const folders = getEmptyFoldersInDeleteOrder(root, (candidate): candidate is TestFolder => 'children' in candidate);

    assert.deepEqual(folders.map((candidate) => candidate.path), [
        'empty-parent/empty-child',
        'empty-parent',
    ]);
});

test('getEmptyFoldersInDeleteOrder keeps folders that contain files', () => {
    const root = folder('', [
        folder('has-file', [
            file('has-file/note.md'),
        ]),
        folder('empty'),
    ]);

    const folders = getEmptyFoldersInDeleteOrder(root, (candidate): candidate is TestFolder => 'children' in candidate);

    assert.deepEqual(folders.map((candidate) => candidate.path), ['empty']);
});

test('getEmptyFoldersInDeleteOrder protects excluded folder trees', () => {
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

    assert.deepEqual(folders.map((candidate) => candidate.path), ['remove']);
});

test('getEmptyCandidateFoldersInDeleteOrder only removes empty direct candidate folders', () => {
    const root = folder('', [
        folder('was-empty-before-cleanup'),
        folder('image-parent'),
    ]);

    const folders = getEmptyCandidateFoldersInDeleteOrder(
        root,
        (candidate): candidate is TestFolder => 'children' in candidate,
        new Set(['image-parent'])
    );

    assert.deepEqual(folders.map((candidate) => candidate.path), ['image-parent']);
});

test('getEmptyCandidateFoldersInDeleteOrder does not remove parent folders without direct deleted images', () => {
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

    assert.deepEqual(folders.map((candidate) => candidate.path), ['parent/child']);
});

test('getEmptyCandidateFoldersInDeleteOrder allows parent cleanup when it is also a direct candidate', () => {
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

    assert.deepEqual(folders.map((candidate) => candidate.path), ['parent/child', 'parent']);
});
