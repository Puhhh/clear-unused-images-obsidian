import { App, TAbstractFile, TFile, TFolder } from 'obsidian';

import { walkFrontmatterValues } from './frontmatterWalker';
import { getAllLinkMatchesInFile } from './linkDetector';
import { isExtensionExcluded, splitExcludedExtensions, splitExcludedFolders } from './referenceUtils';

const MAX_SUFFIX_COUNT = 50;
const MAX_SUFFIX_LENGTH = 64;
const EXTERNAL_REFERENCE_REGEX = /^(https?:|data:|mailto:)/i;
const FRONTMATTER_WIKI_LINK_REGEX = /^!?\[\[(.*?)\]\]$/;

interface AttachmentFolderSettings {
    attachmentFolderSuffixes: string;
    excludedFolders: string;
    excludedExtensions: string;
}

interface ReferenceEdge {
    sourcePath: string;
    targetPath: string;
}

interface CanvasFileNode {
    type: 'file';
    file: string;
}

interface CanvasTextNode {
    type: 'text';
    text: string;
}

interface CanvasData {
    nodes?: Array<CanvasFileNode | CanvasTextNode | Record<string, unknown>>;
}

export interface AttachmentFolderReviewItem {
    path: string;
    matchedSuffix: string;
    descendantPaths: string[];
    fingerprint: string;
    protectedReason?: string;
}

export interface AttachmentFolderPlan {
    deletableFolders: AttachmentFolderReviewItem[];
    protectedFolders: AttachmentFolderReviewItem[];
    candidateFolderPaths: Set<string>;
    normalizedSuffixes: string[];
    validationError?: string;
}

export interface AttachmentFolderDeletionResult {
    deletedFolders: number;
    failedFolders: number;
    skippedFolders: number;
    logLines: string[];
}

export interface ParsedAttachmentFolderSuffixes {
    suffixes: string[];
    error?: string;
}

export const parseAttachmentFolderSuffixes = (input: string): ParsedAttachmentFolderSuffixes => {
    const rawEntries = input
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);

    if (rawEntries.length > MAX_SUFFIX_COUNT) {
        return { suffixes: [], error: `Configure no more than ${MAX_SUFFIX_COUNT.toString()} folder suffixes.` };
    }

    const suffixes = new Set<string>();
    for (const rawEntry of rawEntries) {
        if (
            rawEntry.length > MAX_SUFFIX_LENGTH ||
            !rawEntry.startsWith('.') ||
            rawEntry === '.' ||
            rawEntry.includes('..') ||
            /[/\\]/.test(rawEntry) ||
            [...rawEntry].some((character) => {
                const characterCode = character.charCodeAt(0);
                return characterCode <= 31 || characterCode === 127;
            })
        ) {
            return {
                suffixes: [],
                error: `Invalid attachment folder suffix: ${rawEntry}. Use a literal value such as .html.`,
            };
        }

        suffixes.add(rawEntry.toLowerCase());
    }

    return { suffixes: [...suffixes].sort((left, right) => right.length - left.length || left.localeCompare(right)) };
};

export const planAttachmentFolders = async (
    app: App,
    settings: AttachmentFolderSettings
): Promise<AttachmentFolderPlan> => {
    const parsedSuffixes = parseAttachmentFolderSuffixes(settings.attachmentFolderSuffixes);
    if (parsedSuffixes.error || parsedSuffixes.suffixes.length === 0) {
        return {
            deletableFolders: [],
            protectedFolders: [],
            candidateFolderPaths: new Set<string>(),
            normalizedSuffixes: parsedSuffixes.suffixes,
            validationError: parsedSuffixes.error,
        };
    }

    const candidates = getOutermostCandidateFolders(app.vault.getRoot(), parsedSuffixes.suffixes);
    const candidateFolderPaths = new Set(candidates.map(({ folder }) => folder.path));
    if (candidates.length === 0) {
        return {
            deletableFolders: [],
            protectedFolders: [],
            candidateFolderPaths,
            normalizedSuffixes: parsedSuffixes.suffixes,
        };
    }

    let referenceEdges: ReferenceEdge[];
    try {
        referenceEdges = await collectReferenceEdges(app);
    } catch (error) {
        const reason = `Reference scan failed: ${getErrorMessage(error)}`;
        return {
            deletableFolders: [],
            protectedFolders: candidates.map(({ folder, matchedSuffix }) =>
                createReviewItem(folder, matchedSuffix, reason)
            ),
            candidateFolderPaths,
            normalizedSuffixes: parsedSuffixes.suffixes,
        };
    }

    const excludedFolderPaths = splitExcludedFolders(settings.excludedFolders);
    const excludedExtensions = splitExcludedExtensions(settings.excludedExtensions);
    const deletableFolders: AttachmentFolderReviewItem[] = [];
    const protectedFolders: AttachmentFolderReviewItem[] = [];

    for (const { folder, matchedSuffix } of candidates) {
        const exclusionReason = getExclusionReason(folder, excludedFolderPaths, excludedExtensions);
        if (exclusionReason) {
            protectedFolders.push(createReviewItem(folder, matchedSuffix, exclusionReason));
            continue;
        }

        const externalReference = referenceEdges.find(
            ({ sourcePath, targetPath }) => isPathInsideFolder(targetPath, folder.path) && !isPathInsideFolder(sourcePath, folder.path)
        );
        if (externalReference) {
            protectedFolders.push(
                createReviewItem(
                    folder,
                    matchedSuffix,
                    `Referenced from ${externalReference.sourcePath} to ${externalReference.targetPath}`
                )
            );
            continue;
        }

        deletableFolders.push(createReviewItem(folder, matchedSuffix));
    }

    return {
        deletableFolders,
        protectedFolders,
        candidateFolderPaths,
        normalizedSuffixes: parsedSuffixes.suffixes,
    };
};

export const deleteReviewedAttachmentFolders = async (
    app: App,
    settings: AttachmentFolderSettings,
    reviewedFolders: readonly AttachmentFolderReviewItem[],
    reviewedSuffixes: readonly string[]
): Promise<AttachmentFolderDeletionResult> => {
    const logLines: string[] = [];
    let deletedFolders = 0;
    let failedFolders = 0;
    let skippedFolders = 0;

    for (const reviewedFolder of reviewedFolders) {
        const currentPlan = await planAttachmentFolders(app, settings);
        if (currentPlan.validationError || !arraysEqual(currentPlan.normalizedSuffixes, reviewedSuffixes)) {
            const reason = currentPlan.validationError ?? 'attachment folder suffix settings changed since review';
            skippedFolders++;
            logLines.push(`[=] Skipped attachment folder ${reviewedFolder.path}: ${reason}; rerun cleanup.`);
            continue;
        }

        const currentDeletableFolders = new Map(currentPlan.deletableFolders.map((folder) => [folder.path, folder]));
        const currentFolderPlan = currentDeletableFolders.get(reviewedFolder.path);
        const currentFolder = app.vault.getAbstractFileByPath(reviewedFolder.path);
        if (
            !currentFolderPlan ||
            currentFolderPlan.fingerprint !== reviewedFolder.fingerprint ||
            !(currentFolder instanceof TFolder)
        ) {
            skippedFolders++;
            logLines.push(
                `[=] Skipped attachment folder ${reviewedFolder.path}: changed or became protected since review; rerun cleanup.`
            );
            continue;
        }

        try {
            await app.fileManager.trashFile(currentFolder);
            deletedFolders++;
            logLines.push(`[+] Moved attachment folder to Obsidian-configured trash: ${reviewedFolder.path}`);
        } catch (error) {
            failedFolders++;
            logLines.push(`[!] Failed to delete attachment folder ${reviewedFolder.path}: ${getErrorMessage(error)}`);
        }
    }

    return { deletedFolders, failedFolders, skippedFolders, logLines };
};

export const isPathInsideFolder = (path: string, folderPath: string): boolean => {
    return path === folderPath || path.startsWith(`${folderPath}/`);
};

const getOutermostCandidateFolders = (
    rootFolder: TFolder,
    suffixes: readonly string[]
): Array<{ folder: TFolder; matchedSuffix: string }> => {
    const candidates: Array<{ folder: TFolder; matchedSuffix: string }> = [];

    const visit = (folder: TFolder): void => {
        for (const child of folder.children) {
            if (!(child instanceof TFolder)) {
                continue;
            }

            const matchedSuffix = suffixes.find((suffix) => child.name.toLowerCase().endsWith(suffix));
            if (matchedSuffix) {
                candidates.push({ folder: child, matchedSuffix });
                continue;
            }

            visit(child);
        }
    };

    visit(rootFolder);
    return candidates;
};

const collectReferenceEdges = async (app: App): Promise<ReferenceEdge[]> => {
    const edges = new Map<string, ReferenceEdge>();
    const allFiles = app.vault.getFiles();

    for (const [sourcePath, links] of Object.entries(app.metadataCache.resolvedLinks ?? {})) {
        for (const targetPath of Object.keys(links)) {
            addReferenceEdge(edges, sourcePath, targetPath);
        }
    }

    for (const sourceFile of allFiles) {
        if (sourceFile.extension === 'md') {
            const content = await app.vault.read(sourceFile);
            const linkMatches = await getAllLinkMatchesInFile(sourceFile, app, content);
            for (const linkMatch of linkMatches) {
                for (const targetPath of resolveReferenceTargets(app, linkMatch.linkText, sourceFile.path, allFiles)) {
                    addReferenceEdge(edges, sourceFile.path, targetPath);
                }
            }

            const fileCache = app.metadataCache.getFileCache(sourceFile);
            if (fileCache?.frontmatter) {
                walkFrontmatterValues(fileCache.frontmatter, (value) => {
                    const wikiLinkMatch = value.match(FRONTMATTER_WIKI_LINK_REGEX);
                    const reference = wikiLinkMatch ? wikiLinkMatch[1] : value;
                    for (const targetPath of resolveReferenceTargets(app, reference, sourceFile.path, allFiles)) {
                        addReferenceEdge(edges, sourceFile.path, targetPath);
                    }
                });
            }
        } else if (sourceFile.extension === 'canvas') {
            const content = await app.vault.read(sourceFile);
            const canvasData = JSON.parse(content) as CanvasData;
            if (canvasData.nodes !== undefined && !Array.isArray(canvasData.nodes)) {
                throw new Error(`Invalid canvas nodes in ${sourceFile.path}`);
            }

            for (const node of canvasData.nodes ?? []) {
                if (isCanvasFileNode(node)) {
                    for (const targetPath of resolveReferenceTargets(app, node.file, sourceFile.path, allFiles)) {
                        addReferenceEdge(edges, sourceFile.path, targetPath);
                    }
                } else if (isCanvasTextNode(node)) {
                    const linkMatches = await getAllLinkMatchesInFile(sourceFile, app, node.text);
                    for (const linkMatch of linkMatches) {
                        for (const targetPath of resolveReferenceTargets(app, linkMatch.linkText, sourceFile.path, allFiles)) {
                            addReferenceEdge(edges, sourceFile.path, targetPath);
                        }
                    }
                }
            }
        }
    }

    return [...edges.values()];
};

const resolveReferenceTargets = (app: App, reference: string, sourcePath: string, allFiles: TFile[]): string[] => {
    const cleanedReference = cleanReference(reference);
    if (!cleanedReference || EXTERNAL_REFERENCE_REGEX.test(cleanedReference)) {
        return [];
    }

    const targets = new Set<string>();
    const resolvedFile = app.metadataCache.getFirstLinkpathDest(cleanedReference, sourcePath);
    if (resolvedFile) {
        targets.add(resolvedFile.path);
    }

    const exactFile = app.vault.getAbstractFileByPath(cleanedReference);
    if (exactFile instanceof TFile) {
        targets.add(exactFile.path);
    }

    if (targets.size === 0) {
        const referenceName = cleanedReference.slice(cleanedReference.lastIndexOf('/') + 1);
        for (const file of allFiles) {
            if (file.name === referenceName || file.basename === referenceName) {
                targets.add(file.path);
            }
        }
    }

    return [...targets];
};

const cleanReference = (reference: string): string => {
    return reference.trim().replace(/^<|>$/g, '').split('|', 1)[0].split('#', 1)[0].trim().replace(/^\/+/, '');
};

const addReferenceEdge = (edges: Map<string, ReferenceEdge>, sourcePath: string, targetPath: string): void => {
    const key = `${sourcePath}\u0000${targetPath}`;
    edges.set(key, { sourcePath, targetPath });
};

const getExclusionReason = (
    folder: TFolder,
    excludedFolderPaths: readonly string[],
    excludedExtensions: ReadonlySet<string>
): string | null => {
    const intersectingExcludedFolder = excludedFolderPaths.find(
        (excludedFolderPath) =>
            isPathInsideFolder(folder.path, excludedFolderPath) || isPathInsideFolder(excludedFolderPath, folder.path)
    );
    if (intersectingExcludedFolder) {
        return `Intersects excluded folder ${intersectingExcludedFolder}`;
    }

    const excludedFile = collectDescendants(folder).find(
        (descendant): descendant is TFile =>
            descendant instanceof TFile && isExtensionExcluded(descendant.extension, excludedExtensions)
    );
    if (excludedFile) {
        return `Contains excluded file ${excludedFile.path}`;
    }

    return null;
};

const createReviewItem = (
    folder: TFolder,
    matchedSuffix: string,
    protectedReason?: string
): AttachmentFolderReviewItem => {
    const descendants = collectDescendants(folder);
    const descendantPaths = descendants.map((descendant) => descendant.path).sort();
    const fingerprintParts = descendants
        .map((descendant) => {
            if (descendant instanceof TFolder) {
                return `folder:${descendant.path}`;
            }

            if (descendant instanceof TFile) {
                return `file:${descendant.path}:${descendant.stat.mtime.toString()}:${descendant.stat.size.toString()}`;
            }

            return `abstract:${descendant.path}`;
        })
        .sort();

    return {
        path: folder.path,
        matchedSuffix,
        descendantPaths,
        fingerprint: fingerprintParts.join('\n'),
        protectedReason,
    };
};

const collectDescendants = (folder: TFolder): TAbstractFile[] => {
    const descendants: TAbstractFile[] = [];
    const visit = (currentFolder: TFolder): void => {
        for (const child of currentFolder.children) {
            descendants.push(child);
            if (child instanceof TFolder) {
                visit(child);
            }
        }
    };

    visit(folder);
    return descendants;
};

const isCanvasFileNode = (node: CanvasFileNode | CanvasTextNode | Record<string, unknown>): node is CanvasFileNode => {
    return node.type === 'file' && typeof node.file === 'string';
};

const isCanvasTextNode = (node: CanvasFileNode | CanvasTextNode | Record<string, unknown>): node is CanvasTextNode => {
    return node.type === 'text' && typeof node.text === 'string';
};

const arraysEqual = (left: readonly string[], right: readonly string[]): boolean => {
    return left.length === right.length && left.every((value, index) => value === right[index]);
};

const getErrorMessage = (error: unknown): string => {
    return error instanceof Error ? error.message : String(error);
};
