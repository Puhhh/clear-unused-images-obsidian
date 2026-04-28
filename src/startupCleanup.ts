export const AUTO_CLEAN_ON_VAULT_LOAD_DEFAULT = false;
export const AUTO_CLEAN_EVERY_X_MINUTES_DEFAULT = false;
export const AUTO_CLEAN_INTERVAL_MINUTES_DEFAULT = 15;
export const MIN_AUTO_CLEAN_INTERVAL_MINUTES = 1;

export type CleanupScope = 'all' | 'image';

export const normalizeAutoCleanIntervalMinutes = (value: number | string | null | undefined): number => {
    const parsedValue = typeof value === 'string' ? Number.parseInt(value, 10) : value;
    if (!Number.isFinite(parsedValue) || parsedValue === undefined || parsedValue < MIN_AUTO_CLEAN_INTERVAL_MINUTES) {
        return AUTO_CLEAN_INTERVAL_MINUTES_DEFAULT;
    }

    return Math.floor(parsedValue);
};

export const createVaultLoadCleanupScheduler = (
    onVaultReady: (callback: () => void | Promise<void>) => void,
    runCleanup: (type: CleanupScope) => Promise<void>
) => {
    let alreadyScheduled = false;

    return async (enabled: boolean): Promise<void> => {
        if (!enabled || alreadyScheduled) {
            return;
        }

        alreadyScheduled = true;
        onVaultReady(() => runCleanup('image'));
    };
};

export interface PeriodicCleanupScheduleOptions {
    enabled: boolean;
    intervalMinutes: number | string;
    canRunCleanup: () => boolean;
}

export const createPeriodicCleanupScheduler = <TimerId>(
    onVaultReady: (callback: () => void) => void,
    setRepeatingTimer: (callback: () => void, intervalMs: number) => TimerId,
    clearRepeatingTimer: (timerId: TimerId) => void,
    runCleanup: (type: CleanupScope) => Promise<void>
) => {
    let activeTimerId: TimerId | undefined;
    let scheduleToken = 0;

    return (options: PeriodicCleanupScheduleOptions): void => {
        scheduleToken += 1;
        const currentToken = scheduleToken;

        if (activeTimerId !== undefined) {
            clearRepeatingTimer(activeTimerId);
            activeTimerId = undefined;
        }

        if (!options.enabled) {
            return;
        }

        const intervalMs = normalizeAutoCleanIntervalMinutes(options.intervalMinutes) * 60 * 1000;
        onVaultReady(() => {
            if (currentToken !== scheduleToken || !options.canRunCleanup()) {
                return;
            }

            activeTimerId = setRepeatingTimer(() => {
                if (!options.canRunCleanup()) {
                    return;
                }

                void runCleanup('image');
            }, intervalMs);
        });
    };
};
