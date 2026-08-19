import type OzanClearImages from './main';
import { PluginSettingTab, Setting } from 'obsidian';
import type { App, SettingDefinitionItem } from 'obsidian';
import {
    AUTO_CLEAN_EVERY_X_MINUTES_DEFAULT,
    AUTO_CLEAN_INTERVAL_MINUTES_DEFAULT,
    AUTO_CLEAN_ON_VAULT_LOAD_DEFAULT,
    normalizeAutoCleanIntervalMinutes,
} from './startupCleanup';

export interface OzanClearImagesSettings {
    deleteOption: DeleteOption;
    logsModal: boolean;
    excludedFolders: string;
    excludedExtensions: string;
    ribbonIcon: boolean;
    excludeSubfolders: boolean;
    autoCleanOnVaultLoad: boolean;
    autoCleanEveryXMinutes: boolean;
    autoCleanIntervalMinutes: number;
    clearEmptyFoldersAfterImageCleanup: boolean;
    attachmentFolderSuffixes: string;
}

export type DeleteOption = 'trash';

export const normalizeDeleteOption = (deleteOption: unknown): DeleteOption => {
    if (deleteOption === '.trash' || deleteOption === 'system-trash' || deleteOption === 'permanent') {
        return 'trash';
    }

    return 'trash';
};

export const DEFAULT_SETTINGS: OzanClearImagesSettings = {
    deleteOption: 'trash',
    logsModal: true,
    excludedFolders: '',
    excludedExtensions: '',
    ribbonIcon: false,
    excludeSubfolders: false,
    autoCleanOnVaultLoad: AUTO_CLEAN_ON_VAULT_LOAD_DEFAULT,
    autoCleanEveryXMinutes: AUTO_CLEAN_EVERY_X_MINUTES_DEFAULT,
    autoCleanIntervalMinutes: AUTO_CLEAN_INTERVAL_MINUTES_DEFAULT,
    clearEmptyFoldersAfterImageCleanup: false,
    attachmentFolderSuffixes: '',
};

type SettingsControlKey = Exclude<keyof OzanClearImagesSettings, 'deleteOption'>;

export class OzanClearImagesSettingsTab extends PluginSettingTab {
    plugin: OzanClearImages;

    constructor(app: App, plugin: OzanClearImages) {
        super(app, plugin);
        this.plugin = plugin;
    }

    getSettingDefinitions(): SettingDefinitionItem<SettingsControlKey>[] {
        return [
            {
                type: 'group',
                heading: 'Behavior',
                items: [
                    {
                        name: 'Ribbon icon',
                        desc: 'Turn on if you want ribbon icon for clearing the images.',
                        aliases: ['toolbar', 'sidebar'],
                        control: {
                            type: 'toggle',
                            key: 'ribbonIcon',
                        },
                    },
                    {
                        name: 'Delete logs',
                        desc: 'Turn off if you dont want to view the delete logs modal to pop up after deletion is completed. It wont appear if no image is deleted',
                        aliases: ['cleanup results', 'deletion report'],
                        control: {
                            type: 'toggle',
                            key: 'logsModal',
                        },
                    },
                    {
                        name: 'Clean images on vault load',
                        desc: 'Automatically run the unused image cleanup once after the vault layout is ready. Cleanup runs without review and moves unused images to Obsidian-configured trash. This setting starts working on the next vault load.',
                        aliases: ['startup cleanup', 'automatic cleanup'],
                        control: {
                            type: 'toggle',
                            key: 'autoCleanOnVaultLoad',
                        },
                    },
                    {
                        name: 'Clean images every X minutes',
                        desc: 'Automatically run the unused image cleanup every X minutes while Obsidian stays open. Cleanup runs without review and moves unused images to Obsidian-configured trash. The timer starts after the vault layout is ready and waits for the full interval before the first run.',
                        aliases: ['periodic cleanup', 'automatic cleanup', 'timer'],
                        control: {
                            type: 'toggle',
                            key: 'autoCleanEveryXMinutes',
                        },
                    },
                    {
                        name: 'Clear empty folders after image cleanup',
                        desc: 'After unused images are deleted, also remove folders that became empty. This applies to manual and automatic image cleanup.',
                        aliases: ['delete empty folders', 'folder cleanup'],
                        control: {
                            type: 'toggle',
                            key: 'clearEmptyFoldersAfterImageCleanup',
                        },
                    },
                    {
                        name: 'Cleanup interval in minutes',
                        desc: 'Choose how many minutes the plugin waits between automatic image cleanup runs. Minimum: 1 minute.',
                        aliases: ['periodic cleanup frequency', 'timer'],
                        control: {
                            type: 'number',
                            key: 'autoCleanIntervalMinutes',
                            defaultValue: AUTO_CLEAN_INTERVAL_MINUTES_DEFAULT,
                            min: 1,
                            step: 1,
                        },
                    },
                    {
                        name: 'Attachment folder suffixes',
                        desc: 'Treat folders ending with these literal suffixes as atomic attachments during manual clear unused attachments. Use comma-separated values beginning with a dot, such as .HTML, .Excalidraw. A folder is kept if any outside note or canvas references a descendant, or if it intersects an exclusion.',
                        aliases: ['folder attachments', 'atomic folders', 'folder suffixes'],
                        control: {
                            type: 'textarea',
                            key: 'attachmentFolderSuffixes',
                            placeholder: 'Suffixes, e.g. .HTML, .Excalidraw',
                        },
                    },
                    {
                        name: 'Excluded folder full paths',
                        desc: 'Provide the full path of the folder names (case sensitive) divided by comma (,) to be excluded from clearing. I.e. For images under personal/files/puhhh -> personal/files/puhhh should be used for exclusion',
                        aliases: ['protected folders', 'ignored folders'],
                        control: {
                            type: 'textarea',
                            key: 'excludedFolders',
                        },
                    },
                    {
                        name: 'Exclude subfolders',
                        desc: 'Turn on this option if you want to also exclude all subfolders of the folder paths provided above.',
                        aliases: ['protected subfolders', 'ignored subfolders'],
                        control: {
                            type: 'toggle',
                            key: 'excludeSubfolders',
                        },
                    },
                    {
                        name: 'Excluded file extensions',
                        desc: 'Provide file extensions divided by comma (,) to be excluded from clearing (case insensitive). I.e. pdf, mp4 will keep all .pdf and .mp4 files even when they are not attached to any note. This is useful for files you store in the vault but never link, such as PDFs viewed in Obsidian.',
                        aliases: ['protected file types', 'ignored extensions'],
                        control: {
                            type: 'textarea',
                            key: 'excludedExtensions',
                            placeholder: 'Extensions, e.g. PDF, mp4',
                        },
                    },
                ],
            },
        ];
    }

    async setControlValue(key: string, value: unknown): Promise<void> {
        switch (key) {
            case 'ribbonIcon':
            case 'logsModal':
            case 'autoCleanOnVaultLoad':
            case 'autoCleanEveryXMinutes':
            case 'clearEmptyFoldersAfterImageCleanup':
            case 'excludeSubfolders':
                if (typeof value !== 'boolean') {
                    return;
                }
                this.plugin.settings[key] = value;
                break;
            case 'excludedFolders':
            case 'excludedExtensions':
            case 'attachmentFolderSuffixes':
                if (typeof value !== 'string') {
                    return;
                }
                this.plugin.settings[key] = value;
                break;
            case 'autoCleanIntervalMinutes':
                if (typeof value !== 'number') {
                    return;
                }
                this.plugin.settings.autoCleanIntervalMinutes = normalizeAutoCleanIntervalMinutes(value);
                break;
            default:
                return;
        }

        await this.plugin.saveSettings();

        if (key === 'ribbonIcon') {
            this.plugin.refreshIconRibbon();
        }
        if (key === 'autoCleanEveryXMinutes' || key === 'autoCleanIntervalMinutes') {
            this.plugin.refreshPeriodicCleanup();
        }
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl).setName('Behavior').setHeading();

        new Setting(containerEl)
            .setName('Ribbon icon')
            .setDesc('Turn on if you want ribbon icon for clearing the images.')
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.ribbonIcon).onChange((value) => {
                    this.plugin.settings.ribbonIcon = value;
                    void this.plugin.saveSettings();
                    this.plugin.refreshIconRibbon();
                })
            );

        new Setting(containerEl)
            .setName('Delete logs')
            .setDesc(
                'Turn off if you dont want to view the delete logs modal to pop up after deletion is completed. It wont appear if no image is deleted'
            )
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.logsModal).onChange((value) => {
                    this.plugin.settings.logsModal = value;
                    void this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName('Clean images on vault load')
            .setDesc(
                'Automatically run the unused image cleanup once after the vault layout is ready. Cleanup runs without review and moves unused images to Obsidian-configured trash. This setting starts working on the next vault load.'
            )
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.autoCleanOnVaultLoad).onChange((value) => {
                    this.plugin.settings.autoCleanOnVaultLoad = value;
                    void this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName('Clean images every X minutes')
            .setDesc(
                'Automatically run the unused image cleanup every X minutes while Obsidian stays open. Cleanup runs without review and moves unused images to Obsidian-configured trash. The timer starts after the vault layout is ready and waits for the full interval before the first run.'
            )
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.autoCleanEveryXMinutes).onChange(async (value) => {
                    this.plugin.settings.autoCleanEveryXMinutes = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshPeriodicCleanup();
                })
            );

        new Setting(containerEl)
            .setName('Clear empty folders after image cleanup')
            .setDesc('After unused images are deleted, also remove folders that became empty. This applies to manual and automatic image cleanup.')
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.clearEmptyFoldersAfterImageCleanup).onChange((value) => {
                    this.plugin.settings.clearEmptyFoldersAfterImageCleanup = value;
                    void this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName('Cleanup interval in minutes')
            .setDesc('Choose how many minutes the plugin waits between automatic image cleanup runs. Minimum: 1 minute.')
            .addText((text) =>
                text
                    .setPlaceholder(AUTO_CLEAN_INTERVAL_MINUTES_DEFAULT.toString())
                    .setValue(this.plugin.settings.autoCleanIntervalMinutes.toString())
                    .onChange(async (value) => {
                        const normalizedInterval = normalizeAutoCleanIntervalMinutes(value);
                        this.plugin.settings.autoCleanIntervalMinutes = normalizedInterval;
                        await this.plugin.saveSettings();
                        if (value !== normalizedInterval.toString()) {
                            text.setValue(normalizedInterval.toString());
                        }
                        this.plugin.refreshPeriodicCleanup();
                    })
            );

        new Setting(containerEl)
            .setName('Attachment folder suffixes')
            .setDesc(
                'Treat folders ending with these literal suffixes as atomic attachments during manual clear unused attachments. Enter comma-separated values beginning with a dot, such as .HTML, .Excalidraw. The review dialog always shows folders before they are moved to trash.'
            )
            .addTextArea((text) =>
                text
                    .setPlaceholder('Suffixes, e.g. .HTML, .Excalidraw')
                    .setValue(this.plugin.settings.attachmentFolderSuffixes)
                    .onChange((value) => {
                        this.plugin.settings.attachmentFolderSuffixes = value;
                        void this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Excluded folder full paths')
            .setDesc(
                `Provide the full path of the folder names (case sensitive) divided by comma (,) to be excluded from clearing.
					I.e. For images under personal/files/puhhh -> personal/files/puhhh should be used for exclusion`
            )
            .addTextArea((text) =>
                text.setValue(this.plugin.settings.excludedFolders).onChange((value) => {
                    this.plugin.settings.excludedFolders = value;
                    void this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName('Exclude subfolders')
            .setDesc('Turn on this option if you want to also exclude all subfolders of the folder paths provided above.')
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.excludeSubfolders).onChange((value) => {
                    this.plugin.settings.excludeSubfolders = value;
                    void this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName('Excluded file extensions')
            .setDesc(
                `Provide file extensions divided by comma (,) to be excluded from clearing (case insensitive).
						I.e. pdf, mp4 will keep all .pdf and .mp4 files even when they are not attached to any note.
						This is useful for files you store in the vault but never link, such as PDFs viewed in Obsidian.`
            )
            .addTextArea((text) =>
                text
                    .setPlaceholder('Extensions, e.g. PDF, mp4')
                    .setValue(this.plugin.settings.excludedExtensions)
                    .onChange((value) => {
                        this.plugin.settings.excludedExtensions = value;
                        void this.plugin.saveSettings();
                    })
            );
    }
}
