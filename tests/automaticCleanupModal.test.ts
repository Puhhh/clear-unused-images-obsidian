import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TFile } from 'obsidian';

const promptMock = vi.fn(async () => true);

vi.mock('../src/reviewModal', () => {
    return {
        CleanupReviewModal: vi.fn().mockImplementation(function CleanupReviewModal() {
            return { prompt: promptMock };
        }),
    };
});

vi.mock('../src/util', async () => {
    const actual = await vi.importActual<typeof import('../src/util')>('../src/util');
    return {
        ...actual,
        getUnusedAttachments: vi.fn(),
        deleteFilesInTheList: vi.fn(),
    };
});

vi.mock('../src/attachmentFolders', async () => {
    const actual = await vi.importActual<typeof import('../src/attachmentFolders')>('../src/attachmentFolders');
    return {
        ...actual,
        planAttachmentFolders: vi.fn(),
        deleteReviewedAttachmentFolders: vi.fn(),
    };
});

import OzanClearImages from '../src/main';
import * as Util from '../src/util';
import { CleanupReviewModal } from '../src/reviewModal';
import * as AttachmentFolders from '../src/attachmentFolders';

const excludedFile = { path: 'protected.png' } as TFile;

describe('automatic cleanup with fully excluded unused images', () => {
    beforeEach(() => {
        promptMock.mockReset();
        promptMock.mockResolvedValue(true);
        (CleanupReviewModal as unknown as ReturnType<typeof vi.fn>).mockClear();
        (Util.getUnusedAttachments as ReturnType<typeof vi.fn>).mockReset();
        (Util.getUnusedAttachments as ReturnType<typeof vi.fn>).mockResolvedValue({
            unusedAttachments: [],
            excludedAttachments: [excludedFile],
        });
        (Util.deleteFilesInTheList as ReturnType<typeof vi.fn>).mockReset();
        (Util.deleteFilesInTheList as ReturnType<typeof vi.fn>).mockResolvedValue({
            deletedImages: 0,
            skippedImages: 0,
            failedImages: 0,
            deletedParentFolderPaths: [],
            logLines: [],
        });
        (AttachmentFolders.planAttachmentFolders as ReturnType<typeof vi.fn>).mockReset();
        (AttachmentFolders.deleteReviewedAttachmentFolders as ReturnType<typeof vi.fn>).mockReset();
        (AttachmentFolders.planAttachmentFolders as ReturnType<typeof vi.fn>).mockResolvedValue({
            deletableFolders: [],
            protectedFolders: [],
            candidateFolderPaths: new Set<string>(),
            normalizedRules: [],
            parentFolderPaths: [],
        });
        (AttachmentFolders.deleteReviewedAttachmentFolders as ReturnType<typeof vi.fn>).mockResolvedValue({
            deletedFolders: 0,
            failedFolders: 0,
            skippedFolders: 0,
            deletedParentFolders: 0,
            failedParentFolders: 0,
            skippedParentFolders: 0,
            logLines: [],
        });
    });

    const createPlugin = (): OzanClearImages => {
        const plugin = new OzanClearImages(
            {} as ConstructorParameters<typeof OzanClearImages>[0],
            {} as ConstructorParameters<typeof OzanClearImages>[1]
        );
        plugin.app = {} as OzanClearImages['app'];
        plugin.settings = {} as OzanClearImages['settings'];
        return plugin;
    };

    it('does not open the review modal for automatic (non-interactive) runs', async () => {
        const plugin = createPlugin();

        await plugin.clearUnusedAttachments('image', { silentIfBusy: true, interactive: false });

        expect(CleanupReviewModal).not.toHaveBeenCalled();
        expect(plugin.cleanupInProgress).toBe(false);
    });

    it('does not block a subsequent periodic run after an automatic run finished', async () => {
        const plugin = createPlugin();

        await plugin.clearUnusedAttachments('image', { silentIfBusy: true, interactive: false });
        await plugin.clearUnusedAttachments('image', { silentIfBusy: true, interactive: false });

        expect(Util.getUnusedAttachments).toHaveBeenCalledTimes(2);
        expect(CleanupReviewModal).not.toHaveBeenCalled();
    });

    it('still opens the review modal for manual (interactive) runs', async () => {
        const plugin = createPlugin();

        await plugin.clearUnusedAttachments('image');

        expect(CleanupReviewModal).toHaveBeenCalledTimes(1);
        expect(promptMock).toHaveBeenCalledTimes(1);
    });

    it('never plans atomic folders during automatic cleanup', async () => {
        const plugin = createPlugin();
        plugin.settings.reviewImageFolderCleanup = false;
        plugin.settings.imageFolderRules = 'attachments';
        plugin.settings.attachmentFolderSuffixes = '.html';

        await plugin.clearUnusedAttachments('image', { interactive: false, origin: 'automatic' });
        await plugin.clearUnusedAttachments('all', { interactive: false, origin: 'automatic' });

        expect(AttachmentFolders.planAttachmentFolders).not.toHaveBeenCalled();
        expect(AttachmentFolders.deleteReviewedAttachmentFolders).not.toHaveBeenCalled();
        expect(Util.getUnusedAttachments).toHaveBeenNthCalledWith(
            1,
            plugin.app,
            'image',
            plugin,
            new Set<string>()
        );
    });

    it('keeps protected-only feedback when image-folder review is disabled', async () => {
        const plugin = createPlugin();
        plugin.settings.reviewImageFolderCleanup = false;

        await plugin.clearUnusedAttachments('image', { origin: 'manual' });

        expect(CleanupReviewModal).toHaveBeenCalledTimes(1);
        expect(Util.deleteFilesInTheList).not.toHaveBeenCalled();
        expect(AttachmentFolders.deleteReviewedAttachmentFolders).not.toHaveBeenCalled();
    });

    it('plans image folders only for a manual reviewed image cleanup', async () => {
        const plugin = createPlugin();
        plugin.settings.imageFolderRules = 'attachments';

        await plugin.clearUnusedAttachments('image', { origin: 'manual' });

        expect(AttachmentFolders.planAttachmentFolders).toHaveBeenCalledWith(
            plugin.app,
            plugin.settings,
            'image'
        );
        expect(CleanupReviewModal).toHaveBeenCalledTimes(1);
    });

    it('skips review but keeps the atomic image-folder pipeline when explicitly disabled', async () => {
        const plugin = createPlugin();
        plugin.settings.reviewImageFolderCleanup = false;
        plugin.settings.imageFolderRules = 'attachments';
        plugin.settings.clearEmptyFoldersAfterImageCleanup = true;
        const reviewedFolder = {
            path: 'attachments/Project A',
            matchedRule: 'parent path attachments',
            descendantPaths: ['attachments/Project A/drawing.svg'],
            fingerprint: 'file:attachments/Project A/drawing.svg:1:1',
            emptyParentPath: 'attachments',
        };
        (AttachmentFolders.planAttachmentFolders as ReturnType<typeof vi.fn>).mockResolvedValue({
            deletableFolders: [reviewedFolder],
            protectedFolders: [],
            candidateFolderPaths: new Set(['attachments/Project A']),
            normalizedRules: ['parent-path:attachments'],
            parentFolderPaths: ['attachments'],
        });

        await plugin.clearUnusedAttachments('image', { origin: 'manual' });

        expect(CleanupReviewModal).not.toHaveBeenCalled();
        expect(Util.getUnusedAttachments).toHaveBeenCalledWith(
            plugin.app,
            'image',
            plugin,
            new Set(['attachments/Project A'])
        );
        expect(AttachmentFolders.deleteReviewedAttachmentFolders).toHaveBeenCalledWith(
            plugin.app,
            plugin.settings,
            [reviewedFolder],
            ['parent-path:attachments'],
            ['attachments'],
            'image'
        );
    });

    it('keeps attachment cleanup review mandatory when image-folder review is disabled', async () => {
        const plugin = createPlugin();
        plugin.settings.reviewImageFolderCleanup = false;
        (Util.getUnusedAttachments as ReturnType<typeof vi.fn>).mockResolvedValue({
            unusedAttachments: [{ path: 'document.pdf' } as TFile],
            excludedAttachments: [],
        });
        promptMock.mockResolvedValue(false);

        await plugin.clearUnusedAttachments('all', { origin: 'manual' });

        expect(CleanupReviewModal).toHaveBeenCalledTimes(1);
        expect(Util.deleteFilesInTheList).not.toHaveBeenCalled();
        expect(AttachmentFolders.deleteReviewedAttachmentFolders).not.toHaveBeenCalled();
    });

    it('fails closed before deletion when review is disabled but image-folder rules are invalid', async () => {
        const plugin = createPlugin();
        plugin.settings.reviewImageFolderCleanup = false;
        plugin.settings.imageFolderRules = '**';
        (AttachmentFolders.planAttachmentFolders as ReturnType<typeof vi.fn>).mockResolvedValue({
            deletableFolders: [],
            protectedFolders: [],
            candidateFolderPaths: new Set<string>(),
            normalizedRules: [],
            parentFolderPaths: [],
            validationError: 'Invalid image folder rule.',
        });

        await plugin.clearUnusedAttachments('image', { origin: 'manual' });

        expect(Util.getUnusedAttachments).not.toHaveBeenCalled();
        expect(Util.deleteFilesInTheList).not.toHaveBeenCalled();
        expect(AttachmentFolders.deleteReviewedAttachmentFolders).not.toHaveBeenCalled();
    });

    it('deletes nothing when manual image-folder review is cancelled', async () => {
        const plugin = createPlugin();
        plugin.settings.imageFolderRules = 'attachments';
        (Util.getUnusedAttachments as ReturnType<typeof vi.fn>).mockResolvedValue({
            unusedAttachments: [{ path: 'loose.png' } as TFile],
            excludedAttachments: [],
        });
        (AttachmentFolders.planAttachmentFolders as ReturnType<typeof vi.fn>).mockResolvedValue({
            deletableFolders: [
                {
                    path: 'attachments/Project A',
                    matchedRule: 'parent path attachments',
                    descendantPaths: ['attachments/Project A/drawing.svg'],
                    fingerprint: 'file:attachments/Project A/drawing.svg:1:1',
                },
            ],
            protectedFolders: [],
            candidateFolderPaths: new Set(['attachments/Project A']),
            normalizedRules: ['parent-path:attachments'],
            parentFolderPaths: ['attachments'],
        });
        promptMock.mockResolvedValue(false);

        await plugin.clearUnusedAttachments('image', { origin: 'manual' });

        expect(Util.deleteFilesInTheList).not.toHaveBeenCalled();
        expect(AttachmentFolders.deleteReviewedAttachmentFolders).not.toHaveBeenCalled();
    });

    it('passes the accepted image-folder plan through classification and scoped revalidation', async () => {
        const plugin = createPlugin();
        plugin.settings.imageFolderRules = 'attachments';
        plugin.settings.clearEmptyFoldersAfterImageCleanup = true;
        const candidateFolderPaths = new Set(['attachments/Project A']);
        const reviewedFolder = {
            path: 'attachments/Project A',
            matchedRule: 'parent path attachments',
            descendantPaths: ['attachments/Project A/drawing.svg'],
            fingerprint: 'file:attachments/Project A/drawing.svg:1:1',
            emptyParentPath: 'attachments',
        };
        (AttachmentFolders.planAttachmentFolders as ReturnType<typeof vi.fn>).mockResolvedValue({
            deletableFolders: [reviewedFolder],
            protectedFolders: [],
            candidateFolderPaths,
            normalizedRules: ['parent-path:attachments'],
            parentFolderPaths: ['attachments'],
        });
        (Util.getUnusedAttachments as ReturnType<typeof vi.fn>).mockResolvedValue({
            unusedAttachments: [],
            excludedAttachments: [],
        });

        await plugin.clearUnusedAttachments('image', { origin: 'manual' });

        expect(Util.getUnusedAttachments).toHaveBeenCalledWith(
            plugin.app,
            'image',
            plugin,
            candidateFolderPaths
        );
        expect(AttachmentFolders.deleteReviewedAttachmentFolders).toHaveBeenCalledWith(
            plugin.app,
            plugin.settings,
            [reviewedFolder],
            ['parent-path:attachments'],
            ['attachments'],
            'image'
        );
    });

    it('reviews no image parent folders when empty-folder cleanup is disabled', async () => {
        const plugin = createPlugin();
        plugin.settings.imageFolderRules = 'attachments';
        const reviewedFolder = {
            path: 'attachments/Project A',
            matchedRule: 'parent path attachments',
            descendantPaths: ['attachments/Project A/drawing.svg'],
            fingerprint: 'file:attachments/Project A/drawing.svg:1:1',
            emptyParentPath: 'attachments',
        };
        (AttachmentFolders.planAttachmentFolders as ReturnType<typeof vi.fn>).mockResolvedValue({
            deletableFolders: [reviewedFolder],
            protectedFolders: [],
            candidateFolderPaths: new Set<string>(),
            normalizedRules: ['parent-path:attachments'],
            parentFolderPaths: ['attachments'],
        });
        (Util.getUnusedAttachments as ReturnType<typeof vi.fn>).mockResolvedValue({
            unusedAttachments: [{ path: 'loose.png' } as TFile],
            excludedAttachments: [],
        });

        await plugin.clearUnusedAttachments('image', { origin: 'manual' });

        expect(CleanupReviewModal).toHaveBeenCalledWith(
            plugin.app,
            expect.objectContaining({ emptyParentFolderPaths: [] })
        );
        expect(AttachmentFolders.deleteReviewedAttachmentFolders).toHaveBeenCalledWith(
            plugin.app,
            plugin.settings,
            [reviewedFolder],
            ['parent-path:attachments'],
            [],
            'image'
        );
    });

    it('does not expand reviewed image parent cleanup when the setting is enabled after review', async () => {
        const plugin = createPlugin();
        plugin.settings.imageFolderRules = 'attachments';
        const reviewedFolder = {
            path: 'attachments/Project A',
            matchedRule: 'parent path attachments',
            descendantPaths: ['attachments/Project A/drawing.svg'],
            fingerprint: 'file:attachments/Project A/drawing.svg:1:1',
            emptyParentPath: 'attachments',
        };
        (AttachmentFolders.planAttachmentFolders as ReturnType<typeof vi.fn>).mockResolvedValue({
            deletableFolders: [reviewedFolder],
            protectedFolders: [],
            candidateFolderPaths: new Set<string>(),
            normalizedRules: ['parent-path:attachments'],
            parentFolderPaths: ['attachments'],
        });
        (Util.getUnusedAttachments as ReturnType<typeof vi.fn>).mockResolvedValue({
            unusedAttachments: [{ path: 'loose.png' } as TFile],
            excludedAttachments: [],
        });
        promptMock.mockImplementation(async () => {
            plugin.settings.clearEmptyFoldersAfterImageCleanup = true;
            return true;
        });

        await plugin.clearUnusedAttachments('image', { origin: 'manual' });

        expect(AttachmentFolders.deleteReviewedAttachmentFolders).toHaveBeenCalledWith(
            plugin.app,
            plugin.settings,
            [reviewedFolder],
            ['parent-path:attachments'],
            [],
            'image'
        );
    });

    it('keeps attachment parent cleanup independent of the image empty-folder setting', async () => {
        const plugin = createPlugin();
        plugin.settings.attachmentFolderSuffixes = 'Attachments';
        const reviewedFolder = {
            path: 'Attachments/Project A',
            matchedRule: 'parent path Attachments',
            descendantPaths: ['Attachments/Project A/index.html'],
            fingerprint: 'file:Attachments/Project A/index.html:1:1',
            emptyParentPath: 'Attachments',
        };
        (AttachmentFolders.planAttachmentFolders as ReturnType<typeof vi.fn>).mockResolvedValue({
            deletableFolders: [reviewedFolder],
            protectedFolders: [],
            candidateFolderPaths: new Set(['Attachments/Project A']),
            normalizedRules: ['parent-path:Attachments'],
            parentFolderPaths: ['Attachments'],
        });
        (Util.getUnusedAttachments as ReturnType<typeof vi.fn>).mockResolvedValue({
            unusedAttachments: [],
            excludedAttachments: [],
        });

        await plugin.clearUnusedAttachments('all', { origin: 'manual' });

        expect(CleanupReviewModal).toHaveBeenCalledWith(
            plugin.app,
            expect.objectContaining({ emptyParentFolderPaths: ['Attachments'] })
        );
        expect(AttachmentFolders.deleteReviewedAttachmentFolders).toHaveBeenCalledWith(
            plugin.app,
            plugin.settings,
            [reviewedFolder],
            ['parent-path:Attachments'],
            ['Attachments'],
            'attachment'
        );
    });

    it('revokes reviewed image parent cleanup when the setting is disabled after review', async () => {
        const plugin = createPlugin();
        plugin.settings.imageFolderRules = 'attachments';
        plugin.settings.clearEmptyFoldersAfterImageCleanup = true;
        const reviewedFolder = {
            path: 'attachments/Project A',
            matchedRule: 'parent path attachments',
            descendantPaths: ['attachments/Project A/drawing.svg'],
            fingerprint: 'file:attachments/Project A/drawing.svg:1:1',
            emptyParentPath: 'attachments',
        };
        (AttachmentFolders.planAttachmentFolders as ReturnType<typeof vi.fn>).mockResolvedValue({
            deletableFolders: [reviewedFolder],
            protectedFolders: [],
            candidateFolderPaths: new Set(['attachments/Project A']),
            normalizedRules: ['parent-path:attachments'],
            parentFolderPaths: ['attachments'],
        });
        (Util.getUnusedAttachments as ReturnType<typeof vi.fn>).mockResolvedValue({
            unusedAttachments: [{ path: 'loose.png' } as TFile],
            excludedAttachments: [],
        });
        promptMock.mockImplementation(async () => {
            plugin.settings.clearEmptyFoldersAfterImageCleanup = false;
            return true;
        });

        await plugin.clearUnusedAttachments('image', { origin: 'manual' });

        expect(CleanupReviewModal).toHaveBeenCalledWith(
            plugin.app,
            expect.objectContaining({ emptyParentFolderPaths: ['attachments'] })
        );
        expect(AttachmentFolders.deleteReviewedAttachmentFolders).toHaveBeenCalledWith(
            plugin.app,
            plugin.settings,
            [reviewedFolder],
            ['parent-path:attachments'],
            ['attachments'],
            'image'
        );
    });
});
