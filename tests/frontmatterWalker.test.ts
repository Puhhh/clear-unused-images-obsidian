import { describe, expect, it } from 'vitest';

import { MAX_FRONTMATTER_WALK_DEPTH, walkFrontmatterValues } from '../src/frontmatterWalker';

describe('walkFrontmatterValues', () => {
    it('visits strings inside arrays and nested objects', () => {
        const visited: string[] = [];

        walkFrontmatterValues(
            {
                cover: 'assets/photo.png',
                attachments: ['docs/report.pdf', { nested: 'audio/song.mp3' }],
                ignored: 42,
            },
            (value) => visited.push(value)
        );

        expect(visited).toEqual(['assets/photo.png', 'docs/report.pdf', 'audio/song.mp3']);
    });

    it('stops before excessively deep frontmatter can overflow the stack', () => {
        const visited: string[] = [];
        let withinLimit: unknown = 'assets/cover.png';
        for (let depth = 0; depth < MAX_FRONTMATTER_WALK_DEPTH - 1; depth++) {
            withinLimit = { nested: withinLimit };
        }

        let beyondLimit: unknown = 'assets/too-deep.png';
        for (let depth = 0; depth < MAX_FRONTMATTER_WALK_DEPTH; depth++) {
            beyondLimit = { nested: beyondLimit };
        }

        walkFrontmatterValues({ withinLimit, beyondLimit }, (value) => visited.push(value));

        expect(visited).toEqual(['assets/cover.png']);
    });
});
