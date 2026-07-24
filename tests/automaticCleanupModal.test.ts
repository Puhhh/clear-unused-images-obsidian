import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TFile } from 'obsidian';

const promptMock = vi.fn(async () => true);

vi.mock('../src/reviewModal', () => {
    return {
        CleanupReviewModal: vi.fn().mockImplementation(function CleanupReviewModal() {
            return { prompt: promptMock };
        }),
    };
});

vi.mock('../src/util', async () => {
    const actual = await vi.importActual<typeof import('../src/util')>('../src/util');
    return {
        ...actual,
        getUnusedAttachments: vi.fn(),
    };
});

import OzanClearImages from '../src/main';
import * as Util from '../src/util';
import { CleanupReviewModal } from '../src/reviewModal';

const excludedFile = { path: 'protected.png' } as TFile;

describe('automatic cleanup with fully excluded unused images', () => {
    beforeEach(() => {
        promptMock.mockClear();
        (CleanupReviewModal as unknown as ReturnType<typeof vi.fn>).mockClear();
        (Util.getUnusedAttachments as ReturnType<typeof vi.fn>).mockReset();
        (Util.getUnusedAttachments as ReturnType<typeof vi.fn>).mockResolvedValue({
            unusedAttachments: [],
            excludedAttachments: [excludedFile],
        });
    });

    const createPlugin = (): OzanClearImages => {
        const plugin = new OzanClearImages(
            {} as ConstructorParameters<typeof OzanClearImages>[0],
            {} as ConstructorParameters<typeof OzanClearImages>[1]
        );
        plugin.app = {} as OzanClearImages['app'];
        plugin.settings = {} as OzanClearImages['settings'];
        return plugin;
    };

    it('does not open the review modal for automatic (non-interactive) runs', async () => {
        const plugin = createPlugin();

        await plugin.clearUnusedAttachments('image', { silentIfBusy: true, interactive: false });

        expect(CleanupReviewModal).not.toHaveBeenCalled();
        expect(plugin.cleanupInProgress).toBe(false);
    });

    it('does not block a subsequent periodic run after an automatic run finished', async () => {
        const plugin = createPlugin();

        await plugin.clearUnusedAttachments('image', { silentIfBusy: true, interactive: false });
        await plugin.clearUnusedAttachments('image', { silentIfBusy: true, interactive: false });

        expect(Util.getUnusedAttachments).toHaveBeenCalledTimes(2);
        expect(CleanupReviewModal).not.toHaveBeenCalled();
    });

    it('still opens the review modal for manual (interactive) runs', async () => {
        const plugin = createPlugin();

        await plugin.clearUnusedAttachments('image');

        expect(CleanupReviewModal).toHaveBeenCalledTimes(1);
        expect(promptMock).toHaveBeenCalledTimes(1);
    });
});
