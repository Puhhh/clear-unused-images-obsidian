import { describe, expect, it } from 'vitest';

import { walkFrontmatterValues } from '../src/frontmatterWalker';

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
});
