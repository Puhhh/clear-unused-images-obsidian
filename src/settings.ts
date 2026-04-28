import OzanClearImages from './main';
import { PluginSettingTab, Setting, App } from 'obsidian';
import {
    AUTO_CLEAN_EVERY_X_MINUTES_DEFAULT,
    AUTO_CLEAN_INTERVAL_MINUTES_DEFAULT,
    AUTO_CLEAN_ON_VAULT_LOAD_DEFAULT,
    normalizeAutoCleanIntervalMinutes,
} from './startupCleanup';

export interface OzanClearImagesSettings {
    deleteOption: string;
    logsModal: boolean;
    excludedFolders: string;
    ribbonIcon: boolean;
    excludeSubfolders: boolean;
    autoCleanOnVaultLoad: boolean;
    autoCleanEveryXMinutes: boolean;
    autoCleanIntervalMinutes: number;
}

export const DEFAULT_SETTINGS: OzanClearImagesSettings = {
    deleteOption: '.trash',
    logsModal: true,
    excludedFolders: '',
    ribbonIcon: false,
    excludeSubfolders: false,
    autoCleanOnVaultLoad: AUTO_CLEAN_ON_VAULT_LOAD_DEFAULT,
    autoCleanEveryXMinutes: AUTO_CLEAN_EVERY_X_MINUTES_DEFAULT,
    autoCleanIntervalMinutes: AUTO_CLEAN_INTERVAL_MINUTES_DEFAULT,
};

export class OzanClearImagesSettingsTab extends PluginSettingTab {
    plugin: OzanClearImages;

    constructor(app: App, plugin: OzanClearImages) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        let { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'Clear Images Settings' });

        new Setting(containerEl)
            .setName('Ribbon Icon')
            .setDesc('Turn on if you want Ribbon Icon for clearing the images.')
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.ribbonIcon).onChange((value) => {
                    this.plugin.settings.ribbonIcon = value;
                    this.plugin.saveSettings();
                    this.plugin.refreshIconRibbon();
                })
            );

        new Setting(containerEl)
            .setName('Delete Logs')
            .setDesc(
                'Turn off if you dont want to view the delete logs Modal to pop up after deletion is completed. It wont appear if no image is deleted'
            )
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.logsModal).onChange((value) => {
                    this.plugin.settings.logsModal = value;
                    this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName('Clean Images On Vault Load')
            .setDesc(
                'Automatically run the unused image cleanup once after the vault layout is ready. This setting only applies to images and starts working on the next vault load. Permanent delete will still ask for confirmation.'
            )
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.autoCleanOnVaultLoad).onChange((value) => {
                    this.plugin.settings.autoCleanOnVaultLoad = value;
                    this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName('Clean Images Every X Minutes')
            .setDesc(
                'Automatically run the unused image cleanup every X minutes while Obsidian stays open. The timer starts after the vault layout is ready, waits for the full interval before the first run, and does not run when Permanently Delete is selected.'
            )
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.autoCleanEveryXMinutes).onChange(async (value) => {
                    this.plugin.settings.autoCleanEveryXMinutes = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshPeriodicCleanup();
                })
            );

        new Setting(containerEl)
            .setName('Cleanup Interval In Minutes')
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
            .setName('Deleted Image Destination')
            .setDesc('Select where you want images to be moved once they are deleted')
            .addDropdown((dropdown) => {
                dropdown.addOption('permanent', 'Delete Permanently');
                dropdown.addOption('.trash', 'Move to Obsidian Trash');
                dropdown.addOption('system-trash', 'Move to System Trash');
                dropdown.setValue(this.plugin.settings.deleteOption);
                dropdown.onChange(async (option) => {
                    this.plugin.settings.deleteOption = option;
                    await this.plugin.saveSettings();
                    this.plugin.refreshPeriodicCleanup();
                });
            });

        new Setting(containerEl)
            .setName('Excluded Folder Full Paths')
            .setDesc(
                `Provide the FULL path of the folder names (Case Sensitive) divided by comma (,) to be excluded from clearing. 
					i.e. For images under Personal/Files/Zodiac -> Personal/Files/Zodiac should be used for exclusion`
            )
            .addTextArea((text) =>
                text.setValue(this.plugin.settings.excludedFolders).onChange((value) => {
                    this.plugin.settings.excludedFolders = value;
                    this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName('Exclude Subfolders')
            .setDesc('Turn on this option if you want to also exclude all subfolders of the folder paths provided above.')
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.excludeSubfolders).onChange((value) => {
                    this.plugin.settings.excludeSubfolders = value;
                    this.plugin.saveSettings();
                })
            );

    }
}
