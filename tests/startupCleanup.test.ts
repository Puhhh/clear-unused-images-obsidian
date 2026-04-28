import test from 'node:test';
import assert from 'node:assert/strict';

import {
    AUTO_CLEAN_EVERY_X_MINUTES_DEFAULT,
    AUTO_CLEAN_INTERVAL_MINUTES_DEFAULT,
    AUTO_CLEAN_ON_VAULT_LOAD_DEFAULT,
    createPeriodicCleanupScheduler,
    createVaultLoadCleanupScheduler,
    normalizeAutoCleanIntervalMinutes,
} from '../src/startupCleanup.ts';

test('auto cleanup on vault load is disabled by default', () => {
    assert.equal(AUTO_CLEAN_ON_VAULT_LOAD_DEFAULT, false);
});

test('periodic cleanup is disabled by default', () => {
    assert.equal(AUTO_CLEAN_EVERY_X_MINUTES_DEFAULT, false);
    assert.equal(AUTO_CLEAN_INTERVAL_MINUTES_DEFAULT, 15);
});

test('vault load cleanup scheduler runs image cleanup once when enabled', async () => {
    const calls: Array<'image' | 'all'> = [];
    const scheduler = createVaultLoadCleanupScheduler(async (callback) => {
        await callback();
    }, async (type) => {
        calls.push(type);
    });

    await scheduler(true);
    await scheduler(true);

    assert.deepEqual(calls, ['image']);
});

test('vault load cleanup scheduler does not run when disabled', async () => {
    const calls: Array<'image' | 'all'> = [];
    const scheduler = createVaultLoadCleanupScheduler(async (callback) => {
        await callback();
    }, async (type) => {
        calls.push(type);
    });

    await scheduler(false);

    assert.deepEqual(calls, []);
});

test('normalize auto-clean interval falls back to default for invalid values', () => {
    assert.equal(normalizeAutoCleanIntervalMinutes(undefined), AUTO_CLEAN_INTERVAL_MINUTES_DEFAULT);
    assert.equal(normalizeAutoCleanIntervalMinutes(0), AUTO_CLEAN_INTERVAL_MINUTES_DEFAULT);
    assert.equal(normalizeAutoCleanIntervalMinutes(-5), AUTO_CLEAN_INTERVAL_MINUTES_DEFAULT);
    assert.equal(normalizeAutoCleanIntervalMinutes('abc'), AUTO_CLEAN_INTERVAL_MINUTES_DEFAULT);
    assert.equal(normalizeAutoCleanIntervalMinutes('30'), 30);
});

test('periodic cleanup scheduler waits for vault ready and full interval before first run', async () => {
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

    assert.deepEqual(calls, []);
    assert.equal(timers.length, 0);

    readyCallbacks[0]?.();

    assert.deepEqual(calls, []);
    assert.equal(timers.length, 1);
    assert.equal(timers[0]?.intervalMs, 5 * 60 * 1000);

    timers[0]?.callback();

    assert.deepEqual(calls, ['image']);
});

test('periodic cleanup scheduler clears previous timer before rescheduling', async () => {
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

    assert.deepEqual(clearedTimers, [42]);
});

test('periodic cleanup scheduler does not schedule when cleanup is blocked', async () => {
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

    assert.equal(scheduledTimerCount, 0);
});

test('periodic cleanup scheduler skips timer tick when cleanup becomes blocked later', async () => {
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

    assert.deepEqual(calls, []);
});
