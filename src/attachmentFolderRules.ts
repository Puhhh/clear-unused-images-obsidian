const MAX_RULE_COUNT = 50;
const MAX_SUFFIX_LENGTH = 64;
const MAX_RULE_LENGTH = 256;

export type AttachmentFolderRule =
    | {
          kind: 'suffix';
          value: string;
          canonical: string;
          label: string;
      }
    | {
          kind: 'parent-path';
          value: string;
          canonical: string;
          label: string;
      }
    | {
          kind: 'recursive-parent-path';
          value: string;
          canonical: string;
          label: string;
      }
    | {
          kind: 'regex';
          value: string;
          expression: RegExp;
          canonical: string;
          label: string;
      };

export interface ParsedAttachmentFolderRules {
    rules: AttachmentFolderRule[];
    canonicalRules: string[];
    error?: string;
}

export const parseAttachmentFolderRules = (input: string): ParsedAttachmentFolderRules => {
    const rawEntries = splitRuleEntries(input);
    if (rawEntries.length > MAX_RULE_COUNT) {
        return invalid(`Configure no more than ${MAX_RULE_COUNT.toString()} attachment folder rules.`);
    }

    const rules: AttachmentFolderRule[] = [];
    const canonicalRules = new Set<string>();

    for (const rawEntry of rawEntries) {
        const parsedRule = parseRule(rawEntry);
        if (typeof parsedRule === 'string') {
            return invalid(parsedRule);
        }

        if (!canonicalRules.has(parsedRule.canonical)) {
            canonicalRules.add(parsedRule.canonical);
            rules.push(parsedRule);
        }
    }

    return { rules, canonicalRules: [...canonicalRules] };
};

export const matchAttachmentFolderRule = (
    folderPath: string,
    folderName: string,
    parentPath: string,
    rules: readonly AttachmentFolderRule[]
): AttachmentFolderRule | null => {
    let matchedSuffix: AttachmentFolderRule | null = null;
    for (const rule of rules) {
        if (rule.kind === 'suffix' && folderName.toLowerCase().endsWith(rule.value)) {
            matchedSuffix ??= rule;
            continue;
        }

        if (rule.kind === 'parent-path' && parentPath === rule.value) {
            return rule;
        }

        if (rule.kind === 'recursive-parent-path' && parentPathEndsWithSegment(parentPath, rule.value)) {
            return rule;
        }

        if (rule.kind === 'regex' && folderPath.length <= 1024) {
            rule.expression.lastIndex = 0;
            if (rule.expression.test(folderPath)) {
                return rule;
            }
        }
    }

    return matchedSuffix;
};

const parseRule = (rawEntry: string): AttachmentFolderRule | string => {
    if (rawEntry.length > MAX_RULE_LENGTH || hasControlCharacter(rawEntry)) {
        return `Invalid attachment folder rule: ${rawEntry}. Rules must be at most ${MAX_RULE_LENGTH.toString()} characters.`;
    }

    if (rawEntry.startsWith('/')) {
        return parseRegexRule(rawEntry);
    }

    if (rawEntry.startsWith('.')) {
        return parseSuffixRule(rawEntry);
    }

    if (rawEntry === '**' || rawEntry.startsWith('**/')) {
        return parseRecursiveParentPathRule(rawEntry);
    }

    return parseParentPathRule(rawEntry);
};

const parseRecursiveParentPathRule = (rawEntry: string): AttachmentFolderRule | string => {
    const folderName = rawEntry.slice(3);
    if (
        folderName === '' ||
        folderName === '.' ||
        folderName === '..' ||
        folderName.includes('/') ||
        folderName.includes('\\') ||
        hasGlobCharacter(folderName)
    ) {
        return `Invalid recursive parent folder rule: ${rawEntry}. Use **/ followed by one literal folder name.`;
    }

    return {
        kind: 'recursive-parent-path',
        value: folderName,
        canonical: `recursive-parent-path:${folderName}`,
        label: `recursive parent path ${rawEntry}`,
    };
};

const parentPathEndsWithSegment = (parentPath: string, segment: string): boolean => {
    const boundaryIndex = parentPath.length - segment.length - 1;
    return (
        parentPath === segment ||
        (boundaryIndex >= 0 &&
            parentPath.charCodeAt(boundaryIndex) === '/'.charCodeAt(0) &&
            parentPath.endsWith(segment))
    );
};

const hasGlobCharacter = (value: string): boolean => {
    return /[*?[\]{}]/.test(value);
};

const parseSuffixRule = (rawEntry: string): AttachmentFolderRule | string => {
    if (
        rawEntry.length > MAX_SUFFIX_LENGTH ||
        rawEntry === '.' ||
        rawEntry.includes('..') ||
        /[/\\]/.test(rawEntry)
    ) {
        return `Invalid attachment folder suffix: ${rawEntry}. Use a literal value such as .html.`;
    }

    const value = rawEntry.toLowerCase();
    return {
        kind: 'suffix',
        value,
        canonical: `suffix:${value}`,
        label: `suffix ${rawEntry}`,
    };
};

const parseParentPathRule = (rawEntry: string): AttachmentFolderRule | string => {
    const pathSegments = rawEntry.split('/');
    if (
        rawEntry.startsWith('/') ||
        rawEntry.endsWith('/') ||
        rawEntry.includes('\\') ||
        pathSegments.some((segment) => segment === '' || segment === '.' || segment === '..')
    ) {
        return `Invalid attachment folder parent path: ${rawEntry}. Use a vault-relative path such as Attachments.`;
    }

    return {
        kind: 'parent-path',
        value: rawEntry,
        canonical: `parent-path:${rawEntry}`,
        label: `parent path ${rawEntry}`,
    };
};

const parseRegexRule = (rawEntry: string): AttachmentFolderRule | string => {
    if (rawEntry.length < 3 || !rawEntry.endsWith('/')) {
        return `Invalid attachment folder regular expression: ${rawEntry}. Use /expression/ without flags.`;
    }

    const source = rawEntry.slice(1, -1);
    const safetyError = validateSafeRegexSource(source);
    if (safetyError) {
        return `Invalid attachment folder regular expression: ${rawEntry}. ${safetyError}`;
    }

    let expression: RegExp;
    try {
        expression = new RegExp(source);
    } catch {
        return `Invalid attachment folder regular expression: ${rawEntry}. Check its syntax.`;
    }

    return {
        kind: 'regex',
        value: rawEntry,
        expression,
        canonical: `regex:${source}`,
        label: `regular expression ${rawEntry}`,
    };
};

const validateSafeRegexSource = (source: string): string | null => {
    if (!source.startsWith('^') || !source.endsWith('$') || source.length === 2) {
        return 'Expressions must be anchored with ^ and $.';
    }

    let quantifiedClassInSegment = false;
    let lastToken: { type: 'class'; matchesSlash: boolean } | { type: 'other' } | null = null;

    for (let index = 1; index < source.length - 1; index++) {
        const character = source[index];

        if (character === '\\') {
            const escapedCharacter = source[index + 1];
            if (!escapedCharacter || index + 1 >= source.length - 1) {
                return 'The expression contains an incomplete escape.';
            }

            if (/[1-9k]/.test(escapedCharacter)) {
                return 'Backreferences are not supported.';
            }

            if (escapedCharacter === '/') {
                quantifiedClassInSegment = false;
            }
            index++;
            lastToken = { type: 'other' };
            continue;
        }

        if (character === '[') {
            const classEnd = findCharacterClassEnd(source, index + 1);
            if (classEnd === -1 || classEnd >= source.length - 1) {
                return 'The expression contains an unclosed character class.';
            }

            const classSource = source.slice(index, classEnd + 1);
            let matchesSlash: boolean;
            try {
                matchesSlash = new RegExp(`^${classSource}$`).test('/');
            } catch {
                return 'The expression contains an invalid character class.';
            }

            lastToken = { type: 'class', matchesSlash };
            index = classEnd;
            continue;
        }

        if (character === '+' || character === '*' || character === '?') {
            if (lastToken?.type !== 'class') {
                return 'Quantifiers are supported only after character classes.';
            }
            if (lastToken.matchesSlash) {
                return 'A quantified character class must not match path separators.';
            }
            if (quantifiedClassInSegment) {
                return 'Use no more than one quantified character class per path segment.';
            }

            quantifiedClassInSegment = true;
            lastToken = { type: 'other' };
            continue;
        }

        if ('().|{}'.includes(character) || character === '.' || character === '^' || character === '$') {
            return 'Groups, alternation, wildcards, lookarounds, and bounded quantifiers are not supported.';
        }

        if (character === '/') {
            return 'Escape path separators as \\/.';
        }

        lastToken = { type: 'other' };
    }

    return null;
};

const findCharacterClassEnd = (source: string, startIndex: number): number => {
    let escaped = false;
    for (let index = startIndex; index < source.length; index++) {
        const character = source[index];
        if (escaped) {
            escaped = false;
        } else if (character === '\\') {
            escaped = true;
        } else if (character === ']') {
            return index;
        }
    }

    return -1;
};

const splitRuleEntries = (input: string): string[] => {
    const entries: string[] = [];
    let entry = '';
    let regexEntry = false;
    let inCharacterClass = false;
    let escaped = false;
    let regexClosed = false;

    const pushEntry = (): void => {
        const trimmedEntry = entry.trim();
        if (trimmedEntry.length > 0) {
            entries.push(trimmedEntry);
        }
        entry = '';
        regexEntry = false;
        inCharacterClass = false;
        escaped = false;
        regexClosed = false;
    };

    for (const character of input) {
        if (!regexEntry && entry.trim().length === 0 && character === '/') {
            regexEntry = true;
        }

        if ((character === ',' || character === '\n' || character === '\r') && (!regexEntry || regexClosed)) {
            pushEntry();
            continue;
        }

        entry += character;
        if (!regexEntry || regexClosed) {
            continue;
        }

        if (escaped) {
            escaped = false;
        } else if (character === '\\') {
            escaped = true;
        } else if (character === '[') {
            inCharacterClass = true;
        } else if (character === ']' && inCharacterClass) {
            inCharacterClass = false;
        } else if (character === '/' && entry.trim().length > 1 && !inCharacterClass) {
            regexClosed = true;
        }
    }

    pushEntry();
    return entries;
};

const hasControlCharacter = (value: string): boolean => {
    return [...value].some((character) => {
        const characterCode = character.charCodeAt(0);
        return characterCode <= 31 || characterCode === 127;
    });
};

const invalid = (error: string): ParsedAttachmentFolderRules => ({ rules: [], canonicalRules: [], error });
