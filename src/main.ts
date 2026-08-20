import { Notice, Plugin, TFolder } from 'obsidian';
import { OzanClearImagesSettingsTab } from './settings';
import { OzanClearImagesSettings, DEFAULT_SETTINGS, normalizeDeleteOption } from './settings';
import { LogsModal } from './modals';
import { CleanupReviewModal } from './reviewModal';
import * as Util from './util';
import { shouldClearEmptyFoldersAfterAttachmentCleanup } from './cleanupFlow';
import { createPeriodicCleanupScheduler, createVaultLoadCleanupScheduler } from './startupCleanup';
import {
    AttachmentFolderPlan,
    deleteReviewedAttachmentFolders,
    planAttachmentFolders,
} from './attachmentFolders';

interface FolderCleanupResult {
    deletedFolders: number;
    failedFolders: number;
    skippedFolders: number;
    foundFolders: number;
    cancelled: boolean;
    logLines: string[];
}

export default class OzanClearImages extends Plugin {
    settings: OzanClearImagesSettings;
    ribbonIconEl: HTMLElement | undefined = undefined;
    startupCleanupScheduled = false;
    periodicCleanupTimerId: number | undefined = undefined;
    periodicCleanupScheduler: ReturnType<typeof createPeriodicCleanupScheduler<number>> | undefined = undefined;
    cleanupInProgress = false;
    private vaultLayoutReady = false;
    private vaultMetadataResolved = false;
    private vaultReadyCallbacks: Array<() => void | Promise<void>> = [];
    private vaultReadyListenersRegistered = false;

    onload(): void {
        void this.initializePlugin();
    }

    private async initializePlugin(): Promise<void> {
        await this.loadSettings();
        this.addSettingTab(new OzanClearImagesSettingsTab(this.app, this));
        this.addCommand({
            id: 'clear-images-obsidian',
            name: 'Clear unused images',
            callback: () => {
                void this.clearUnusedAttachments('image');
            },
        });
        this.addCommand({
            id: 'clear-unused-attachments',
            name: 'Clear unused attachments',
            callback: () => {
                void this.clearUnusedAttachments('all');
            },
        });
        this.addCommand({
            id: 'clear-unused-folders',
            name: 'Clear unused folders',
            callback: () => {
                void this.clearUnusedFolders();
            },
        });
        this.refreshIconRibbon();
        this.scheduleVaultLoadCleanup();
        this.refreshPeriodicCleanup();
    }

    onunload() {
        this.clearPeriodicCleanupTimer();
    }

    async loadSettings() {
        const loadedSettings: unknown = await this.loadData();
        const settingsOverride = isSettingsOverride(loadedSettings) ? loadedSettings : {};
        this.settings = {
            ...DEFAULT_SETTINGS,
            ...settingsOverride,
            deleteOption: normalizeDeleteOption(settingsOverride.deleteOption),
        };
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    refreshIconRibbon = () => {
        this.ribbonIconEl?.remove();
        if (this.settings.ribbonIcon) {
            this.ribbonIconEl = this.addRibbonIcon('image-file', 'Clear unused images', (): void => {
                void this.clearUnusedAttachments('image');
            });
        }
    };

    scheduleVaultLoadCleanup(): void {
        if (this.startupCleanupScheduled) {
            return;
        }

        this.startupCleanupScheduled = true;
        const scheduleCleanup = createVaultLoadCleanupScheduler(
            (callback) => this.onVaultReady(callback),
            async (type) => {
                await this.clearUnusedAttachments(type, { silentIfBusy: true, interactive: false });
            }
        );

        void scheduleCleanup(this.settings.autoCleanOnVaultLoad);
    }

    refreshPeriodicCleanup(): void {
        if (!this.periodicCleanupScheduler) {
            this.periodicCleanupScheduler = createPeriodicCleanupScheduler<number>(
                (callback) => this.onVaultReady(callback),
                (callback, intervalMs) => {
                    this.clearPeriodicCleanupTimer();
                    const timerId = window.setInterval(callback, intervalMs);
                    this.periodicCleanupTimerId = timerId;
                    return timerId;
                },
                (timerId) => {
                    window.clearInterval(timerId);
                    if (this.periodicCleanupTimerId === timerId) {
                        this.periodicCleanupTimerId = undefined;
                    }
                },
                async (type) => {
                    await this.clearUnusedAttachments(type, { silentIfBusy: true, interactive: false });
                }
            );
        }

        this.periodicCleanupScheduler({
            enabled: this.settings.autoCleanEveryXMinutes,
            intervalMinutes: this.settings.autoCleanIntervalMinutes,
            canRunCleanup: () => true,
        });
    }

    onVaultReady(callback: () => void | Promise<void>): void {
        this.ensureVaultReadyListeners();

        if (this.vaultLayoutReady && this.vaultMetadataResolved) {
            void callback();
            return;
        }

        this.vaultReadyCallbacks.push(callback);
    }

    private ensureVaultReadyListeners(): void {
        if (this.vaultReadyListenersRegistered) {
            return;
        }

        this.vaultReadyListenersRegistered = true;
        this.vaultLayoutReady = this.app.workspace.layoutReady;
        this.vaultMetadataResolved = Object.keys(this.app.metadataCache.resolvedLinks).length > 0;

        this.app.workspace.onLayoutReady(() => {
            this.vaultLayoutReady = true;
            this.flushVaultReadyCallbacks();
        });

        this.registerEvent(
            this.app.metadataCache.on('resolved', () => {
                this.vaultMetadataResolved = true;
                this.flushVaultReadyCallbacks();
            })
        );

        this.flushVaultReadyCallbacks();
    }

    private flushVaultReadyCallbacks(): void {
        if (!this.vaultLayoutReady || !this.vaultMetadataResolved || this.vaultReadyCallbacks.length === 0) {
            return;
        }

        const callbacks = this.vaultReadyCallbacks.splice(0, this.vaultReadyCallbacks.length);
        for (const callback of callbacks) {
            void callback();
        }
    }

    clearPeriodicCleanupTimer(): void {
        if (this.periodicCleanupTimerId !== undefined) {
            window.clearInterval(this.periodicCleanupTimerId);
            this.periodicCleanupTimerId = undefined;
        }
    }

    // Compare Used Images with all images and return unused ones
    clearUnusedAttachments = async (
        type: 'all' | 'image',
        options: { silentIfBusy?: boolean; interactive?: boolean } = {}
    ) => {
        const interactive = options.interactive ?? true;
        if (this.cleanupInProgress) {
            if (!options.silentIfBusy) {
                new Notice('Cleanup is already running.');
            }
            return;
        }

        this.cleanupInProgress = true;
        try {
            let attachmentFolderPlan: AttachmentFolderPlan = {
                deletableFolders: [],
                protectedFolders: [],
                candidateFolderPaths: new Set<string>(),
                normalizedRules: [],
                parentFolderPaths: [],
            };
            if (type === 'all' && interactive && (this.settings.attachmentFolderSuffixes ?? '').trim() !== '') {
                attachmentFolderPlan = await planAttachmentFolders(this.app, this.settings);
                if (attachmentFolderPlan.validationError) {
                    new Notice(attachmentFolderPlan.validationError);
                    return;
                }
            }

            const { unusedAttachments, excludedAttachments } = await Util.getUnusedAttachments(
                this.app,
                type,
                this,
                attachmentFolderPlan.candidateFolderPaths
            );
            const deletableItemCount = unusedAttachments.length + attachmentFolderPlan.deletableFolders.length;
            const protectedItemCount = excludedAttachments.length + attachmentFolderPlan.protectedFolders.length;
            if (deletableItemCount > 0) {
                if (type === 'all' && interactive) {
                    const reviewAccepted = await new CleanupReviewModal(this.app, {
                        filePaths: unusedAttachments.map((file) => file.path),
                        folderItems: attachmentFolderPlan.deletableFolders,
                        emptyParentFolderPaths: attachmentFolderPlan.parentFolderPaths,
                        excludedFilePaths: excludedAttachments.map((file) => file.path),
                        protectedFolderItems: attachmentFolderPlan.protectedFolders,
                    }).prompt();
                    if (!reviewAccepted) {
                        new Notice('Cleanup cancelled.');
                        return;
                    }
                }

                let logs: string[] = [];
                logs.push(`[+] ${Util.getFormattedDate()}: Clearing started.`);

                const { deletedImages, skippedImages, failedImages, deletedParentFolderPaths, logLines } =
                    await Util.deleteFilesInTheList(unusedAttachments, this, this.app);

                logs.push(...logLines);
                logs.push(`[+] ${deletedImages.toString()} ${type === 'image' ? 'image(s)' : 'attachment(s)'} deleted.`);
                if (skippedImages > 0) {
                    logs.push(`[=] ${skippedImages.toString()} excluded file(s) skipped.`);
                }
                if (failedImages > 0) {
                    logs.push(`[!] ${failedImages.toString()} file(s) failed to delete.`);
                }

                const attachmentFolderDeletionResult =
                    type === 'all' && interactive && attachmentFolderPlan.deletableFolders.length > 0
                        ? await deleteReviewedAttachmentFolders(
                              this.app,
                              this.settings,
                              attachmentFolderPlan.deletableFolders,
                              attachmentFolderPlan.normalizedRules,
                              attachmentFolderPlan.parentFolderPaths
                          )
                        : {
                              deletedFolders: 0,
                              failedFolders: 0,
                              skippedFolders: 0,
                              deletedParentFolders: 0,
                              failedParentFolders: 0,
                              skippedParentFolders: 0,
                              logLines: [],
                          };
                logs.push(...attachmentFolderDeletionResult.logLines);
                if (attachmentFolderDeletionResult.deletedFolders > 0) {
                    logs.push(
                        `[+] ${attachmentFolderDeletionResult.deletedFolders.toString()} attachment folder(s) deleted.`
                    );
                }
                if (attachmentFolderDeletionResult.skippedFolders > 0) {
                    logs.push(
                        `[=] ${attachmentFolderDeletionResult.skippedFolders.toString()} attachment folder(s) changed or became protected after review.`
                    );
                }
                if (attachmentFolderDeletionResult.failedFolders > 0) {
                    logs.push(
                        `[!] ${attachmentFolderDeletionResult.failedFolders.toString()} attachment folder(s) failed to delete.`
                    );
                }
                if (attachmentFolderDeletionResult.deletedParentFolders > 0) {
                    logs.push(
                        `[+] ${attachmentFolderDeletionResult.deletedParentFolders.toString()} empty attachment parent folder(s) deleted.`
                    );
                }
                if (attachmentFolderDeletionResult.skippedParentFolders > 0) {
                    logs.push(
                        `[=] ${attachmentFolderDeletionResult.skippedParentFolders.toString()} attachment parent folder(s) kept after revalidation.`
                    );
                }
                if (attachmentFolderDeletionResult.failedParentFolders > 0) {
                    logs.push(
                        `[!] ${attachmentFolderDeletionResult.failedParentFolders.toString()} empty attachment parent folder(s) failed to delete.`
                    );
                }

                let folderCleanupResult: FolderCleanupResult | null = null;
                if (
                    shouldClearEmptyFoldersAfterAttachmentCleanup({
                        cleanupType: type,
                        deletedFiles: deletedImages,
                        clearEmptyFoldersAfterImageCleanup: this.settings.clearEmptyFoldersAfterImageCleanup,
                    })
                ) {
                    folderCleanupResult = await this.deleteUnusedFolders({
                        candidateFolderPaths: new Set(deletedParentFolderPaths),
                    });
                    logs.push(...folderCleanupResult.logLines);
                }

                logs.push(`[+] ${Util.getFormattedDate()}: Clearing completed.`);

                const deletionErrors =
                    failedImages +
                    attachmentFolderDeletionResult.failedFolders +
                    attachmentFolderDeletionResult.failedParentFolders;
                if (deletionErrors > 0) {
                    new Notice(`Cleanup finished with ${deletionErrors.toString()} deletion error(s). Check logs.`);
                } else if (
                    attachmentFolderDeletionResult.skippedFolders > 0 ||
                    attachmentFolderDeletionResult.skippedParentFolders > 0
                ) {
                    new Notice(
                        'Cleanup finished, but an attachment folder or its parent was kept after revalidation. Check logs and rerun cleanup.'
                    );
                } else if (folderCleanupResult?.failedFolders) {
                    new Notice(
                        `Image cleanup finished with ${folderCleanupResult.failedFolders.toString()} folder deletion error(s). Check logs.`
                    );
                } else if (
                    deletedImages > 0 ||
                    attachmentFolderDeletionResult.deletedFolders > 0 ||
                    attachmentFolderDeletionResult.deletedParentFolders > 0
                ) {
                    const folderNotice =
                        folderCleanupResult && folderCleanupResult.deletedFolders > 0
                            ? ` and ${folderCleanupResult.deletedFolders.toString()} empty folder(s)`
                            : '';
                    const attachmentFolderNotice =
                        attachmentFolderDeletionResult.deletedFolders > 0
                            ? ` and ${attachmentFolderDeletionResult.deletedFolders.toString()} attachment folder(s)`
                            : '';
                    const attachmentParentNotice =
                        attachmentFolderDeletionResult.deletedParentFolders > 0
                            ? ` and ${attachmentFolderDeletionResult.deletedParentFolders.toString()} empty attachment parent folder(s)`
                            : '';
                    new Notice(
                        `Deleted ${deletedImages.toString()} unused ${
                            type === 'image' ? 'image(s)' : 'attachment(s)'
                        }${attachmentFolderNotice}${attachmentParentNotice}${folderNotice}.`
                    );
                }

                if (
                    this.settings.logsModal ||
                    deletionErrors > 0 ||
                    attachmentFolderDeletionResult.skippedFolders > 0 ||
                    attachmentFolderDeletionResult.skippedParentFolders > 0 ||
                    (folderCleanupResult?.failedFolders ?? 0) > 0
                ) {
                    const modal = new LogsModal(logs, this.app);
                    modal.open();
                }
            } else if (protectedItemCount > 0) {
                new Notice(
                    `All unused ${
                        type === 'image' ? 'images' : 'attachments'
                    } are protected by your exclusions or folder safety checks. Nothing was deleted.`
                );

                if (interactive) {
                    await new CleanupReviewModal(this.app, {
                        filePaths: [],
                        folderItems: [],
                        excludedFilePaths: excludedAttachments.map((file) => file.path),
                        protectedFolderItems: attachmentFolderPlan.protectedFolders,
                    }).prompt();
                }
            } else {
                new Notice(`All ${type === 'image' ? 'images' : 'attachments'} are used. Nothing was deleted.`);
            }
        } catch (error) {
            console.error('Clear unused attachments failed.', error);
            new Notice(`Cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            this.cleanupInProgress = false;
        }
    };

    private deleteUnusedFolders = async (options: { candidateFolderPaths?: ReadonlySet<string> } = {}): Promise<FolderCleanupResult> => {
        const { unusedFolders, skippedFolders }: { unusedFolders: TFolder[]; skippedFolders: TFolder[] } =
            options.candidateFolderPaths
                ? Util.getUnusedFoldersFromDeletedFileParents(this.app, this, options.candidateFolderPaths)
                : Util.getUnusedFolders(this.app, this);
        const len = unusedFolders.length;

        if (len === 0) {
            const noFoldersMessage = options.candidateFolderPaths
                ? '[=] No empty folders from deleted images found. No folders were deleted.'
                : '[=] No empty folders found. No folders were deleted.';
            return {
                deletedFolders: 0,
                failedFolders: 0,
                skippedFolders: skippedFolders.length,
                foundFolders: 0,
                cancelled: false,
                logLines:
                    skippedFolders.length > 0
                        ? ['[=] Only excluded empty folders were found. No folders were deleted.']
                        : [noFoldersMessage],
            };
        }

        const logs: string[] = [];
        logs.push(`[+] ${Util.getFormattedDate()}: Folder clearing started.`);
        for (const folder of skippedFolders) {
            logs.push(`[=] Skipped excluded folder: ${folder.path}`);
        }

        const { deletedFolders, failedFolders, logLines } = await Util.deleteFoldersInTheList(
            unusedFolders,
            this,
            this.app
        );

        logs.push(...logLines);
        logs.push(`[+] ${deletedFolders.toString()} empty folder(s) deleted.`);
        if (skippedFolders.length > 0) {
            logs.push(`[=] ${skippedFolders.length.toString()} excluded folder(s) skipped.`);
        }
        if (failedFolders > 0) {
            logs.push(`[!] ${failedFolders.toString()} folder(s) failed to delete.`);
        }
        logs.push(`[+] ${Util.getFormattedDate()}: Folder clearing completed.`);

        return {
            deletedFolders,
            failedFolders,
            skippedFolders: skippedFolders.length,
            foundFolders: len,
            cancelled: false,
            logLines: logs,
        };
    };

    clearUnusedFolders = async (options: { silentIfBusy?: boolean } = {}) => {
        if (this.cleanupInProgress) {
            if (!options.silentIfBusy) {
                new Notice('Cleanup is already running.');
            }
            return;
        }

        this.cleanupInProgress = true;
        try {
            const result = await this.deleteUnusedFolders();

            if (result.cancelled) {
                return;
            }

            if (result.foundFolders > 0) {
                if (result.failedFolders > 0) {
                    new Notice(
                        `Folder cleanup finished with ${result.failedFolders.toString()} deletion error(s). Check logs.`
                    );
                } else if (result.deletedFolders > 0) {
                    new Notice(`Deleted ${result.deletedFolders.toString()} empty folder(s).`);
                }

                if (this.settings.logsModal || result.failedFolders > 0) {
                    const modal = new LogsModal(result.logLines, this.app);
                    modal.open();
                }
            } else if (result.skippedFolders > 0) {
                new Notice('Only excluded empty folders were found. Nothing was deleted.');
            } else {
                new Notice('No empty folders found. Nothing was deleted.');
            }
        } catch (error) {
            console.error('Clear unused folders failed.', error);
            new Notice(`Folder cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            this.cleanupInProgress = false;
        }
    };

}

const isSettingsOverride = (value: unknown): value is Partial<OzanClearImagesSettings> => {
    return typeof value === 'object' && value !== null;
};
