import { App, TAbstractFile, TFile, TFolder } from 'obsidian';
import OzanClearImages from './main';
import { getEmptyCandidateFoldersInDeleteOrder, getEmptyFoldersInDeleteOrder } from './folderCleanup';
import { getAllLinkMatchesInFile, LinkMatch } from './linkDetector';
import {
    IMAGE_EXTENSIONS,
    hasImageExtension,
    isPathCoveredByExcludedFolder,
    resolveVaultAttachmentReference,
    splitExcludedFolders,
} from './referenceUtils';
import { walkFrontmatterValues } from './frontmatterWalker';

/* ------------------ Image Handlers  ------------------ */

const bannerRegex = /!\[\[(.*?)\]\]/i;

interface CanvasFileNode {
    type: 'file';
    file: string;
}

interface CanvasTextNode {
    type: 'text';
    text: string;
}

type CanvasNode = CanvasFileNode | CanvasTextNode | Record<string, unknown>;

interface CanvasData {
    nodes?: CanvasNode[];
}

// Create the List of Unused Images
export const getUnusedAttachments = async (app: App, type: 'image' | 'all') => {
    const allAttachmentsInVault: TFile[] = getAttachmentsInVault(app, type);
    const unusedAttachments: TFile[] = [];

    // Get Used Attachments in All Markdown Files
    const usedAttachmentsSet = await getAttachmentPathSetForVault(app, type);

    // Compare All Attachments vs Used Attachments
    allAttachmentsInVault.forEach((attachment) => {
        if (!usedAttachmentsSet.has(attachment.path)) unusedAttachments.push(attachment);
    });

    return unusedAttachments;
};

export const getUnusedFolders = (
    app: App,
    plugin: OzanClearImages
): { unusedFolders: TFolder[]; skippedFolders: TFolder[] } => {
    const rootFolder = app.vault.getRoot();
    const isProtectedFolder = (folder: TFolder): boolean => folderIsInExcludedFolderTree(folder, plugin);
    const unusedFolders = getEmptyFoldersInDeleteOrder<TAbstractFile, TFolder>(
        rootFolder,
        (file): file is TFolder => file instanceof TFolder,
        isProtectedFolder
    );
    const skippedFolders = getEmptyProtectedFolders(rootFolder, isProtectedFolder);

    return { unusedFolders, skippedFolders };
};

export const getUnusedFoldersFromDeletedFileParents = (
    app: App,
    plugin: OzanClearImages,
    deletedParentFolderPaths: ReadonlySet<string>
): { unusedFolders: TFolder[]; skippedFolders: TFolder[] } => {
    const rootFolder = app.vault.getRoot();
    const isProtectedFolder = (folder: TFolder): boolean => folderIsInExcludedFolderTree(folder, plugin);
    const unusedFolders = getEmptyCandidateFoldersInDeleteOrder<TAbstractFile, TFolder>(
        rootFolder,
        (file): file is TFolder => file instanceof TFolder,
        deletedParentFolderPaths,
        isProtectedFolder
    );
    const skippedFolders = getEmptyProtectedCandidateFolders(rootFolder, deletedParentFolderPaths, isProtectedFolder);

    return { unusedFolders, skippedFolders };
};

// Getting all available images saved in vault
const getAttachmentsInVault = (app: App, type: 'image' | 'all'): TFile[] => {
    let allFiles: TFile[] = app.vault.getFiles();
    let attachments: TFile[] = [];
    for (let i = 0; i < allFiles.length; i++) {
        if (!['md', 'canvas'].includes(allFiles[i].extension)) {
            // Only images
            if (IMAGE_EXTENSIONS.has(allFiles[i].extension.toLowerCase())) {
                attachments.push(allFiles[i]);
            }
            // All Files
            else if (type === 'all') {
                attachments.push(allFiles[i]);
            }
        }
    }
    return attachments;
};

// New Method for Getting All Used Attachments
const getAttachmentPathSetForVault = async (app: App, type: 'image' | 'all'): Promise<Set<string>> => {
    const attachmentsSet: Set<string> = new Set();
    const resolvedLinks: Record<string, Record<string, number>> = app.metadataCache.resolvedLinks;
    if (resolvedLinks) {
        for (const links of Object.values(resolvedLinks)) {
            for (const filePath of Object.keys(links)) {
                if (!filePath.endsWith('.md')) {
                    attachmentsSet.add(filePath);
                }
            }
        }
    }
    // Loop Files and Check Frontmatter/Canvas
    const allFiles = app.vault.getFiles();
    for (let i = 0; i < allFiles.length; i++) {
        const obsFile = allFiles[i];
        // Check Frontmatter for md files and additional links that might be missed in resolved links
        if (obsFile.extension === 'md') {
            // Frontmatter
            const fileCache = app.metadataCache.getFileCache(obsFile);
            if (fileCache.frontmatter) {
                collectFrontmatterAttachmentReferences(fileCache.frontmatter, app, obsFile.path, attachmentsSet, type);
            }
            // Any Additional Link
            const linkMatches: LinkMatch[] = await getAllLinkMatchesInFile(obsFile, app);
            for (const linkMatch of linkMatches) {
                addToSet(attachmentsSet, linkMatch.linkText);
            }
        }
        // Check Canvas for links
        else if (obsFile.extension === 'canvas') {
            const fileRead = await app.vault.cachedRead(obsFile);
            try {
                const canvasData = JSON.parse(fileRead) as CanvasData;
                if (Array.isArray(canvasData.nodes) && canvasData.nodes.length > 0) {
                    for (const node of canvasData.nodes) {
                        // node.type: 'text' | 'file'
                        if (isCanvasFileNode(node)) {
                            addToSet(attachmentsSet, node.file);
                        } else if (isCanvasTextNode(node)) {
                            const linkMatches: LinkMatch[] = await getAllLinkMatchesInFile(obsFile, app, node.text);
                            for (const linkMatch of linkMatches) {
                                addToSet(attachmentsSet, linkMatch.linkText);
                            }
                        }
                    }
                }
            } catch (error) {
                console.warn(`Failed to parse canvas file: ${obsFile.path}`, error);
            }
        }
    }
    return attachmentsSet;
};

/* ------------------ Deleting Handlers  ------------------ */

// Clear Images From the Provided List
export const deleteFilesInTheList = async (
    fileList: TFile[],
    plugin: OzanClearImages,
    app: App
): Promise<{
    deletedImages: number;
    skippedImages: number;
    failedImages: number;
    deletedParentFolderPaths: string[];
    logLines: string[];
}> => {
    const deleteOption = plugin.settings.deleteOption;
    let deletedImages = 0;
    let skippedImages = 0;
    let failedImages = 0;
    const deletedParentFolderPaths = new Set<string>();
    const logLines: string[] = [];
    for (const file of fileList) {
        if (fileIsInExcludedFolder(file, plugin)) {
            skippedImages++;
            logLines.push(`[=] Skipped excluded file: ${file.path}`);
        } else {
            const parentFolderPath = file.parent.path;
            try {
                if (deleteOption === 'trash') {
                    await app.fileManager.trashFile(file);
                    logLines.push(`[+] Moved to Obsidian-configured trash: ${file.path}`);
                } else {
                    // eslint-disable-next-line obsidianmd/prefer-file-manager-trash-file -- Explicit confirmed permanent delete must bypass trash.
                    await app.vault.delete(file);
                    logLines.push(`[+] Deleted Permanently: ${file.path}`);
                }

                deletedImages++;
                deletedParentFolderPaths.add(parentFolderPath);
            } catch (error) {
                failedImages++;
                logLines.push(`[!] Failed to delete ${file.path}: ${getErrorMessage(error)}`);
            }
        }
    }
    return { deletedImages, skippedImages, failedImages, deletedParentFolderPaths: [...deletedParentFolderPaths], logLines };
};

export const deleteFoldersInTheList = async (
    folderList: TFolder[],
    plugin: OzanClearImages,
    app: App
): Promise<{ deletedFolders: number; failedFolders: number; logLines: string[] }> => {
    const deleteOption = plugin.settings.deleteOption;
    let deletedFolders = 0;
    let failedFolders = 0;
    const logLines: string[] = [];

    for (const folder of folderList) {
        try {
            if (deleteOption === 'trash') {
                await app.fileManager.trashFile(folder);
                logLines.push(`[+] Moved folder to Obsidian-configured trash: ${folder.path}`);
            } else {
                // eslint-disable-next-line obsidianmd/prefer-file-manager-trash-file -- Explicit confirmed permanent delete must bypass trash.
                await app.vault.delete(folder);
                logLines.push(`[+] Deleted folder permanently: ${folder.path}`);
            }

            deletedFolders++;
        } catch (error) {
            failedFolders++;
            logLines.push(`[!] Failed to delete folder ${folder.path}: ${getErrorMessage(error)}`);
        }
    }

    return { deletedFolders, failedFolders, logLines };
};

// Check if File is Under Excluded Folders
const fileIsInExcludedFolder = (file: TFile, plugin: OzanClearImages): boolean => {
    const excludedFoldersSettings = plugin.settings.excludedFolders;
    const excludeSubfolders = plugin.settings.excludeSubfolders;
    if (excludedFoldersSettings === '') {
        return false;
    } else {
        // Get All Excluded Folder Paths
        const excludedFolderPaths = splitExcludedFolders(excludedFoldersSettings);

        if (excludeSubfolders) {
            // If subfolders included, check if any provided path covers the current folder path
            for (const exludedFolderPath of excludedFolderPaths) {
                if (isPathCoveredByExcludedFolder(file.parent.path, exludedFolderPath, true)) {
                    return true;
                }
            }
        } else {
            // Full path of parent should match if subfolders are not included
            for (const exludedFolderPath of excludedFolderPaths) {
                if (isPathCoveredByExcludedFolder(file.parent.path, exludedFolderPath, false)) {
                    return true;
                }
            }
        }

        return false;
    }
};

const folderIsInExcludedFolderTree = (folder: TFolder, plugin: OzanClearImages): boolean => {
    if (folder.isRoot() || plugin.settings.excludedFolders === '') {
        return false;
    }

    return splitExcludedFolders(plugin.settings.excludedFolders).some((excludedFolderPath) =>
        isPathCoveredByExcludedFolder(folder.path, excludedFolderPath, true)
    );
};

const getEmptyProtectedFolders = (
    rootFolder: TFolder,
    isProtectedFolder: (folder: TFolder) => boolean
): TFolder[] => {
    const skippedFolders: TFolder[] = [];

    const visitFolder = (folder: TFolder): void => {
        for (const child of folder.children) {
            if (child instanceof TFolder) {
                visitFolder(child);
            }
        }

        if (!folder.isRoot() && folder.children.length === 0 && isProtectedFolder(folder)) {
            skippedFolders.push(folder);
        }
    };

    visitFolder(rootFolder);
    return skippedFolders;
};

const getEmptyProtectedCandidateFolders = (
    rootFolder: TFolder,
    candidateFolderPaths: ReadonlySet<string>,
    isProtectedFolder: (folder: TFolder) => boolean
): TFolder[] => {
    const skippedFolders: TFolder[] = [];

    const visitFolder = (folder: TFolder): void => {
        if (folder.isRoot()) {
            for (const child of folder.children) {
                if (child instanceof TFolder) {
                    visitFolder(child);
                }
            }
            return;
        }

        if (isProtectedFolder(folder)) {
            if (candidateFolderPaths.has(folder.path) && folder.children.length === 0) {
                skippedFolders.push(folder);
            }
            return;
        }

        for (const child of folder.children) {
            if (child instanceof TFolder) {
                visitFolder(child);
            }
        }
    };

    visitFolder(rootFolder);
    return skippedFolders;
};

/* ------------------ Helpers  ------------------ */

export const getFormattedDate = () => {
    const dt = new Date();
    return dt.toLocaleDateString('en-GB', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
};

const addToSet = (setObj: Set<string>, value: string) => {
    if (!setObj.has(value)) {
        setObj.add(value);
    }
};

const isObjectRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null;
};

const isCanvasFileNode = (node: CanvasNode): node is CanvasFileNode => {
    if (!isObjectRecord(node)) {
        return false;
    }

    return node.type === 'file' && typeof node.file === 'string';
};

const isCanvasTextNode = (node: CanvasNode): node is CanvasTextNode => {
    if (!isObjectRecord(node)) {
        return false;
    }

    return node.type === 'text' && typeof node.text === 'string';
};

const resolveAttachmentReference = (
    app: App,
    reference: string,
    sourcePath: string,
    type: 'image' | 'all'
): string | null => {
    return resolveVaultAttachmentReference(
        reference,
        sourcePath,
        (referencePath, sourceFilePath) => {
            const file = app.metadataCache.getFirstLinkpathDest(referencePath, sourceFilePath);
            return file ? file.path : null;
        },
        (referencePath) => {
            const file = app.vault.getAbstractFileByPath(referencePath);
            if (!(file instanceof TFile)) {
                return false;
            }

            if (type === 'image') {
                return hasImageExtension(file.path);
            }

            return file.extension !== 'md' && file.extension !== 'canvas';
        },
        type
    );
};

const collectFrontmatterAttachmentReferences = (
    frontmatterValue: unknown,
    app: App,
    sourcePath: string,
    attachmentsSet: Set<string>,
    type: 'image' | 'all'
) => {
    walkFrontmatterValues(frontmatterValue, (stringValue) => {
        const bannerMatch = stringValue.match(bannerRegex);
        if (bannerMatch) {
            const fileName = bannerMatch[1];
            const file = app.metadataCache.getFirstLinkpathDest(fileName, sourcePath);
            if (file && (type === 'all' || hasImageExtension(file.path))) {
                addToSet(attachmentsSet, file.path);
            }
            return;
        }

        const resolvedPath = resolveAttachmentReference(app, stringValue, sourcePath, type);
        if (resolvedPath) {
            addToSet(attachmentsSet, resolvedPath);
        }
    });
};

const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) {
        return error.message;
    }

    if (typeof error === 'string') {
        return error;
    }

    if (typeof error === 'number' || typeof error === 'boolean' || typeof error === 'bigint') {
        return error.toString();
    }

    return 'Unknown error';
};
