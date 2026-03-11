/**
 * Pure functions for memory usage measurement via /usr/bin/time output.
 * Exported separately so they can be tested against fixture strings without
 * requiring a specific platform to be the host OS.
 */

export function getTimeArgs(platform: NodeJS.Platform = process.platform): string[] | null {
    if (platform === 'win32') {
        return null;
    }
    return platform === 'darwin' ? ['/usr/bin/time', '-l'] : ['/usr/bin/time', '-v'];
}

/**
 * Parses memory usage from `/usr/bin/time` output.
 * Returns the memory in MB, or:
 * - `null` if the regex did not match (measurement failed — should not be treated as 0)
 * - `0` for Windows where measurement is not supported (known limitation)
 */
export function parseMemoryUsage(timeOutput: string, platform: NodeJS.Platform = process.platform): number | null {
    if (platform === 'darwin') {
        // macOS: "maximum resident set size" is in bytes
        const match = timeOutput.match(/(\d+)\s+maximum resident set size/);
        if (match && match[1]) {
            return parseInt(match[1], 10) / 1024 / 1024;
        }
        return null;
    } else if (platform === 'linux') {
        // Linux: "Maximum resident set size" is in KB
        const match = timeOutput.match(/Maximum resident set size \(kbytes\):\s*(\d+)/);
        if (match && match[1]) {
            return parseInt(match[1], 10) / 1024;
        }
        return null;
    }
    // Windows: memory measurement unavailable
    return 0;
}
