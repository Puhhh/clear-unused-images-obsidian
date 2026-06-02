import { describe, expect, it } from 'vitest';

import {
    AUTO_CLEAN_EVERY_X_MINUTES_DEFAULT,
    AUTO_CLEAN_INTERVAL_MINUTES_DEFAULT,
    AUTO_CLEAN_ON_VAULT_LOAD_DEFAULT,
    createPeriodicCleanupScheduler,
    createVaultLoadCleanupScheduler,
    normalizeAutoCleanIntervalMinutes,
} from '../src/startupCleanup';

describe('startup cleanup defaults', () => {
    it('keeps auto cleanup on vault load disabled by default', () => {
        expect(AUTO_CLEAN_ON_VAULT_LOAD_DEFAULT).toBe(false);
    });

    it('keeps periodic cleanup disabled by default', () => {
        expect(AUTO_CLEAN_EVERY_X_MINUTES_DEFAULT).toBe(false);
        expect(AUTO_CLEAN_INTERVAL_MINUTES_DEFAULT).toBe(15);
    });
});

describe('createVaultLoadCleanupScheduler', () => {
    it('runs image cleanup once when enabled', async () => {
        const calls: Array<'image' | 'all'> = [];
        const scheduler = createVaultLoadCleanupScheduler(async (callback) => {
            await callback();
        }, async (type) => {
            calls.push(type);
        });

        await scheduler(true);
        await scheduler(true);

        expect(calls).toEqual(['image']);
    });

    it('does not run when disabled', async () => {
        const calls: Array<'image' | 'all'> = [];
        const scheduler = createVaultLoadCleanupScheduler(async (callback) => {
            await callback();
        }, async (type) => {
            calls.push(type);
        });

        await scheduler(false);

        expect(calls).toEqual([]);
    });
});

describe('normalizeAutoCleanIntervalMinutes', () => {
    it('falls back to default for invalid values', () => {
        expect(normalizeAutoCleanIntervalMinutes(undefined)).toBe(AUTO_CLEAN_INTERVAL_MINUTES_DEFAULT);
        expect(normalizeAutoCleanIntervalMinutes(0)).toBe(AUTO_CLEAN_INTERVAL_MINUTES_DEFAULT);
        expect(normalizeAutoCleanIntervalMinutes(-5)).toBe(AUTO_CLEAN_INTERVAL_MINUTES_DEFAULT);
        expect(normalizeAutoCleanIntervalMinutes('abc')).toBe(AUTO_CLEAN_INTERVAL_MINUTES_DEFAULT);
        expect(normalizeAutoCleanIntervalMinutes('30')).toBe(30);
    });
});

describe('createPeriodicCleanupScheduler', () => {
    it('waits for vault ready and full interval before first run', async () => {
        const calls: Array<'image' | 'all'> = [];
        const readyCallbacks: Array<() => void> = [];
        const timers: Array<{ callback: () => void; intervalMs: number }> = [];
        const scheduler = createPeriodicCleanupScheduler(
            (callback) => {
                readyCallbacks.push(callback);
            },
            (callback, intervalMs) => {
                timers.push({ callback, intervalMs });
                return timers.length;
            },
            () => {},
            async (type) => {
                calls.push(type);
            }
        );

        scheduler({
            enabled: true,
            intervalMinutes: 5,
            canRunCleanup: () => true,
        });

        expect(calls).toEqual([]);
        expect(timers.length).toBe(0);

        readyCallbacks[0]?.();

        expect(calls).toEqual([]);
        expect(timers.length).toBe(1);
        expect(timers[0]?.intervalMs).toBe(5 * 60 * 1000);

        timers[0]?.callback();

        expect(calls).toEqual(['image']);
    });

    it('clears previous timer before rescheduling', async () => {
        const readyCallbacks: Array<() => void> = [];
        const clearedTimers: number[] = [];
        const scheduler = createPeriodicCleanupScheduler(
            (callback) => {
                readyCallbacks.push(callback);
            },
            () => 42,
            (timerId) => {
                clearedTimers.push(timerId);
            },
            async () => {}
        );

        scheduler({
            enabled: true,
            intervalMinutes: 5,
            canRunCleanup: () => true,
        });
        readyCallbacks[0]?.();

        scheduler({
            enabled: true,
            intervalMinutes: 10,
            canRunCleanup: () => true,
        });

        expect(clearedTimers).toEqual([42]);
    });

    it('does not schedule when cleanup is blocked', async () => {
        const readyCallbacks: Array<() => void> = [];
        let scheduledTimerCount = 0;
        const scheduler = createPeriodicCleanupScheduler(
            (callback) => {
                readyCallbacks.push(callback);
            },
            () => {
                scheduledTimerCount += 1;
                return scheduledTimerCount;
            },
            () => {},
            async () => {}
        );

        scheduler({
            enabled: true,
            intervalMinutes: 5,
            canRunCleanup: () => false,
        });
        readyCallbacks[0]?.();

        expect(scheduledTimerCount).toBe(0);
    });

    it('skips timer tick when cleanup becomes blocked later', async () => {
        const calls: Array<'image' | 'all'> = [];
        const timers: Array<() => void> = [];
        let canRunCleanup = true;
        const scheduler = createPeriodicCleanupScheduler(
            (callback) => {
                callback();
            },
            (callback) => {
                timers.push(callback);
                return timers.length;
            },
            () => {},
            async (type) => {
                calls.push(type);
            }
        );

        scheduler({
            enabled: true,
            intervalMinutes: 5,
            canRunCleanup: () => canRunCleanup,
        });

        canRunCleanup = false;
        timers[0]?.();

        expect(calls).toEqual([]);
    });
});
