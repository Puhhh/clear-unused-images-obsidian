import { describe, expect, it } from 'vitest';

import { TFile, TFolder } from 'obsidian';
import type { App } from 'obsidian';

import { deleteFilesInTheList, getUnusedAttachments } from '../src/util';
import { DEFAULT_SETTINGS, OzanClearImagesSettings } from '../src/settings';
import type OzanClearImages from '../src/main';

/* ------------------ Fake Vault ------------------ */

interface VaultFileSpec {
    path: string;
    content?: string;
}

interface FakeVault {
    app: App;
    files: Map<string, TFile>;
    trashedPaths: string[];
}

const buildVault = (specs: VaultFileSpec[]): FakeVault => {
    const folders = new Map<string, TFolder>();
    const files = new Map<string, TFile>();
    const contents = new Map<string, string>();
    const trashedPaths: string[] = [];

    const root = new TFolder();
    root.path = '/';
    root.name = '';
    folders.set('/', root);

    const getFolder = (folderPath: string): TFolder => {
        if (folderPath === '' || folderPath === '/') {
            return root;
        }

        const existing = folders.get(folderPath);
        if (existing) {
            return existing;
        }

        const separatorIndex = folderPath.lastIndexOf('/');
        const parent = getFolder(separatorIndex === -1 ? '/' : folderPath.slice(0, separatorIndex));
        const folder = new TFolder();
        folder.path = folderPath;
        folder.name = separatorIndex === -1 ? folderPath : folderPath.slice(separatorIndex + 1);
        folder.parent = parent;
        parent.children.push(folder);
        folders.set(folderPath, folder);
        return folder;
    };

    for (const spec of specs) {
        const separatorIndex = spec.path.lastIndexOf('/');
        const parent = getFolder(separatorIndex === -1 ? '/' : spec.path.slice(0, separatorIndex));
        const name = separatorIndex === -1 ? spec.path : spec.path.slice(separatorIndex + 1);
        const dotIndex = name.lastIndexOf('.');

        const file = new TFile();
        file.path = spec.path;
        file.name = name;
        file.basename = dotIndex === -1 ? name : name.slice(0, dotIndex);
        file.extension = dotIndex === -1 ? '' : name.slice(dotIndex + 1);
        file.parent = parent;
        parent.children.push(file);
        files.set(spec.path, file);
        contents.set(spec.path, spec.content ?? '');
    }

    // Mirrors Obsidian's resolved link index for the markdown files in the vault.
    const resolvedLinks: Record<string, Record<string, number>> = {};

    const resolveLinkpath = (linkpath: string): TFile | null => {
        const direct = files.get(linkpath);
        if (direct) {
            return direct;
        }

        for (const file of files.values()) {
            if (file.name === linkpath || file.basename === linkpath) {
                return file;
            }
        }

        return null;
    };

    const app = {
        vault: {
            getFiles: () => [...files.values()],
            getRoot: () => root,
            getAbstractFileByPath: (path: string) => files.get(path) ?? folders.get(path) ?? null,
            read: (file: TFile) => Promise.resolve(contents.get(file.path) ?? ''),
            cachedRead: (file: TFile) => Promise.resolve(contents.get(file.path) ?? ''),
        },
        metadataCache: {
            resolvedLinks,
            getFileCache: () => ({}),
            getFirstLinkpathDest: (linkpath: string) => resolveLinkpath(linkpath),
        },
        fileManager: {
            trashFile: (file: TFile) => {
                trashedPaths.push(file.path);
                files.delete(file.path);
                return Promise.resolve();
            },
        },
    } as unknown as App;

    for (const spec of specs) {
        if (!spec.path.endsWith('.md')) {
            continue;
        }

        const links: Record<string, number> = {};
        for (const wikiMatch of (spec.content ?? '').match(/!\[\[(.*?)\]\]/g) ?? []) {
            const target = resolveLinkpath(wikiMatch.slice(3, -2));
            if (target) {
                links[target.path] = 1;
            }
        }
        resolvedLinks[spec.path] = links;
    }

    return { app, files, trashedPaths };
};

const buildPlugin = (settings: Partial<OzanClearImagesSettings>): OzanClearImages => {
    return { settings: { ...DEFAULT_SETTINGS, ...settings } } as unknown as OzanClearImages;
};

/* ------------------ Vault Fixture ------------------ */

// note.md uses only images/used.png; everything else in the vault is unused.
const VAULT_SPECS: VaultFileSpec[] = [
    { path: 'notes/note.md', content: 'Some text with ![[used.png]] in it.' },
    { path: 'images/used.png', content: '' },
    { path: 'images/unused.png', content: '' },
    { path: 'archive/manual.pdf', content: '' },
    { path: 'protected/keepsake.png', content: '' },
];

describe('unused attachment classification', () => {
    it('reports extension-excluded files as protected instead of dropping them from the preview', async () => {
        const { app } = buildVault(VAULT_SPECS);
        const plugin = buildPlugin({ excludedExtensions: 'pdf, ', excludedFolders: 'protected', excludeSubfolders: true });

        const { unusedAttachments, excludedAttachments } = await getUnusedAttachments(app, 'all', plugin);

        // Preview data handed to CleanupReviewModal.
        expect(unusedAttachments.map((file) => file.path)).toEqual(['images/unused.png']);
        expect(excludedAttachments.map((file) => file.path).sort()).toEqual([
            'archive/manual.pdf',
            'protected/keepsake.png',
        ]);
    });

    it('keeps used files out of both lists regardless of exclusions', async () => {
        const { app } = buildVault(VAULT_SPECS);
        const plugin = buildPlugin({ excludedExtensions: 'png' });

        const { unusedAttachments, excludedAttachments } = await getUnusedAttachments(app, 'all', plugin);
        const allReportedPaths = [...unusedAttachments, ...excludedAttachments].map((file) => file.path);

        expect(allReportedPaths).not.toContain('images/used.png');
    });

    it('surfaces protected files when every unused file is excluded by extension', async () => {
        const { app } = buildVault([
            { path: 'notes/note.md', content: 'Some text with ![[used.png]] in it.' },
            { path: 'images/used.png', content: '' },
            { path: 'archive/manual.pdf', content: '' },
        ]);
        const plugin = buildPlugin({ excludedExtensions: 'pdf' });

        const { unusedAttachments, excludedAttachments } = await getUnusedAttachments(app, 'all', plugin);

        // Nothing is deletable, but the vault is not "all used" either: main.ts relies on a
        // non-empty excluded list to show the protected-files notice and preview.
        expect(unusedAttachments).toEqual([]);
        expect(excludedAttachments.map((file) => file.path)).toEqual(['archive/manual.pdf']);
    });

    it('classifies excluded extensions in image-only cleanups too', async () => {
        const { app } = buildVault(VAULT_SPECS);
        const plugin = buildPlugin({ excludedExtensions: 'png' });

        const { unusedAttachments, excludedAttachments } = await getUnusedAttachments(app, 'image', plugin);

        expect(unusedAttachments).toEqual([]);
        expect(excludedAttachments.map((file) => file.path).sort()).toEqual([
            'images/unused.png',
            'protected/keepsake.png',
        ]);
    });

    it('never deletes an extension-excluded file even if it reaches the delete list', async () => {
        const { app, files, trashedPaths } = buildVault(VAULT_SPECS);
        const plugin = buildPlugin({ excludedExtensions: 'pdf' });

        const { deletedImages, skippedImages, failedImages } = await deleteFilesInTheList(
            [files.get('archive/manual.pdf')!, files.get('images/unused.png')!],
            plugin,
            app
        );

        expect(trashedPaths).toEqual(['images/unused.png']);
        expect(deletedImages).toBe(1);
        expect(skippedImages).toBe(1);
        expect(failedImages).toBe(0);
    });
});
