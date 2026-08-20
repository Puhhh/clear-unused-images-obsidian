import { App, Modal } from 'obsidian';
import type { AttachmentFolderReviewItem } from './attachmentFolders';

export interface CleanupReviewModalOptions {
    cleanupType?: 'images' | 'attachments';
    filePaths: string[];
    folderItems: AttachmentFolderReviewItem[];
    emptyParentFolderPaths?: string[];
    excludedFilePaths?: string[];
    protectedFolderItems?: AttachmentFolderReviewItem[];
}

export class CleanupReviewModal extends Modal {
    private readonly cleanupType: 'images' | 'attachments';
    private readonly filePaths: string[];
    private readonly folderItems: AttachmentFolderReviewItem[];
    private readonly emptyParentFolderPaths: string[];
    private readonly excludedFilePaths: string[];
    private readonly protectedFolderItems: AttachmentFolderReviewItem[];
    private resolveDecision: ((decision: boolean) => void) | undefined;
    private decisionResolved = false;

    constructor(app: App, options: CleanupReviewModalOptions) {
        super(app);
        this.cleanupType = options.cleanupType ?? 'attachments';
        this.filePaths = options.filePaths;
        this.folderItems = options.folderItems;
        this.emptyParentFolderPaths = options.emptyParentFolderPaths ?? [];
        this.excludedFilePaths = options.excludedFilePaths ?? [];
        this.protectedFolderItems = options.protectedFolderItems ?? [];
    }

    prompt(): Promise<boolean> {
        return new Promise<boolean>((resolve) => {
            this.resolveDecision = resolve;
            this.open();
        });
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();

        const hasDeletableItems = this.filePaths.length > 0 || this.folderItems.length > 0;

        const headerWrapper = contentEl.createDiv();
        headerWrapper.addClass('unused-images-center-wrapper');
        headerWrapper
            .createEl('h1', {
                text: hasDeletableItems
                    ? `Review unused ${this.cleanupType}`
                    : `Protected ${this.cleanupType}`,
            })
            .addClass('modal-title');

        contentEl.createEl('p', {
            text: hasDeletableItems
                ? 'Review every file and folder below before moving them to Obsidian-configured trash.'
                : 'Nothing can be deleted. These items are protected by exclusions or folder safety checks.',
        });

        if (this.filePaths.length > 0) {
            contentEl.createEl('h2', { text: `Files to move to trash (${this.filePaths.length.toString()})` });
            this.renderFileList(contentEl, this.filePaths);
        }

        if (this.folderItems.length > 0) {
            contentEl.createEl('h2', { text: `Folders to move to trash (${this.folderItems.length.toString()})` });
            this.renderFolderList(contentEl, this.folderItems, false);
        }

        if (this.emptyParentFolderPaths.length > 0) {
            contentEl.createEl('h2', {
                text: `Parent folders to move if empty (${this.emptyParentFolderPaths.length.toString()})`,
            });
            contentEl.createEl('p', {
                text: 'Each parent below will be rechecked after its reviewed child folders are deleted. It is moved to trash only if it is then empty; cleanup never continues to higher ancestors.',
            });
            this.renderFileList(contentEl, this.emptyParentFolderPaths);
        }

        if (this.excludedFilePaths.length > 0) {
            const excludedDetails = contentEl.createEl('details');
            excludedDetails.addClass('unused-images-excluded');
            // Expand automatically when the protected files are the only thing to review.
            excludedDetails.open = !hasDeletableItems;
            excludedDetails.createEl('summary', {
                text: `${this.excludedFilePaths.length.toString()} ${
                    hasDeletableItems ? 'other ' : ''
                }unused file(s) are protected by your exclusion settings (click to review).`,
            });
            this.renderFileList(excludedDetails, this.excludedFilePaths);
        }

        if (this.protectedFolderItems.length > 0) {
            const protectedFolderDetails = contentEl.createEl('details');
            protectedFolderDetails.addClass('unused-images-excluded');
            protectedFolderDetails.open = !hasDeletableItems;
            protectedFolderDetails.createEl('summary', {
                text: `${this.protectedFolderItems.length.toString()} ${
                    this.cleanupType === 'images' ? 'image' : 'attachment'
                } folder(s) are protected (click to review).`,
            });
            this.renderFolderList(protectedFolderDetails, this.protectedFolderItems, true);
        }

        const buttonWrapper = contentEl.createDiv();
        buttonWrapper.addClass('unused-images-center-wrapper');

        if (hasDeletableItems) {
            const cancelButton = buttonWrapper.createEl('button', { text: 'Cancel' });
            cancelButton.addClass('unused-images-button');
            cancelButton.addEventListener('click', () => {
                this.closeWithDecision(false);
            });

            const continueButton = buttonWrapper.createEl('button', {
                text: `Move ${this.filePaths.length.toString()} file(s) and ${this.folderItems.length.toString()} folder(s) to trash${
                    this.emptyParentFolderPaths.length > 0
                        ? `, plus up to ${this.emptyParentFolderPaths.length.toString()} empty parent folder(s)`
                        : ''
                }`,
            });
            continueButton.addClass('unused-images-button');
            continueButton.addClass('mod-warning');
            continueButton.addEventListener('click', () => {
                this.closeWithDecision(true);
            });
        } else {
            const closeButton = buttonWrapper.createEl('button', { text: 'Close' });
            closeButton.addClass('unused-images-button');
            closeButton.addEventListener('click', () => {
                this.closeWithDecision(false);
            });
        }
    }

    private renderFileList(parentEl: HTMLElement, filePaths: string[]): void {
        const listWrapper = parentEl.createDiv();
        listWrapper.addClass('unused-images-logs');
        for (const filePath of filePaths) {
            listWrapper.createDiv({ text: filePath });
        }
    }

    private renderFolderList(
        parentEl: HTMLElement,
        folderItems: AttachmentFolderReviewItem[],
        showProtectedReason: boolean
    ): void {
        const listWrapper = parentEl.createDiv();
        listWrapper.addClass('unused-images-logs');
        for (const folderItem of folderItems) {
            const details = listWrapper.createEl('details');
            details.createEl('summary', {
                text: `${folderItem.path}/ — ${folderItem.descendantPaths.length.toString()} descendant item(s), ${folderItem.matchedRule}`,
            });
            if (showProtectedReason && folderItem.protectedReason) {
                details.createEl('p', { text: folderItem.protectedReason });
            }
            this.renderFileList(details, folderItem.descendantPaths);
        }
    }

    onClose() {
        this.contentEl.empty();
        if (!this.decisionResolved) {
            this.decisionResolved = true;
            this.resolveDecision?.(false);
        }
    }

    private closeWithDecision(decision: boolean): void {
        if (this.decisionResolved) {
            return;
        }

        this.decisionResolved = true;
        this.resolveDecision?.(decision);
        this.close();
    }
}
