import { describe, expect, it } from 'vitest';
import { TAbstractFile, TFile, TFolder } from 'obsidian';
import type { App } from 'obsidian';

import {
    deleteReviewedAttachmentFolders,
    parseAttachmentFolderSuffixes,
    planAttachmentFolders,
} from '../src/attachmentFolders';
import { DEFAULT_SETTINGS, OzanClearImagesSettings } from '../src/settings';
import { getUnusedAttachments } from '../src/util';
import type OzanClearImages from '../src/main';

interface VaultFileSpec {
    path: string;
    content?: string;
    frontmatter?: unknown;
}

interface FakeVault {
    app: App;
    addFile: (spec: VaultFileSpec) => TFile;
    trashedPaths: string[];
}

const buildVault = (specs: VaultFileSpec[]): FakeVault => {
    const folders = new Map<string, TFolder>();
    const files = new Map<string, TFile>();
    const contents = new Map<string, string>();
    const frontmatter = new Map<string, unknown>();
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

    const addFile = (spec: VaultFileSpec): TFile => {
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
        Object.assign(file, { stat: { ctime: 1, mtime: 1, size: spec.content?.length ?? 0 } });
        parent.children.push(file);
        files.set(file.path, file);
        contents.set(file.path, spec.content ?? '');
        if (spec.frontmatter !== undefined) {
            frontmatter.set(file.path, spec.frontmatter);
        }
        return file;
    };

    for (const spec of specs) {
        addFile(spec);
    }

    const resolveLinkpath = (linkpath: string): TFile | null => {
        const cleanedPath = linkpath.split('|', 1)[0].split('#', 1)[0];
        const exact = files.get(cleanedPath);
        if (exact) {
            return exact;
        }

        const referenceName = cleanedPath.slice(cleanedPath.lastIndexOf('/') + 1);
        return [...files.values()].find((file) => file.name === referenceName || file.basename === referenceName) ?? null;
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
            resolvedLinks: {},
            getFileCache: (file: TFile) => ({ frontmatter: frontmatter.get(file.path) }),
            getFirstLinkpathDest: (linkpath: string) => resolveLinkpath(linkpath),
        },
        fileManager: {
            trashFile: (abstractFile: TAbstractFile) => {
                trashedPaths.push(abstractFile.path);
                return Promise.resolve();
            },
        },
    } as unknown as App;

    return { app, addFile, trashedPaths };
};

const settings = (override: Partial<OzanClearImagesSettings> = {}): OzanClearImagesSettings => ({
    ...DEFAULT_SETTINGS,
    attachmentFolderSuffixes: '.html',
    ...override,
});

describe('attachment folder suffix parsing', () => {
    it('normalizes case, removes duplicates, and rejects unsafe entries', () => {
        expect(parseAttachmentFolderSuffixes('.HTML, .html, .excalidraw')).toEqual({
            suffixes: ['.excalidraw', '.html'],
        });
        expect(parseAttachmentFolderSuffixes('html').suffixes).toEqual([]);
        expect(parseAttachmentFolderSuffixes('../html').suffixes).toEqual([]);
        expect(parseAttachmentFolderSuffixes('.').suffixes).toEqual([]);
    });
});

describe('attachment folder planning', () => {
    it('treats an unreferenced matching folder as one atomic candidate and suppresses descendants', async () => {
        const { app, trashedPaths } = buildVault([
            { path: 'notes/note.md', content: 'No links here.' },
            { path: 'exports/Test.html/index.html' },
            { path: 'exports/Test.html/assets/image.png' },
        ]);
        const plugin = { settings: settings() } as unknown as OzanClearImages;

        const plan = await planAttachmentFolders(app, plugin.settings);
        const attachments = await getUnusedAttachments(app, 'all', plugin, plan.candidateFolderPaths);

        expect(plan.deletableFolders.map((folder) => folder.path)).toEqual(['exports/Test.html']);
        expect(plan.deletableFolders[0].descendantPaths).toEqual([
            'exports/Test.html/assets',
            'exports/Test.html/assets/image.png',
            'exports/Test.html/index.html',
        ]);
        expect(attachments.unusedAttachments).toEqual([]);

        const result = await deleteReviewedAttachmentFolders(
            app,
            plugin.settings,
            plan.deletableFolders,
            plan.normalizedSuffixes
        );
        expect(result).toMatchObject({ deletedFolders: 1, failedFolders: 0, skippedFolders: 0 });
        expect(trashedPaths).toEqual(['exports/Test.html']);
    });

    it.each([
        ['wiki link', 'See [[exports/Test.html/assets/image.png]]', undefined],
        ['markdown link', '[asset](../exports/Test.html/assets/image.png)', undefined],
        ['frontmatter', '', { asset: 'exports/Test.html/assets/image.png' }],
        ['frontmatter wikilink', '', { asset: '[[exports/Test.html/assets/image.png]]' }],
        ['frontmatter embed', '', { asset: '![[exports/Test.html/assets/image.png]]' }],
    ])('protects a folder referenced from outside through %s', async (_label, content, noteFrontmatter) => {
        const { app } = buildVault([
            { path: 'notes/note.md', content, frontmatter: noteFrontmatter },
            { path: 'exports/Test.html/assets/image.png' },
        ]);

        const plan = await planAttachmentFolders(app, settings());

        expect(plan.deletableFolders).toEqual([]);
        expect(plan.protectedFolders[0]).toMatchObject({ path: 'exports/Test.html' });
        expect(plan.protectedFolders[0].protectedReason).toContain('Referenced from notes/note.md');
    });

    it('protects a folder when an outside note references a markdown descendant', async () => {
        const { app } = buildVault([
            { path: 'notes/note.md', content: '[[exports/Test.html/readme.md]]' },
            { path: 'exports/Test.html/readme.md', content: 'Generated documentation.' },
        ]);

        const plan = await planAttachmentFolders(app, settings());

        expect(plan.deletableFolders).toEqual([]);
        expect(plan.protectedFolders.map((folder) => folder.path)).toEqual(['exports/Test.html']);
    });

    it.each([
        ['file node', JSON.stringify({ nodes: [{ type: 'file', file: 'exports/Test.html/assets/image.png' }] })],
        ['text node', JSON.stringify({ nodes: [{ type: 'text', text: '[[exports/Test.html/assets/image.png]]' }] })],
    ])('protects a folder referenced from an outside canvas %s', async (_label, canvasContent) => {
        const { app } = buildVault([
            { path: 'boards/project.canvas', content: canvasContent },
            { path: 'exports/Test.html/assets/image.png' },
        ]);

        const plan = await planAttachmentFolders(app, settings());

        expect(plan.deletableFolders).toEqual([]);
        expect(plan.protectedFolders[0].protectedReason).toContain('Referenced from boards/project.canvas');
    });

    it('ignores references whose source is inside the same atomic folder', async () => {
        const { app } = buildVault([
            { path: 'exports/Test.html/readme.md', content: '[[exports/Test.html/assets/image.png]]' },
            { path: 'exports/Test.html/assets/image.png' },
        ]);

        const plan = await planAttachmentFolders(app, settings());

        expect(plan.deletableFolders.map((folder) => folder.path)).toEqual(['exports/Test.html']);
        expect(plan.protectedFolders).toEqual([]);
    });

    it('uses path boundaries when distinguishing internal and external sources', async () => {
        const { app } = buildVault([
            { path: 'exports/Test.html2/note.md', content: '[[exports/Test.html/assets/image.png]]' },
            { path: 'exports/Test.html/assets/image.png' },
        ]);

        const plan = await planAttachmentFolders(app, settings());

        expect(plan.deletableFolders).toEqual([]);
        expect(plan.protectedFolders[0].protectedReason).toContain('exports/Test.html2/note.md');
    });

    it('protects the whole folder when it intersects any exclusion', async () => {
        const excludedExtensionVault = buildVault([{ path: 'exports/Test.html/private/keep.pdf' }]);
        const extensionPlan = await planAttachmentFolders(
            excludedExtensionVault.app,
            settings({ excludedExtensions: 'pdf' })
        );
        expect(extensionPlan.protectedFolders[0].protectedReason).toContain('Contains excluded file');

        const excludedFolderVault = buildVault([{ path: 'exports/Test.html/private/data.bin' }]);
        const folderPlan = await planAttachmentFolders(
            excludedFolderVault.app,
            settings({ excludedFolders: 'exports/Test.html/private', excludeSubfolders: false })
        );
        expect(folderPlan.protectedFolders[0].protectedReason).toContain('Intersects excluded folder');
    });

    it('fails closed when a canvas source cannot be parsed', async () => {
        const { app } = buildVault([
            { path: 'broken.canvas', content: '{not json' },
            { path: 'exports/Test.html/index.html' },
        ]);

        const plan = await planAttachmentFolders(app, settings());

        expect(plan.deletableFolders).toEqual([]);
        expect(plan.protectedFolders[0].protectedReason).toContain('Reference scan failed');
    });

    it('skips deletion when descendants change after review', async () => {
        const vault = buildVault([{ path: 'exports/Test.html/index.html' }]);
        const currentSettings = settings();
        const plan = await planAttachmentFolders(vault.app, currentSettings);
        vault.addFile({ path: 'exports/Test.html/added-after-review.txt' });

        const result = await deleteReviewedAttachmentFolders(
            vault.app,
            currentSettings,
            plan.deletableFolders,
            plan.normalizedSuffixes
        );

        expect(result).toMatchObject({ deletedFolders: 0, failedFolders: 0, skippedFolders: 1 });
        expect(vault.trashedPaths).toEqual([]);
    });
});
