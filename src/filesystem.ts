import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';

const KB_TO_MB = 1024;
const BYTES_TO_MB = 1024 * 1024;
const SPAWN_MAX_BUFFER = 10 * 1024 * 1024;

/**
 * Returns the size of outputDir in megabytes.
 * Returns 0 if the directory does not exist or measurement fails.
 */
export function getBuildSize(outputDir: string): number {
    try {
        if (!fs.existsSync(outputDir)) {
            return 0;
        }

        if (process.platform !== 'win32') {
            // spawnSync with an arg array — outputDir is never shell-expanded
            // du -sk returns size in kilobytes as a plain integer with no unit suffix
            const result = spawnSync('du', ['-sk', outputDir], {
                encoding: 'utf8',
                maxBuffer: SPAWN_MAX_BUFFER,
            });
            if (result.error) throw result.error;
            const kb = parseInt((result.stdout as string).trim().split('\t')[0] ?? '0', 10);
            return kb / KB_TO_MB;
        } else {
            let totalSize = 0;

            const calculateDirSize = (dirPath: string): void => {
                const files = fs.readdirSync(dirPath);
                for (const file of files) {
                    const filePath = path.join(dirPath, file);
                    const stats = fs.statSync(filePath);
                    if (stats.isDirectory()) {
                        calculateDirSize(filePath);
                    } else {
                        totalSize += stats.size;
                    }
                }
            };

            calculateDirSize(outputDir);
            return totalSize / BYTES_TO_MB;
        }
    } catch (err: unknown) {
        console.error(chalk.yellow(`Warning: Error getting build size:`, err instanceof Error ? err.message : String(err)));
        return 0;
    }
}

/**
 * Returns the number of files under outputDir, recursively.
 * Returns 0 if the directory does not exist or counting fails.
 */
export function getFileCount(outputDir: string): number {
    try {
        if (!fs.existsSync(outputDir)) {
            return 0;
        }

        let count = 0;
        const countFiles = (dirPath: string): void => {
            const entries = fs.readdirSync(dirPath);
            for (const entry of entries) {
                const entryPath = path.join(dirPath, entry);
                const stats = fs.statSync(entryPath);
                if (stats.isDirectory()) {
                    countFiles(entryPath);
                } else {
                    count++;
                }
            }
        };

        countFiles(outputDir);
        return count;
    } catch (err: unknown) {
        console.error(chalk.yellow(`Warning: Error counting output files:`, err instanceof Error ? err.message : String(err)));
        return 0;
    }
}
