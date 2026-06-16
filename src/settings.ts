import type OzanClearImages from './main';
import { PluginSettingTab, Setting, App } from 'obsidian';
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
    ribbonIcon: boolean;
    excludeSubfolders: boolean;
    autoCleanOnVaultLoad: boolean;
    autoCleanEveryXMinutes: boolean;
    autoCleanIntervalMinutes: number;
    clearEmptyFoldersAfterImageCleanup: boolean;
}

export type DeleteOption = 'trash' | 'permanent';

export const normalizeDeleteOption = (deleteOption: unknown): DeleteOption => {
    if (deleteOption === '.trash' || deleteOption === 'system-trash') {
        return 'trash';
    }

    if (deleteOption === 'permanent') {
        return 'permanent';
    }

    return 'trash';
};

export const DEFAULT_SETTINGS: OzanClearImagesSettings = {
    deleteOption: 'trash',
    logsModal: true,
    excludedFolders: '',
    ribbonIcon: false,
    excludeSubfolders: false,
    autoCleanOnVaultLoad: AUTO_CLEAN_ON_VAULT_LOAD_DEFAULT,
    autoCleanEveryXMinutes: AUTO_CLEAN_EVERY_X_MINUTES_DEFAULT,
    autoCleanIntervalMinutes: AUTO_CLEAN_INTERVAL_MINUTES_DEFAULT,
    clearEmptyFoldersAfterImageCleanup: false,
};

export class OzanClearImagesSettingsTab extends PluginSettingTab {
    plugin: OzanClearImages;

    constructor(app: App, plugin: OzanClearImages) {
        super(app, plugin);
        this.plugin = plugin;
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
                'Automatically run the unused image cleanup once after the vault layout is ready. This setting only applies to images and starts working on the next vault load. Permanent delete will still ask for confirmation.'
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
                'Automatically run the unused image cleanup every X minutes while Obsidian stays open. The timer starts after the vault layout is ready, waits for the full interval before the first run, and does not run when permanently delete is selected.'
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
            .setName('Deleted file mode')
            .setDesc('Select whether deleted files follow Obsidian trash settings or are permanently deleted.')
            .addDropdown((dropdown) => {
                dropdown.addOption('trash', 'Move to Obsidian-configured trash');
                dropdown.addOption('permanent', 'Delete permanently');
                dropdown.setValue(this.plugin.settings.deleteOption);
                dropdown.onChange(async (option) => {
                    this.plugin.settings.deleteOption = normalizeDeleteOption(option);
                    await this.plugin.saveSettings();
                    this.plugin.refreshPeriodicCleanup();
                });
            });

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

    }
}
