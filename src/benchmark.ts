import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import chalk from 'chalk';
import type {
    BuildToolConfig,
    BenchmarkConfig,
    BenchmarkResults,
    BuildResults,
    BuildResult,
    ToolResults,
    HardwareInfo,
} from './types.js';
import { BuildToolError } from './errors.js';
import { getTimeArgs, parseMemoryUsage } from './memory.js';
import { calculateStats } from './statistics.js';
import { getBuildSize, getFileCount } from './filesystem.js';
import { printHardwareInfo, printSummary } from './reporter.js';

const BYTES_TO_GB = 1024 * 1024 * 1024;
const MS_TO_S = 1000;
const SPAWN_MAX_BUFFER = 10 * 1024 * 1024;
const SPAWN_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

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

    if (args.length === 0) {
        throw new Error('Command string is empty — cannot determine executable');
    }
    const [exe, ...rest] = args as [string, ...string[]];
    return [exe, rest];
}

export class Benchmarker {
    private results: BenchmarkResults = {};
    private config: BenchmarkConfig;
    private cwd: string;
    // Warn once per instance on Windows where memory measurement is unavailable
    private memoryWarningShown = false;

    constructor(config: BenchmarkConfig) {
        this.config = config;
        this.cwd = config.cwd || process.cwd();

        // Initialize results for each tool
        for (const tool of config.tools) {
            this.results[tool.name] = { cold: [], warm: [] };
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

    private getHardwareInfo(): HardwareInfo {
        const cpus = os.cpus();
        return {
            cpu: cpus[0]?.model ?? 'unknown',
            cores: cpus.length,
            totalMemoryGB: parseFloat((os.totalmem() / BYTES_TO_GB).toFixed(1)),
            platform: process.platform,
            osVersion: os.release(),
            nodeVersion: process.version,
        };
    }

    private async runIterations(tool: BuildToolConfig, env: Record<string, string>, clearCacheBeforeEach: boolean, label: string): Promise<BuildResults> {
        const buildResults: BuildResults = [];

        let outputSize: number | null = null;
        let outputFileCount: number | null = null;

        for (let i = 1; i <= this.config.iterations; i++) {
            try {
                console.log(chalk.gray(`\n[${label}] Run ${i}/${this.config.iterations}:`));
                const buildResult = await this.runBenchmark(tool, env, clearCacheBeforeEach);
                if (buildResult) {
                    // Measure size and file count once after first successful build
                    if (outputSize === null && tool.outputDir) {
                        const fullOutputDir = path.join(this.cwd, tool.outputDir);
                        outputSize = getBuildSize(fullOutputDir);
                        outputFileCount = getFileCount(fullOutputDir);
                    }

                    buildResult.size = outputSize ?? 0;
                    buildResult.fileCount = outputFileCount ?? 0;

                    console.log(chalk.green(`✓ Build time: ${buildResult.buildTime.toFixed(2)}s`));
                    console.log(chalk.green(`✓ Memory usage: ${buildResult.memoryUsage.toFixed(2)} MB`));
                    console.log(chalk.green(`✓ Output size: ${buildResult.size.toFixed(2)} MB`));
                    console.log(chalk.green(`✓ File count: ${buildResult.fileCount}`));

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

    private async benchmarkTool(tool: BuildToolConfig): Promise<ToolResults> {
        console.log(chalk.cyan(`\n===== Benchmarking ${tool.name} =====`));

        const env = {
            ...process.env,
            ...this.config.globalEnv,
            ...tool.env
        } as Record<string, string>;

        // Run one warmup iteration whose result is discarded (cold-start outlier)
        if (this.config.warmup) {
            console.log(chalk.gray('\nWarmup run (result discarded):'));
            await this.runBenchmark(tool, env, true);
        }

        const toolResults: ToolResults = { cold: [], warm: [] };

        if (this.config.cacheMode === 'cold' || this.config.cacheMode === 'both') {
            console.log(chalk.cyan(`\n--- Cold runs (cache cleared before each) ---`));
            toolResults.cold = await this.runIterations(tool, env, true, 'cold');
        }

        if (this.config.cacheMode === 'warm' || this.config.cacheMode === 'both') {
            console.log(chalk.cyan(`\n--- Warm runs (cache preserved) ---`));
            toolResults.warm = await this.runIterations(tool, env, false, 'warm');
        }

        return toolResults;
    }

    private async runBenchmark(tool: BuildToolConfig, env: Record<string, string>, shouldClearCache: boolean): Promise<BuildResult | undefined> {
        if (shouldClearCache) {
            console.log(chalk.gray('Clearing cache...'));
            this.clearCache(tool);
        }

        console.log(chalk.gray(`Executing: ${tool.command} in directory: ${this.cwd}`));
        // startTime is recorded after cache clearing and logging so that only
        // the actual build execution is measured.
        const startTime = Date.now();

        const timeArgs = getTimeArgs(process.platform as NodeJS.Platform);
        const [exe, cmdArgs] = splitCommand(tool.command);
        const spawnTimeout = this.config.timeout ?? SPAWN_TIMEOUT_MS;

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
                maxBuffer: SPAWN_MAX_BUFFER,
                timeout: spawnTimeout,
                stdio: ['ignore', 'inherit', 'pipe'],
            });

            if (result.error) {
                throw new BuildToolError(`Failed to spawn ${tool.name}: ${result.error.message}`);
            }
            if (result.status !== 0) {
                const stderr = (result.stderr as string | null) ?? '';
                throw new BuildToolError(`${tool.name} exited with code ${result.status}${stderr ? `\n${stderr}` : ''}`);
            }

            const parsed = parseMemoryUsage((result.stderr as string | null) ?? '');
            memoryUsage = parsed ?? 0;
        } else {
            // Windows — no /usr/bin/time available
            if (!this.memoryWarningShown) {
                console.log(chalk.yellow('Warning: Memory measurement is not supported on Windows. Memory usage will be reported as 0.'));
                this.memoryWarningShown = true;
            }

            const result = spawnSync(exe, cmdArgs, {
                cwd: this.cwd,
                env,
                encoding: 'utf8',
                maxBuffer: SPAWN_MAX_BUFFER,
                timeout: spawnTimeout,
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
        const buildTime = (endTime - startTime) / MS_TO_S;

        return {
            buildTime,
            memoryUsage,
            size: 0,       // populated in runIterations after first successful build
            fileCount: 0,  // populated in runIterations after first successful build
        };
    }

    public async run(): Promise<{ results: BenchmarkResults; hardware: HardwareInfo }> {
        const hardware = this.getHardwareInfo();
        printHardwareInfo(hardware);

        for (const tool of this.config.tools) {
            const toolResults = await this.benchmarkTool(tool);
            this.results[tool.name] = toolResults;
        }

        printSummary(this.config, this.results);
        return { results: this.results, hardware };
    }
}

// Re-export calculateStats so existing consumers (tests, cli) can import it from here
// without breaking changes if they were importing from benchmark directly.
export { calculateStats };
