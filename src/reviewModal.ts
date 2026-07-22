import { App, Modal } from 'obsidian';

export class CleanupReviewModal extends Modal {
    private readonly filePaths: string[];
    private readonly excludedFilePaths: string[];
    private resolveDecision: ((decision: boolean) => void) | undefined;
    private decisionResolved = false;

    constructor(app: App, filePaths: string[], excludedFilePaths: string[] = []) {
        super(app);
        this.filePaths = filePaths;
        this.excludedFilePaths = excludedFilePaths;
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

        const hasDeletableFiles = this.filePaths.length > 0;

        const headerWrapper = contentEl.createDiv();
        headerWrapper.addClass('unused-images-center-wrapper');
        headerWrapper
            .createEl('h1', { text: hasDeletableFiles ? 'Review unused files' : 'Protected files' })
            .addClass('modal-title');

        contentEl.createEl('p', {
            text: hasDeletableFiles
                ? 'These files will be deleted by clear unused attachments. Review the exact paths before continuing.'
                : 'No unused files can be deleted. Everything unused is protected by your exclusion settings.',
        });

        if (hasDeletableFiles) {
            this.renderFileList(contentEl, this.filePaths);
        }

        if (this.excludedFilePaths.length > 0) {
            const excludedDetails = contentEl.createEl('details');
            excludedDetails.addClass('unused-images-excluded');
            // Expand automatically when the protected files are the only thing to review.
            excludedDetails.open = !hasDeletableFiles;
            excludedDetails.createEl('summary', {
                text: `${this.excludedFilePaths.length.toString()} ${
                    hasDeletableFiles ? 'other ' : ''
                }unused file(s) are protected by your exclusion settings (click to review).`,
            });
            this.renderFileList(excludedDetails, this.excludedFilePaths);
        }

        const buttonWrapper = contentEl.createDiv();
        buttonWrapper.addClass('unused-images-center-wrapper');

        if (hasDeletableFiles) {
            const cancelButton = buttonWrapper.createEl('button', { text: 'Cancel' });
            cancelButton.addClass('unused-images-button');
            cancelButton.addEventListener('click', () => {
                this.closeWithDecision(false);
            });

            const continueButton = buttonWrapper.createEl('button', { text: 'Continue' });
            continueButton.addClass('unused-images-button');
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
