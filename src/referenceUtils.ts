export const IMAGE_EXTENSIONS: Set<string> = new Set(['jpeg', 'jpg', 'png', 'gif', 'svg', 'bmp', 'webp']);

const EXTERNAL_REFERENCE_REGEX = /^(https?:|data:|mailto:)/i;

export const hasImageExtension = (path: string): boolean => {
    const trimmedPath = path.trim();
    if (!trimmedPath) {
        return false;
    }

    const cleanPath = trimmedPath.split(/[?#]/, 1)[0].toLowerCase();
    const extensionIndex = cleanPath.lastIndexOf('.');
    if (extensionIndex === -1) {
        return false;
    }

    return IMAGE_EXTENSIONS.has(cleanPath.slice(extensionIndex + 1));
};

export const resolveVaultAttachmentReference = (
    reference: string,
    sourcePath: string,
    resolveLinkpathDest: (referencePath: string, sourceFilePath: string) => string | null,
    hasExactPath: (path: string) => boolean,
    scope: 'image' | 'all' = 'image'
): string | null => {
    const trimmedReference = reference.trim();
    if (!trimmedReference || EXTERNAL_REFERENCE_REGEX.test(trimmedReference)) {
        return null;
    }

    if (scope === 'image' && !hasImageExtension(trimmedReference)) {
        return null;
    }

    const resolvedPath = resolveLinkpathDest(trimmedReference, sourcePath);
    if (resolvedPath) {
        return resolvedPath;
    }

    return hasExactPath(trimmedReference) ? trimmedReference : null;
};

export const parseMarkdownLinkDestination = (markdownMatch: string): string => {
    const openParenIndex = markdownMatch.indexOf('](');
    if (openParenIndex === -1) {
        return '';
    }

    const rawDestination = markdownMatch.slice(openParenIndex + 2, -1).trim();
    if (!rawDestination) {
        return '';
    }

    if (rawDestination.startsWith('<')) {
        const closingAngleIndex = rawDestination.indexOf('>');
        if (closingAngleIndex === -1) {
            return '';
        }

        return unescapeMarkdownDestination(rawDestination.slice(1, closingAngleIndex).trim());
    }

    const destinationEnd = findMarkdownDestinationEnd(rawDestination);
    return unescapeMarkdownDestination(rawDestination.slice(0, destinationEnd).trim());
};

export const splitExcludedExtensions = (input: string): Set<string> => {
    return new Set(
        input
            .split(',')
            .map((extension) => extension.trim().replace(/^\.+/, '').toLowerCase())
            .filter((extension) => extension.length > 0)
    );
};

export const isExtensionExcluded = (extension: string, excludedExtensions: ReadonlySet<string>): boolean => {
    return excludedExtensions.has(extension.trim().replace(/^\.+/, '').toLowerCase());
};

export const splitExcludedFolders = (input: string): string[] => {
    return input
        .split(',')
        .map((folderPath) => normalizePath(folderPath))
        .filter((folderPath) => folderPath.length > 0);
};

export const isPathCoveredByExcludedFolder = (
    candidateFolderPath: string,
    excludedFolderPath: string,
    includeSubfolders: boolean
): boolean => {
    const normalizedCandidate = normalizePath(candidateFolderPath);
    const normalizedExcluded = normalizePath(excludedFolderPath);

    if (!normalizedCandidate || !normalizedExcluded) {
        return false;
    }

    if (!includeSubfolders) {
        return normalizedCandidate === normalizedExcluded;
    }

    return (
        normalizedCandidate === normalizedExcluded || normalizedCandidate.startsWith(`${normalizedExcluded}/`)
    );
};

export const extractMarkdownLinkMatches = (text: string): string[] => {
    const matches: string[] = [];

    for (let index = 0; index < text.length; index++) {
        if (text[index] !== '[' || isEscaped(text, index)) {
            continue;
        }

        const closingBracketIndex = findClosingDelimiter(text, index, '[', ']');
        if (closingBracketIndex === -1 || text[closingBracketIndex + 1] !== '(') {
            continue;
        }

        const openingParenIndex = closingBracketIndex + 1;
        const closingParenIndex = findClosingDelimiter(text, openingParenIndex, '(', ')');
        if (closingParenIndex === -1) {
            continue;
        }

        matches.push(text.slice(index, closingParenIndex + 1));
        index = closingParenIndex;
    }

    return matches;
};

const normalizePath = (path: string): string => {
    return path.trim().replace(/^\/+|\/+$/g, '');
};

const isEscaped = (text: string, index: number): boolean => {
    let slashCount = 0;
    for (let cursor = index - 1; cursor >= 0 && text[cursor] === '\\'; cursor--) {
        slashCount++;
    }

    return slashCount % 2 === 1;
};

const findClosingDelimiter = (text: string, openingIndex: number, openingChar: string, closingChar: string): number => {
    let depth = 0;

    for (let index = openingIndex; index < text.length; index++) {
        if (isEscaped(text, index)) {
            continue;
        }

        if (text[index] === openingChar) {
            depth++;
        } else if (text[index] === closingChar) {
            depth--;
            if (depth === 0) {
                return index;
            }
        }
    }

    return -1;
};

const findMarkdownDestinationEnd = (destination: string): number => {
    let escaped = false;

    for (let index = 0; index < destination.length; index++) {
        const character = destination[index];
        if (escaped) {
            escaped = false;
            continue;
        }

        if (character === '\\') {
            escaped = true;
            continue;
        }

        if (/\s/.test(character)) {
            return index;
        }
    }

    return destination.length;
};

const unescapeMarkdownDestination = (destination: string): string => {
    return destination.replace(/\\([\\[\]()<>\s!#%&'*,.:;=?@^`~])/g, '$1');
};
