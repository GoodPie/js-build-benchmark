import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import type { BuildToolConfig, BenchmarkConfig, BenchmarkResults, BuildStats, BuildResults, BuildResult } from './types';
import { BuildToolError } from './errors';

// Warn once per run on Windows where memory measurement is unavailable
let memoryWarningShown = false;

function getTimeArgs(): string[] | null {
    if (process.platform === 'win32') {
        return null;
    }
    // macOS uses -l, Linux uses -v
    return process.platform === 'darwin' ? ['/usr/bin/time', '-l'] : ['/usr/bin/time', '-v'];
}

function parseMemoryUsage(timeOutput: string): number {
    if (process.platform === 'darwin') {
        // macOS: "maximum resident set size" is in bytes
        const match = timeOutput.match(/(\d+)\s+maximum resident set size/);
        if (match && match[1]) {
            return parseInt(match[1], 10) / 1024 / 1024;
        }
    } else if (process.platform === 'linux') {
        // Linux: "Maximum resident set size" is in KB
        const match = timeOutput.match(/Maximum resident set size \(kbytes\):\s*(\d+)/);
        if (match && match[1]) {
            return parseInt(match[1], 10) / 1024;
        }
    }
    return 0;
}

// Split a shell command string into [executable, ...args] for safe use with spawnSync.
// This handles quoted arguments (single and double) and basic escaping, which is enough
// for the build tool commands users configure. It does not handle subshell expansion by
// design — that's the point: no shell is involved.
function splitCommand(command: string): [string, string[]] {
    const args: string[] = [];
    let current = '';
    let inSingle = false;
    let inDouble = false;

    for (let i = 0; i < command.length; i++) {
        const ch = command[i]!;
        if (ch === '\\' && !inSingle) {
            current += command[++i] ?? '';
        } else if (ch === "'" && !inDouble) {
            inSingle = !inSingle;
        } else if (ch === '"' && !inSingle) {
            inDouble = !inDouble;
        } else if (ch === ' ' && !inSingle && !inDouble) {
            if (current.length > 0) {
                args.push(current);
                current = '';
            }
        } else {
            current += ch;
        }
    }
    if (current.length > 0) args.push(current);

    const [exe, ...rest] = args as [string, ...string[]];
    return [exe, rest];
}

export class Benchmarker {
    private results: BenchmarkResults = {};
    private config: BenchmarkConfig;
    private cwd: string;

    constructor(config: BenchmarkConfig) {
        this.config = config;
        this.cwd = config.cwd || process.cwd();

        // Initialize results for each tool
        for (const tool of config.tools) {
            this.results[tool.name] = [] as BuildResults;
        }
    }

    protected clearCache(tool: BuildToolConfig): void {
        try {
            if (tool.clearCacheCommand) {
                const [exe, args] = splitCommand(tool.clearCacheCommand);
                const result = spawnSync(exe, args, { cwd: this.cwd, encoding: 'utf8' });
                if (result.error) throw result.error;
            }

            if (tool.clearCacheDir) {
                const cachePath = path.join(this.cwd, tool.clearCacheDir);
                if (fs.existsSync(cachePath)) {
                    fs.rmSync(cachePath, { recursive: true, force: true });
                }
            }
        } catch (err: unknown) {
            console.error(chalk.yellow(`Warning: Error clearing cache for ${tool.name}:`, err instanceof Error ? err.message : String(err)));
        }
    }

    protected getBuildSize(outputDir: string): number {
        try {
            if (!fs.existsSync(outputDir)) {
                return 0;
            }

            if (process.platform !== 'win32') {
                // spawnSync with an arg array — outputDir is never shell-expanded
                // du -sk returns size in kilobytes as a plain integer with no unit suffix
                const result = spawnSync('du', ['-sk', outputDir], { encoding: 'utf8' });
                if (result.error) throw result.error;
                const kb = parseInt((result.stdout as string).trim().split('\t')[0] ?? '0', 10);
                return kb / 1024;
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
                return totalSize / (1024 * 1024);
            }
        } catch (err: unknown) {
            console.error(chalk.yellow(`Warning: Error getting build size:`, err instanceof Error ? err.message : String(err)));
            return 0;
        }
    }

    protected calculateStats(arr: number[]): BuildStats {
        const sum = arr.reduce((a, b) => a + b, 0);
        const avg = sum / arr.length;
        const min = Math.min(...arr);
        const max = Math.max(...arr);

        return {
            avg: avg.toFixed(2),
            min: min.toFixed(2),
            max: max.toFixed(2)
        };
    }

    private async benchmarkTool(tool: BuildToolConfig): Promise<BuildResults> {
        console.log(chalk.cyan(`\n===== Benchmarking ${tool.name} =====`));

        const env = {
            ...process.env,
            ...this.config.globalEnv,
            ...tool.env
        } as Record<string, string>;

        const buildResults: BuildResults = [];

        // Run one warmup iteration whose result is discarded (cold-start outlier)
        if (this.config.warmup) {
            console.log(chalk.gray('\nWarmup run (result discarded):'));
            await this.runBenchmark(tool, env);
        }

        // Track output size after the first successful build — it doesn't change between iterations
        let outputSize: number | null = null;

        for (let i = 1; i <= this.config.iterations; i++) {
            try {
                console.log(chalk.gray(`\nRun ${i}/${this.config.iterations}:`));
                const buildResult = await this.runBenchmark(tool, env);
                if (buildResult) {
                    // Measure size once after first successful build
                    if (outputSize === null && tool.outputDir) {
                        outputSize = this.getBuildSize(path.join(this.cwd, tool.outputDir));
                    }

                    buildResult.size = outputSize ?? 0;

                    console.log(chalk.green(`✓ Build time: ${buildResult.buildTime.toFixed(2)}s`));
                    console.log(chalk.green(`✓ Memory usage: ${buildResult.memoryUsage.toFixed(2)} MB`));
                    console.log(chalk.green(`✓ Output size: ${buildResult.size.toFixed(2)} MB`));

                    buildResults.push(buildResult);
                } else {
                    throw new BuildToolError(`Failed to run benchmark for ${tool.name}`);
                }
            } catch (error: unknown) {
                console.error(chalk.red(`Error running ${tool.name}:`, error instanceof Error ? error.message : String(error)));
                console.log(chalk.yellow('Continuing to next iteration...'));
            }
        }

        return buildResults;
    }

    private async runBenchmark(tool: BuildToolConfig, env: Record<string, string>): Promise<BuildResult | undefined> {
        // Clear the cache
        if (this.config.clearCache) {
            console.log(chalk.gray('Clearing cache...'));
            this.clearCache(tool);
        }

        console.log(chalk.gray(`Executing: ${tool.command} in directory: ${this.cwd}`));
        const startTime = Date.now();

        const timeArgs = getTimeArgs();
        const [exe, cmdArgs] = splitCommand(tool.command);

        let memoryUsage = 0;

        if (timeArgs) {
            // Prepend /usr/bin/time args before the build command.
            // stdio: ['ignore', 'inherit', 'pipe'] means:
            //   - stdin: closed (builds don't need it)
            //   - stdout: forwarded to the terminal so build output is visible
            //   - stderr: captured into result.stderr — /usr/bin/time writes here,
            //             and build tool stderr is also here, but time output has a
            //             distinctive format that won't match build tool output
            const [timeExe, ...timeFlags] = timeArgs as [string, ...string[]];
            const result = spawnSync(timeExe, [...timeFlags, exe, ...cmdArgs], {
                cwd: this.cwd,
                env,
                encoding: 'utf8',
                maxBuffer: 10 * 1024 * 1024,
                stdio: ['ignore', 'inherit', 'pipe'],
            });

            if (result.error) {
                throw new BuildToolError(`Failed to spawn ${tool.name}: ${result.error.message}`);
            }
            if (result.status !== 0) {
                const stderr = (result.stderr as string | null) ?? '';
                throw new BuildToolError(`${tool.name} exited with code ${result.status}${stderr ? `\n${stderr}` : ''}`);
            }

            memoryUsage = parseMemoryUsage((result.stderr as string | null) ?? '');
        } else {
            // Windows — no /usr/bin/time available
            if (!memoryWarningShown) {
                console.log(chalk.yellow('Warning: Memory measurement is not supported on Windows. Memory usage will be reported as 0.'));
                memoryWarningShown = true;
            }

            const result = spawnSync(exe, cmdArgs, {
                cwd: this.cwd,
                env,
                encoding: 'utf8',
                maxBuffer: 10 * 1024 * 1024,
                stdio: ['ignore', 'inherit', 'inherit'],
            });

            if (result.error) {
                throw new BuildToolError(`Failed to spawn ${tool.name}: ${result.error.message}`);
            }
            if (result.status !== 0) {
                throw new BuildToolError(`${tool.name} exited with code ${result.status}`);
            }
        }

        const endTime = Date.now();
        const buildTime = (endTime - startTime) / 1000;

        return {
            buildTime,
            memoryUsage,
            size: 0, // populated in benchmarkTool after first successful build
        };
    }

    public async run(): Promise<BenchmarkResults> {
        for (const tool of this.config.tools) {
            const toolResults = await this.benchmarkTool(tool);
            this.results[tool.name] = toolResults;
        }

        this.printSummary();
        return this.results;
    }

    private printSummary(): void {
        console.log(chalk.cyan('\n===== BENCHMARK SUMMARY ====='));

        for (const tool of this.config.tools as BuildToolConfig[]) {
            const buildResults = this.results[tool.name] as BuildResults;

            const buildTimeResults = buildResults.map((result) => result.buildTime);
            const buildMemoryResults = buildResults.map((result) => result.memoryUsage);
            const buildSizeResults = buildResults.map((result) => result.size);

            if (buildTimeResults.length > 0) {
                const times = this.calculateStats(buildTimeResults);
                const memory = this.calculateStats(buildMemoryResults);
                // Size is constant across iterations — just report the single value
                const sizeValue = buildSizeResults[0]?.toFixed(2) ?? '0.00';

                console.log(chalk.bold(`\n${tool.name.toUpperCase()}:`));
                console.log(`Build time (s): avg=${times.avg}, min=${times.min}, max=${times.max}`);
                console.log(`Memory usage (MB): avg=${memory.avg}, min=${memory.min}, max=${memory.max}`);
                console.log(`Output size (MB): ${sizeValue}`);
            } else {
                console.log(chalk.yellow(`\n${tool.name.toUpperCase()}: no successful runs`));
            }
        }

        // Print comparisons if there are multiple tools
        if (this.config.tools.length > 1) {
            this.printComparisons();
        }
    }

    private printComparisons(): void {
        console.log(chalk.cyan('\n===== COMPARISONS ====='));

        const baselineTool = this.config.tools[0] as BuildToolConfig;
        const baselineResults = this.results[baselineTool.name] as BuildResults;

        if (baselineResults.length === 0) {
            console.log(chalk.yellow(`Skipping comparisons: baseline tool "${baselineTool.name}" had no successful runs.`));
            return;
        }

        const baselineTimeResults = baselineResults.map((result) => result.buildTime);
        const baselineMemoryResults = baselineResults.map((result) => result.memoryUsage);
        const baselineSizeResults = baselineResults.map((result) => result.size);

        for (let i = 1; i < this.config.tools.length; i++) {
            const comparisonTool = this.config.tools[i] as BuildToolConfig;
            const comparisonResults = this.results[comparisonTool.name] as BuildResults;

            if (comparisonResults.length === 0) {
                console.log(chalk.yellow(`\nSkipping ${comparisonTool.name} vs ${baselineTool.name}: no successful runs for ${comparisonTool.name}.`));
                continue;
            }

            const comparisonTimeResults = comparisonResults.map((result) => result.buildTime);
            const comparisonMemoryResults = comparisonResults.map((result) => result.memoryUsage);
            const comparisonSizeResults = comparisonResults.map((result) => result.size);

            const baselineAvgTime = parseFloat(this.calculateStats(baselineTimeResults).avg);
            const comparisonAvgTime = parseFloat(this.calculateStats(comparisonTimeResults).avg);

            const baselineAvgMem = parseFloat(this.calculateStats(baselineMemoryResults).avg);
            const comparisonAvgMem = parseFloat(this.calculateStats(comparisonMemoryResults).avg);

            const baselineAvgSize = parseFloat(this.calculateStats(baselineSizeResults).avg);
            const comparisonAvgSize = parseFloat(this.calculateStats(comparisonSizeResults).avg);

            // Always express the ratio as >= 1 so "5x faster" and "5x slower" are both readable
            const timeFasterOrSlower = comparisonAvgTime < baselineAvgTime ? 'faster' : 'slower';
            const timeRatio = timeFasterOrSlower === 'faster'
                ? (baselineAvgTime / comparisonAvgTime).toFixed(2)
                : (comparisonAvgTime / baselineAvgTime).toFixed(2);

            const memMoreOrLess = comparisonAvgMem < baselineAvgMem ? 'less' : 'more';
            const memRatio = memMoreOrLess === 'less'
                ? (baselineAvgMem / comparisonAvgMem).toFixed(2)
                : (comparisonAvgMem / baselineAvgMem).toFixed(2);

            const sizeMoreOrLess = comparisonAvgSize < baselineAvgSize ? 'smaller' : 'larger';
            const sizeRatio = sizeMoreOrLess === 'smaller'
                ? (baselineAvgSize / comparisonAvgSize).toFixed(2)
                : (comparisonAvgSize / baselineAvgSize).toFixed(2);

            console.log(chalk.bold(`\n${comparisonTool.name} vs ${baselineTool.name}:`));
            console.log(`Speed: ${comparisonTool.name} is ${timeRatio}x ${timeFasterOrSlower}`);
            console.log(`Memory: ${comparisonTool.name} uses ${memRatio}x ${memMoreOrLess} memory`);
            console.log(`Size: ${comparisonTool.name} output is ${sizeRatio}x ${sizeMoreOrLess}`);
        }
    }
}
