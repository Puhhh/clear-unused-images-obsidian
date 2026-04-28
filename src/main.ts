import { Plugin, TFile, Notice } from 'obsidian';
import { OzanClearImagesSettingsTab } from './settings';
import { OzanClearImagesSettings, DEFAULT_SETTINGS } from './settings';
import { LogsModal } from './modals';
import * as Util from './util';
import { createPeriodicCleanupScheduler, createVaultLoadCleanupScheduler } from './startupCleanup';

export default class OzanClearImages extends Plugin {
    settings: OzanClearImagesSettings;
    ribbonIconEl: HTMLElement | undefined = undefined;
    startupCleanupScheduled = false;
    periodicCleanupTimerId: number | undefined = undefined;
    periodicCleanupScheduler: ReturnType<typeof createPeriodicCleanupScheduler<number>> | undefined = undefined;
    cleanupInProgress = false;

    async onload() {
        console.log('Clear Unused Images plugin loaded...');
        this.addSettingTab(new OzanClearImagesSettingsTab(this.app, this));
        await this.loadSettings();
        this.addCommand({
            id: 'clear-images-obsidian',
            name: 'Clear Unused Images',
            callback: () => this.clearUnusedAttachments('image'),
        });
        this.addCommand({
            id: 'clear-unused-attachments',
            name: 'Clear Unused Attachments',
            callback: () => this.clearUnusedAttachments('all'),
        });
        this.refreshIconRibbon();
        this.scheduleVaultLoadCleanup();
        this.refreshPeriodicCleanup();
    }

    onunload() {
        this.clearPeriodicCleanupTimer();
        console.log('Clear Unused Images plugin unloaded...');
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    refreshIconRibbon = () => {
        this.ribbonIconEl?.remove();
        if (this.settings.ribbonIcon) {
            this.ribbonIconEl = this.addRibbonIcon('image-file', 'Clear Unused Images', (event): void => {
                this.clearUnusedAttachments('image');
            });
        }
    };

    scheduleVaultLoadCleanup(): void {
        if (this.startupCleanupScheduled) {
            return;
        }

        this.startupCleanupScheduled = true;
        const scheduleCleanup = createVaultLoadCleanupScheduler(
            (callback) => {
                this.app.workspace.onLayoutReady(() => {
                    void callback();
                });
            },
            async (type) => {
                await this.clearUnusedAttachments(type);
            }
        );

        void scheduleCleanup(this.settings.autoCleanOnVaultLoad);
    }

    refreshPeriodicCleanup(): void {
        if (!this.periodicCleanupScheduler) {
            this.periodicCleanupScheduler = createPeriodicCleanupScheduler<number>(
                (callback) => {
                    this.app.workspace.onLayoutReady(callback);
                },
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
                    await this.clearUnusedAttachments(type, { silentIfBusy: true });
                }
            );
        }

        this.periodicCleanupScheduler({
            enabled: this.settings.autoCleanEveryXMinutes,
            intervalMinutes: this.settings.autoCleanIntervalMinutes,
            canRunCleanup: () => {
                if (this.settings.deleteOption === 'permanent') {
                    return false;
                }

                return true;
            },
        });

        if (this.settings.autoCleanEveryXMinutes && this.settings.deleteOption === 'permanent') {
            new Notice('Periodic cleanup is disabled while Permanently Delete is selected.');
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
        options: { silentIfBusy?: boolean } = {}
    ) => {
        if (this.cleanupInProgress) {
            if (!options.silentIfBusy) {
                new Notice('Cleanup is already running.');
            }
            return;
        }

        this.cleanupInProgress = true;
        try {
            var unusedAttachments: TFile[] = await Util.getUnusedAttachments(this.app, type);
            var len = unusedAttachments.length;
            if (len > 0) {
                if (this.settings.deleteOption === 'permanent' && !this.confirmPermanentDelete(len, type)) {
                    new Notice('Cleanup cancelled.');
                    return;
                }

                let logs: string[] = [];
                logs.push(`[+] ${Util.getFormattedDate()}: Clearing started.`);

                const { deletedImages, skippedImages, failedImages, logLines } = await Util.deleteFilesInTheList(
                    unusedAttachments,
                    this,
                    this.app
                );

                logs.push(...logLines);
                logs.push(`[+] ${deletedImages.toString()} ${type === 'image' ? 'image(s)' : 'attachment(s)'} deleted.`);
                if (skippedImages > 0) {
                    logs.push(`[=] ${skippedImages.toString()} excluded file(s) skipped.`);
                }
                if (failedImages > 0) {
                    logs.push(`[!] ${failedImages.toString()} file(s) failed to delete.`);
                }
                logs.push(`[+] ${Util.getFormattedDate()}: Clearing completed.`);

                if (failedImages > 0) {
                    new Notice(`Cleanup finished with ${failedImages.toString()} deletion error(s). Check logs.`);
                } else if (deletedImages > 0) {
                    new Notice(`Deleted ${deletedImages.toString()} unused ${type === 'image' ? 'image(s)' : 'attachment(s)'}.`);
                }

                if (this.settings.logsModal || failedImages > 0) {
                    let modal = new LogsModal(logs, this.app);
                    modal.open();
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

    confirmPermanentDelete(len: number, type: 'all' | 'image'): boolean {
        if (typeof globalThis.confirm !== 'function') {
            return false;
        }

        return globalThis.confirm(
            `Permanently delete ${len.toString()} unused ${type === 'image' ? 'image(s)' : 'attachment(s)'}? This cannot be undone.`
        );
    }
}
