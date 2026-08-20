import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { App } from 'obsidian';

import { describe, expect, it, vi } from 'vitest';

import type OzanClearImages from '../src/main';
import { DEFAULT_SETTINGS, OzanClearImagesSettingsTab } from '../src/settings';

describe('plugin settings defaults', () => {
    it('keeps clear empty folders after image cleanup disabled by default', () => {
        const settingsSource = readFileSync(join(process.cwd(), 'src/settings.ts'), 'utf8');

        expect(settingsSource).toMatch(/clearEmptyFoldersAfterImageCleanup:\s*boolean/);
        expect(settingsSource).toMatch(/clearEmptyFoldersAfterImageCleanup:\s*false/);
    });

    it('uses Obsidian-configured trash by default', () => {
        const settingsSource = readFileSync(join(process.cwd(), 'src/settings.ts'), 'utf8');

        expect(settingsSource).toMatch(/deleteOption:\s*'trash'/);
    });

    it('migrates old delete destinations to Obsidian-configured trash', () => {
        const settingsSource = readFileSync(join(process.cwd(), 'src/settings.ts'), 'utf8');
        const mainSource = readFileSync(join(process.cwd(), 'src/main.ts'), 'utf8');

        expect(settingsSource).toMatch(/export const normalizeDeleteOption/);
        expect(settingsSource).toMatch(/deleteOption === '\.trash' \|\| deleteOption === 'system-trash' \|\| deleteOption === 'permanent'/);
        expect(mainSource).toMatch(/deleteOption: normalizeDeleteOption\(settingsOverride\.deleteOption\)/);
    });

    it('does not expose plugin-controlled permanent delete', () => {
        const settingsSource = readFileSync(join(process.cwd(), 'src/settings.ts'), 'utf8');
        const mainSource = readFileSync(join(process.cwd(), 'src/main.ts'), 'utf8');

        expect(settingsSource).not.toContain("DeleteOption = 'trash' | 'permanent'");
        expect(settingsSource).not.toContain('Delete permanently');
        expect(settingsSource).not.toContain("dropdown.addOption('permanent'");
        expect(settingsSource).not.toContain('permanently deleted');
        expect(mainSource).not.toContain('PermanentDeleteConfirmationModal');
        expect(mainSource).not.toContain('confirmPermanentDelete');
    });

    it('provides searchable definitions for every visible setting', () => {
        const plugin = {
            settings: { ...DEFAULT_SETTINGS },
        } as unknown as OzanClearImages;
        const settingsTab = new OzanClearImagesSettingsTab({} as App, plugin);
        const [group] = settingsTab.getSettingDefinitions();

        expect(group).toMatchObject({ type: 'group', heading: 'Behavior' });
        if (!('type' in group) || group.type !== 'group') {
            throw new Error('Expected a settings definition group');
        }

        expect(group.items?.map((item) => item.name)).toEqual([
            'Ribbon icon',
            'Delete logs',
            'Clean images on vault load',
            'Clean images every X minutes',
            'Clear empty folders after image cleanup',
            'Cleanup interval in minutes',
            'Attachment folder rules',
            'Excluded folder full paths',
            'Exclude subfolders',
            'Excluded file extensions',
        ]);
    });

    it('persists declarative controls and preserves runtime side effects', async () => {
        const plugin = {
            settings: { ...DEFAULT_SETTINGS },
            saveSettings: vi.fn(async () => undefined),
            refreshIconRibbon: vi.fn(),
            refreshPeriodicCleanup: vi.fn(),
        } as unknown as OzanClearImages;
        const settingsTab = new OzanClearImagesSettingsTab({} as App, plugin);

        await settingsTab.setControlValue('autoCleanEveryXMinutes', true);
        expect(plugin.settings.autoCleanEveryXMinutes).toBe(true);
        expect(plugin.refreshPeriodicCleanup).toHaveBeenCalledTimes(1);

        await settingsTab.setControlValue('autoCleanIntervalMinutes', 0);
        expect(plugin.settings.autoCleanIntervalMinutes).toBe(15);
        expect(plugin.refreshPeriodicCleanup).toHaveBeenCalledTimes(2);

        await settingsTab.setControlValue('ribbonIcon', true);
        expect(plugin.settings.ribbonIcon).toBe(true);
        expect(plugin.refreshIconRibbon).toHaveBeenCalledTimes(1);
        expect(plugin.saveSettings).toHaveBeenCalledTimes(3);
    });

    it('rejects unknown or wrongly typed declarative setting values', async () => {
        const plugin = {
            settings: { ...DEFAULT_SETTINGS },
            saveSettings: vi.fn(async () => undefined),
            refreshIconRibbon: vi.fn(),
            refreshPeriodicCleanup: vi.fn(),
        } as unknown as OzanClearImages;
        const settingsTab = new OzanClearImagesSettingsTab({} as App, plugin);

        await settingsTab.setControlValue('autoCleanEveryXMinutes', 'true');
        await settingsTab.setControlValue('deleteOption', 'permanent');
        await settingsTab.setControlValue('unknownSetting', true);

        expect(plugin.settings).toEqual(DEFAULT_SETTINGS);
        expect(plugin.saveSettings).not.toHaveBeenCalled();
        expect(plugin.refreshPeriodicCleanup).not.toHaveBeenCalled();
    });

    it('loads settings before registering definitions for search indexing', () => {
        const mainSource = readFileSync(join(process.cwd(), 'src/main.ts'), 'utf8');

        expect(mainSource.indexOf('await this.loadSettings()')).toBeLessThan(
            mainSource.indexOf('this.addSettingTab(new OzanClearImagesSettingsTab(this.app, this))')
        );
    });
});
