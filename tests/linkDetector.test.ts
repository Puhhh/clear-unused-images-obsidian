import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('link detector source', () => {
    it('avoids regex lookbehind for iOS compatibility', () => {
        const source = readFileSync(join(process.cwd(), 'src/linkDetector.ts'), 'utf8');

        expect(source.includes('(?<=')).toBe(false);
        expect(source.includes('(?<!')).toBe(false);
    });
});
