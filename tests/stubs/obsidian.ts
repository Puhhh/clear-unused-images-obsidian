// Minimal runtime stand-in for the `obsidian` package, which ships type declarations only.
// Tests alias 'obsidian' to this module (see vitest.config.ts) so that modules relying on
// `instanceof TFile` / `instanceof TFolder` can be imported and exercised in Node.

export class TAbstractFile {
    path = '';
    name = '';
    parent: TFolder | null = null;
}

export class TFile extends TAbstractFile {
    basename = '';
    extension = '';
}

export class TFolder extends TAbstractFile {
    children: TAbstractFile[] = [];

    isRoot(): boolean {
        return this.path === '/' || this.path === '';
    }
}

export class Notice {}
export class Modal {}
export class Plugin {}
export class PluginSettingTab {}
export class Setting {}

export const normalizePath = (path: string): string => path;
