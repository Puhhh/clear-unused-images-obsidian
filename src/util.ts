import { App, TFile } from 'obsidian';
import OzanClearImages from './main';
import { getAllLinkMatchesInFile, LinkMatch } from './linkDetector';
import {
    IMAGE_EXTENSIONS,
    hasImageExtension,
    isPathCoveredByExcludedFolder,
    resolveVaultAttachmentReference,
    splitExcludedFolders,
} from './referenceUtils';

/* ------------------ Image Handlers  ------------------ */

const bannerRegex = /!\[\[(.*?)\]\]/i;

// Create the List of Unused Images
export const getUnusedAttachments = async (app: App, type: 'image' | 'all') => {
    var allAttachmentsInVault: TFile[] = getAttachmentsInVault(app, type);
    var unusedAttachments: TFile[] = [];
    var usedAttachmentsSet: Set<string>;

    // Get Used Attachments in All Markdown Files
    usedAttachmentsSet = await getAttachmentPathSetForVault(app);

    // Compare All Attachments vs Used Attachments
    allAttachmentsInVault.forEach((attachment) => {
        if (!usedAttachmentsSet.has(attachment.path)) unusedAttachments.push(attachment);
    });

    return unusedAttachments;
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
const getAttachmentPathSetForVault = async (app: App): Promise<Set<string>> => {
    var attachmentsSet: Set<string> = new Set();
    var resolvedLinks = app.metadataCache.resolvedLinks;
    if (resolvedLinks) {
        for (const [mdFile, links] of Object.entries(resolvedLinks)) {
            for (const [filePath, nr] of Object.entries(resolvedLinks[mdFile])) {
                if (!(filePath as String).endsWith('.md')) {
                    attachmentsSet.add(filePath);
                }
            }
        }
    }
    // Loop Files and Check Frontmatter/Canvas
    let allFiles = app.vault.getFiles();
    for (let i = 0; i < allFiles.length; i++) {
        let obsFile = allFiles[i];
        // Check Frontmatter for md files and additional links that might be missed in resolved links
        if (obsFile.extension === 'md') {
            // Frontmatter
            let fileCache = app.metadataCache.getFileCache(obsFile);
            if (fileCache.frontmatter) {
                let frontmatter = fileCache.frontmatter;
                for (let k of Object.keys(frontmatter)) {
                    if (typeof frontmatter[k] === 'string') {
                        if (frontmatter[k].match(bannerRegex)) {
                            let fileName = frontmatter[k].match(bannerRegex)[1];
                            let file = app.metadataCache.getFirstLinkpathDest(fileName, obsFile.path);
                            if (file) {
                                addToSet(attachmentsSet, file.path);
                            }
                        } else {
                            const resolvedPath = resolveAttachmentReference(app, frontmatter[k], obsFile.path);
                            if (resolvedPath) {
                                addToSet(attachmentsSet, resolvedPath);
                            }
                        }
                    }
                }
            }
            // Any Additional Link
            let linkMatches: LinkMatch[] = await getAllLinkMatchesInFile(obsFile, app);
            for (let linkMatch of linkMatches) {
                addToSet(attachmentsSet, linkMatch.linkText);
            }
        }
        // Check Canvas for links
        else if (obsFile.extension === 'canvas') {
            let fileRead = await app.vault.cachedRead(obsFile);
            try {
                let canvasData = JSON.parse(fileRead);
                if (canvasData.nodes && canvasData.nodes.length > 0) {
                    for (const node of canvasData.nodes) {
                        // node.type: 'text' | 'file'
                        if (node.type === 'file') {
                            addToSet(attachmentsSet, node.file);
                        } else if (node.type == 'text') {
                            let linkMatches: LinkMatch[] = await getAllLinkMatchesInFile(obsFile, app, node.text);
                            for (let linkMatch of linkMatches) {
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
): Promise<{ deletedImages: number; skippedImages: number; failedImages: number; logLines: string[] }> => {
    var deleteOption = plugin.settings.deleteOption;
    var deletedImages = 0;
    var skippedImages = 0;
    var failedImages = 0;
    let logLines: string[] = [];
    for (let file of fileList) {
        if (fileIsInExcludedFolder(file, plugin)) {
            console.log('File not referenced but excluded: ' + file.path);
            skippedImages++;
            logLines.push(`[=] Skipped excluded file: ${file.path}`);
        } else {
            try {
                let deleted = false;
                if (deleteOption === '.trash') {
                    await app.vault.trash(file, false);
                    logLines.push(`[+] Moved to Obsidian Trash: ${file.path}`);
                    deleted = true;
                } else if (deleteOption === 'system-trash') {
                    await app.vault.trash(file, true);
                    logLines.push(`[+] Moved to System Trash: ${file.path}`);
                    deleted = true;
                } else if (deleteOption === 'permanent') {
                    await app.vault.delete(file);
                    logLines.push(`[+] Deleted Permanently: ${file.path}`);
                    deleted = true;
                } else {
                    throw new Error(`Unsupported delete option: ${deleteOption}`);
                }

                if (deleted) {
                    deletedImages++;
                }
            } catch (error) {
                failedImages++;
                logLines.push(`[!] Failed to delete ${file.path}: ${getErrorMessage(error)}`);
            }
        }
    }
    return { deletedImages, skippedImages, failedImages, logLines };
};

// Check if File is Under Excluded Folders
const fileIsInExcludedFolder = (file: TFile, plugin: OzanClearImages): boolean => {
    var excludedFoldersSettings = plugin.settings.excludedFolders;
    var excludeSubfolders = plugin.settings.excludeSubfolders;
    if (excludedFoldersSettings === '') {
        return false;
    } else {
        // Get All Excluded Folder Paths
        var excludedFolderPaths = splitExcludedFolders(excludedFoldersSettings);

        if (excludeSubfolders) {
            // If subfolders included, check if any provided path covers the current folder path
            for (let exludedFolderPath of excludedFolderPaths) {
                if (isPathCoveredByExcludedFolder(file.parent.path, exludedFolderPath, true)) {
                    return true;
                }
            }
        } else {
            // Full path of parent should match if subfolders are not included
            for (let exludedFolderPath of excludedFolderPaths) {
                if (isPathCoveredByExcludedFolder(file.parent.path, exludedFolderPath, false)) {
                    return true;
                }
            }
        }

        return false;
    }
};

/* ------------------ Helpers  ------------------ */

export const getFormattedDate = () => {
    let dt = new Date();
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

const resolveAttachmentReference = (app: App, reference: string, sourcePath: string): string | null => {
    return resolveVaultAttachmentReference(
        reference,
        sourcePath,
        (referencePath, sourceFilePath) => {
            const file = app.metadataCache.getFirstLinkpathDest(referencePath, sourceFilePath);
            return file ? file.path : null;
        },
        (referencePath) => {
            const file = app.vault.getAbstractFileByPath(referencePath);
            return file instanceof TFile && (hasImageExtension(file.path) || file.extension !== 'md');
        }
    );
};

const getErrorMessage = (error: unknown): string => {
    return error instanceof Error ? error.message : String(error);
};
