export const MAX_FRONTMATTER_WALK_DEPTH = 64;

export const walkFrontmatterValues = (
    frontmatterValue: unknown,
    visitString: (value: string) => void,
    maxDepth = MAX_FRONTMATTER_WALK_DEPTH
): void => {
    const visit = (value: unknown, depth: number): void => {
        if (depth > maxDepth) {
            return;
        }

        if (typeof value === 'string') {
            visitString(value);
            return;
        }

        if (Array.isArray(value)) {
            for (const nestedValue of value) {
                visit(nestedValue, depth + 1);
            }
            return;
        }

        if (value && typeof value === 'object') {
            for (const nestedValue of Object.values(value as Record<string, unknown>)) {
                visit(nestedValue, depth + 1);
            }
        }
    };

    visit(frontmatterValue, 0);
};
