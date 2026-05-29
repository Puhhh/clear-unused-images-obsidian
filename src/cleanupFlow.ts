export type AttachmentCleanupType = 'all' | 'image';

export interface AttachmentCleanupFolderDecision {
    cleanupType: AttachmentCleanupType;
    deletedFiles: number;
    clearEmptyFoldersAfterImageCleanup: boolean;
}

export const shouldClearEmptyFoldersAfterAttachmentCleanup = ({
    cleanupType,
    deletedFiles,
    clearEmptyFoldersAfterImageCleanup,
}: AttachmentCleanupFolderDecision): boolean => {
    return cleanupType === 'image' && deletedFiles > 0 && clearEmptyFoldersAfterImageCleanup;
};
