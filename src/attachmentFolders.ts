import { App, TAbstractFile, TFile, TFolder } from 'obsidian';

import { walkFrontmatterValues } from './frontmatterWalker';
import { getAllLinkMatchesInFile } from './linkDetector';
import {
    hasImageExtension,
    isExtensionExcluded,
    splitExcludedExtensions,
    splitExcludedFolders,
} from './referenceUtils';
import {
    AttachmentFolderRule,
    matchAttachmentFolderRule,
    parseAttachmentFolderRules,
} from './attachmentFolderRules';

const MAX_MATCH_EVALUATIONS = 500_000;
const EXTERNAL_REFERENCE_REGEX = /^(https?:|data:|mailto:)/i;
const FRONTMATTER_WIKI_LINK_REGEX = /^!?\[\[(.*?)\]\]$/;

interface AttachmentFolderSettings {
    attachmentFolderSuffixes: string;
    imageFolderRules: string;
    excludedFolders: string;
    excludedExtensions: string;
}

export type AtomicFolderRuleScope = 'attachment' | 'image';

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
    matchedRule: string;
    emptyParentPath?: string;
    descendantPaths: string[];
    fingerprint: string;
    protectedReason?: string;
}

export interface AttachmentFolderPlan {
    deletableFolders: AttachmentFolderReviewItem[];
    protectedFolders: AttachmentFolderReviewItem[];
    candidateFolderPaths: Set<string>;
    normalizedRules: string[];
    parentFolderPaths: string[];
    validationError?: string;
}

export interface AttachmentFolderDeletionResult {
    deletedFolders: number;
    failedFolders: number;
    skippedFolders: number;
    deletedParentFolders: number;
    failedParentFolders: number;
    skippedParentFolders: number;
    logLines: string[];
}

export const planAttachmentFolders = async (
    app: App,
    settings: AttachmentFolderSettings,
    ruleScope: AtomicFolderRuleScope = 'attachment'
): Promise<AttachmentFolderPlan> => {
    const parsedRules = parseAttachmentFolderRules(getFolderRuleText(settings, ruleScope));
    if (parsedRules.error || parsedRules.rules.length === 0) {
        return {
            deletableFolders: [],
            protectedFolders: [],
            candidateFolderPaths: new Set<string>(),
            normalizedRules: parsedRules.canonicalRules,
            parentFolderPaths: [],
            validationError: scopeRuleError(parsedRules.error, ruleScope),
        };
    }

    const discovery = getOutermostCandidateFolders(app.vault.getRoot(), parsedRules.rules);
    if (discovery.error) {
        return {
            deletableFolders: [],
            protectedFolders: [],
            candidateFolderPaths: new Set<string>(),
            normalizedRules: parsedRules.canonicalRules,
            parentFolderPaths: [],
            validationError: scopeRuleError(discovery.error, ruleScope),
        };
    }

    const candidates = discovery.candidates.filter(({ folder }) =>
        ruleScope === 'attachment' ? true : folderContainsImage(folder)
    );
    const candidateFolderPaths = new Set(candidates.map(({ folder }) => folder.path));
    if (candidates.length === 0) {
        return {
            deletableFolders: [],
            protectedFolders: [],
            candidateFolderPaths,
            normalizedRules: parsedRules.canonicalRules,
            parentFolderPaths: [],
        };
    }

    let referenceEdges: ReferenceEdge[];
    try {
        referenceEdges = await collectReferenceEdges(app);
    } catch (error) {
        const reason = `Reference scan failed: ${getErrorMessage(error)}`;
        return {
            deletableFolders: [],
            protectedFolders: candidates.map(({ folder, matchedRule }) =>
                createReviewItem(folder, matchedRule, reason)
            ),
            candidateFolderPaths,
            normalizedRules: parsedRules.canonicalRules,
            parentFolderPaths: [],
        };
    }

    const excludedFolderPaths = splitExcludedFolders(settings.excludedFolders);
    const excludedExtensions = splitExcludedExtensions(settings.excludedExtensions);
    const deletableFolders: AttachmentFolderReviewItem[] = [];
    const protectedFolders: AttachmentFolderReviewItem[] = [];

    for (const { folder, matchedRule } of candidates) {
        const exclusionReason = getExclusionReason(folder, excludedFolderPaths, excludedExtensions);
        if (exclusionReason) {
            protectedFolders.push(createReviewItem(folder, matchedRule, exclusionReason));
            continue;
        }

        const externalReference = referenceEdges.find(
            ({ sourcePath, targetPath }) => isPathInsideFolder(targetPath, folder.path) && !isPathInsideFolder(sourcePath, folder.path)
        );
        if (externalReference) {
            protectedFolders.push(
                createReviewItem(
                    folder,
                    matchedRule,
                    `Referenced from ${externalReference.sourcePath} to ${externalReference.targetPath}`
                )
            );
            continue;
        }

        deletableFolders.push(createReviewItem(folder, matchedRule));
    }

    return {
        deletableFolders,
        protectedFolders,
        candidateFolderPaths,
        normalizedRules: parsedRules.canonicalRules,
        parentFolderPaths: uniqueSorted(
            deletableFolders.flatMap((folder) => folder.emptyParentPath ? [folder.emptyParentPath] : [])
        ),
    };
};

export const deleteReviewedAttachmentFolders = async (
    app: App,
    settings: AttachmentFolderSettings,
    reviewedFolders: readonly AttachmentFolderReviewItem[],
    reviewedRules: readonly string[],
    reviewedParentFolderPaths: readonly string[],
    ruleScope: AtomicFolderRuleScope = 'attachment'
): Promise<AttachmentFolderDeletionResult> => {
    const logLines: string[] = [];
    let deletedFolders = 0;
    let failedFolders = 0;
    let skippedFolders = 0;
    let deletedParentFolders = 0;
    let failedParentFolders = 0;
    let skippedParentFolders = 0;
    const folderLabel = ruleScope === 'image' ? 'image folder' : 'attachment folder';
    const parentFolderLabel = ruleScope === 'image' ? 'image parent folder' : 'attachment parent folder';
    const reviewedParentPaths = new Set(reviewedParentFolderPaths);
    const successfulParentPaths = new Set<string>();
    const blockedParentPaths = new Set<string>();

    for (const reviewedFolder of reviewedFolders) {
        const parentPath = reviewedFolder.emptyParentPath;
        const currentPlan = await planAttachmentFolders(app, settings, ruleScope);
        if (currentPlan.validationError || !arraysEqual(currentPlan.normalizedRules, reviewedRules)) {
            const reason = currentPlan.validationError ?? `${folderLabel} rules changed since review`;
            skippedFolders++;
            if (parentPath) {
                blockedParentPaths.add(parentPath);
            }
            logLines.push(`[=] Skipped ${folderLabel} ${reviewedFolder.path}: ${reason}; rerun cleanup.`);
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
            if (parentPath) {
                blockedParentPaths.add(parentPath);
            }
            logLines.push(
                `[=] Skipped ${folderLabel} ${reviewedFolder.path}: changed or became protected since review; rerun cleanup.`
            );
            continue;
        }

        try {
            await app.fileManager.trashFile(currentFolder);
            deletedFolders++;
            if (parentPath && reviewedParentPaths.has(parentPath)) {
                successfulParentPaths.add(parentPath);
            }
            logLines.push(`[+] Moved ${folderLabel} to Obsidian-configured trash: ${reviewedFolder.path}`);
        } catch (error) {
            failedFolders++;
            if (parentPath) {
                blockedParentPaths.add(parentPath);
            }
            logLines.push(`[!] Failed to delete ${folderLabel} ${reviewedFolder.path}: ${getErrorMessage(error)}`);
        }
    }

    for (const parentPath of successfulParentPaths) {
        if (blockedParentPaths.has(parentPath)) {
            skippedParentFolders++;
            logLines.push(`[=] Kept ${parentFolderLabel} ${parentPath}: a reviewed child was not deleted.`);
            continue;
        }

        const parsedRules = parseAttachmentFolderRules(getFolderRuleText(settings, ruleScope));
        if (parsedRules.error || !arraysEqual(parsedRules.canonicalRules, reviewedRules)) {
            skippedParentFolders++;
            logLines.push(`[=] Kept ${parentFolderLabel} ${parentPath}: ${folderLabel} rules changed; rerun cleanup.`);
            continue;
        }

        const parentFolder = app.vault.getAbstractFileByPath(parentPath);
        if (!(parentFolder instanceof TFolder) || parentFolder.isRoot()) {
            skippedParentFolders++;
            logLines.push(`[=] Kept ${parentFolderLabel} ${parentPath}: it is missing, changed, or is the vault root.`);
            continue;
        }

        const exclusionReason = getExclusionReason(
            parentFolder,
            splitExcludedFolders(settings.excludedFolders),
            splitExcludedExtensions(settings.excludedExtensions)
        );
        if (exclusionReason) {
            skippedParentFolders++;
            logLines.push(`[=] Kept ${parentFolderLabel} ${parentPath}: ${exclusionReason}.`);
            continue;
        }

        if (parentFolder.children.length > 0) {
            logLines.push(`[=] Kept ${parentFolderLabel} ${parentPath}: it is not empty.`);
            continue;
        }

        try {
            await app.fileManager.trashFile(parentFolder);
            deletedParentFolders++;
            logLines.push(`[+] Moved empty ${parentFolderLabel} to Obsidian-configured trash: ${parentPath}`);
        } catch (error) {
            failedParentFolders++;
            logLines.push(`[!] Failed to delete empty ${parentFolderLabel} ${parentPath}: ${getErrorMessage(error)}`);
        }
    }

    return {
        deletedFolders,
        failedFolders,
        skippedFolders,
        deletedParentFolders,
        failedParentFolders,
        skippedParentFolders,
        logLines,
    };
};

export const isPathInsideFolder = (path: string, folderPath: string): boolean => {
    return path === folderPath || path.startsWith(`${folderPath}/`);
};

const getOutermostCandidateFolders = (
    rootFolder: TFolder,
    rules: readonly AttachmentFolderRule[]
): {
    candidates: Array<{ folder: TFolder; matchedRule: AttachmentFolderRule }>;
    error?: string;
} => {
    const candidates: Array<{ folder: TFolder; matchedRule: AttachmentFolderRule }> = [];
    let evaluations = 0;
    let error: string | undefined;

    const visit = (folder: TFolder): void => {
        if (error) {
            return;
        }

        for (const child of folder.children) {
            if (!(child instanceof TFolder)) {
                continue;
            }

            evaluations += rules.length;
            if (evaluations > MAX_MATCH_EVALUATIONS) {
                error = 'Attachment folder rules match too many vault folders. Narrow the configured rules.';
                return;
            }

            const parentPath = child.parent?.isRoot() ? '' : child.parent?.path ?? '';
            const matchedRule = matchAttachmentFolderRule(child.path, child.name, parentPath, rules);
            if (matchedRule) {
                candidates.push({ folder: child, matchedRule });
                continue;
            }

            visit(child);
        }
    };

    visit(rootFolder);
    return { candidates: error ? [] : candidates, error };
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
    matchedRule: AttachmentFolderRule,
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
        matchedRule: matchedRule.label,
        emptyParentPath: matchedRule.kind === 'suffix' || folder.parent?.isRoot() ? undefined : folder.parent?.path,
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

const folderContainsImage = (folder: TFolder): boolean => {
    return collectDescendants(folder).some(
        (descendant) => descendant instanceof TFile && hasImageExtension(descendant.path)
    );
};

const getFolderRuleText = (
    settings: AttachmentFolderSettings,
    ruleScope: AtomicFolderRuleScope
): string => {
    return ruleScope === 'image' ? settings.imageFolderRules : settings.attachmentFolderSuffixes;
};

const scopeRuleError = (
    error: string | undefined,
    ruleScope: AtomicFolderRuleScope
): string | undefined => {
    if (!error || ruleScope === 'attachment') {
        return error;
    }

    return error.replace(/Attachment folder/g, 'Image folder').replace(/attachment folder/g, 'image folder');
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

const uniqueSorted = (values: readonly string[]): string[] => [...new Set(values)].sort();

const getErrorMessage = (error: unknown): string => {
    return error instanceof Error ? error.message : String(error);
};
