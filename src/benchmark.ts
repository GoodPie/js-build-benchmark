import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import type { BuildToolConfig, BenchmarkConfig, BenchmarkResults, BuildStats, BuildResults, BuildResult } from './types';
import { BuildToolError } from './errors';

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

    private clearCache(tool: BuildToolConfig): void {
        try {
            if (tool.clearCacheCommand) {
                execSync(tool.clearCacheCommand, { cwd: this.cwd });
            }

            if (tool.clearCacheDir) {
                const cachePath = path.join(this.cwd, tool.clearCacheDir);
                if (fs.existsSync(cachePath)) {
                    fs.rmSync(cachePath, { recursive: true, force: true });
                }
            }
        } catch (err: unknown) {
            if (err instanceof Error) {
                console.error(chalk.yellow(`Warning: Error clearing cache for ${tool.name}:`, err.message));
            }
        }
    }

    private getBuildSize(outputDir: string): number {
        try {
            console.log(chalk.gray(`build directory: ${outputDir}`))
            if (!fs.existsSync(outputDir)) {
                return 0;
            }

            if (process.platform !== 'win32') {
                const result = execSync(`du -sh "${outputDir}"`, { encoding: 'utf8' }).toString().trim();
                const size = parseInt(result.split('\t')[0] ?? "0", 10);
                return size || 0;
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
                const sizeMB = (totalSize / (1024 * 1024));
                return sizeMB;
            }
        } catch (err: unknown) {
            if (err instanceof Error) {
                console.error(chalk.yellow(`Warning: Error getting build size:`, err.message));
            }
            return 0;
        }
    }

    private calculateStats(arr: number[]): BuildStats {
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

        for (let i = 1; i <= this.config.iterations; i++) {
            try {
                console.log(chalk.gray(`\nRun ${i}/${this.config.iterations}:`));
                const buildResult = await this.runBenchmark(tool, env);
                if (buildResult) {
                    console.log(chalk.green(`✓ Build time: ${buildResult.buildTime.toFixed(2)}s`));
                    console.log(chalk.green(`✓ Memory usage: ${buildResult.memoryUsage.toFixed(2)} MB`));
                    console.log(chalk.green(`✓ Output size: ${buildResult.size} MB`));

                    buildResults.push(buildResult);
                } else {
                    throw new BuildToolError(`Failed to run benchmark for ${tool.name}`);
                }
            } catch (error: unknown) {
                if (error instanceof Error) {
                    console.error(chalk.red(`Error running ${tool.name}:`, error.message));
                }
                console.log(chalk.yellow('Continuing to next iteration...'));
            }
        }

        return buildResults;
    }

    private async runBenchmark(tool: BuildToolConfig, env: Record<string, string>): Promise<BuildResult | undefined> {


        try {
            // Clear the cache
            if (this.config.clearCache) {
                console.log(chalk.gray('Clearing cache...'));
                this.clearCache(tool);
            }

            // Execute the benchmark
            console.log(chalk.gray(`Executing: ${tool.command} in directory: ${this.cwd}`));
            const startTime = Date.now();

            const result = execSync(`/usr/bin/time -l ${tool.command} 2>&1`, {
                encoding: 'utf8',
                maxBuffer: 10 * 1024 * 1024,
            });

            // Get the memory output from the result
            const memoryMatch = result.toString().match(/(\d+)\s+maximum resident set size/);
            const memoryUsage = (memoryMatch && memoryMatch[1]) ? parseInt(memoryMatch[1], 10) / 1024 / 1024 : 0;

            // Get the build time from the result
            const endTime = Date.now();
            const buildTime = (endTime - startTime) / 1000;

            // Get the output size from the result
            const size = tool.outputDir ? this.getBuildSize(path.join(this.cwd, tool.outputDir)) : 'N/A';

            // Add the results to the results array
            return {
                buildTime,
                memoryUsage,
                size
            } as BuildResult;

        } catch (error: unknown) {
            if (error instanceof Error) {
                console.debug(error)
                console.error(chalk.red(`Error running ${tool.name}:`, error.message));
                throw new BuildToolError(`Failed to run benchmark for ${tool.name}`);
            }

            console.debug(error);
            console.log(chalk.yellow('Continuing to next iteration...'));
        }

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

            const buldTimeResults = buildResults.map((result) => result.buildTime);
            const buldMemoryResults = buildResults.map((result) => result.memoryUsage);
            const buildSizeResults = buildResults.map((result) => result.size);

            if (buldTimeResults.length > 0) {
                const times = this.calculateStats(buldTimeResults);
                const memory = this.calculateStats(buldMemoryResults);
                const size = this.calculateStats(buildSizeResults);

                console.log(chalk.bold(`\n${tool.name.toUpperCase()}:`));
                console.log(`Build time (s): avg=${times.avg}, min=${times.min}, max=${times.max}`);
                console.log(`Memory usage (MB): avg=${memory.avg}, min=${memory.min}, max=${memory.max}`);
                console.log(`Output Size (MB): avg=${size.avg}, min=${size.min}, max=${size.max}`);
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

        const buldTimeResults = baselineResults.map((result) => result.buildTime);
        const buldMemoryResults = baselineResults.map((result) => result.memoryUsage);
        const buldSizeResults = baselineResults.map((result) => result.size);

        for (let i = 1; i < this.config.tools.length; i++) {

            const comparisonTool = this.config.tools[i] as BuildToolConfig;
            const comparisonResults = this.results[comparisonTool.name] as BuildResults;

            const comparisonBuildTimeResults = comparisonResults.map((result) => result.buildTime);
            const comparisonBuldMemoryResults = comparisonResults.map((result) => result.memoryUsage);
            const comparisonBuildSizeResults = comparisonResults.map((result) => result.size);
    
            const baselineAvgTime = parseFloat(this.calculateStats(buldTimeResults).avg);
            const comparisonAvgTime = parseFloat(this.calculateStats(comparisonBuildTimeResults).avg);
            const speedup = (baselineAvgTime / comparisonAvgTime).toFixed(2);

            const baselineAvgMem = parseFloat(this.calculateStats(buldMemoryResults).avg);
            const comparisonAvgMem = parseFloat(this.calculateStats(comparisonBuldMemoryResults).avg);
            const memRatio = (baselineAvgMem / comparisonAvgMem).toFixed(2);


            const baselineAvgSize = parseFloat(this.calculateStats(buldSizeResults).avg);
            const comparisonAvgSize = parseFloat(this.calculateStats(comparisonBuildSizeResults).avg);
            const sizeRatio = (baselineAvgSize / comparisonAvgSize).toFixed(2);

            console.log(chalk.bold(`\n${comparisonTool.name} vs ${baselineTool.name}:`));
            console.log(`Speed: ${comparisonTool.name} is ${speedup}x ${(baselineAvgTime - comparisonAvgTime) < 0 ? "slower" : "faster"}`);
            console.log(`Memory: ${comparisonTool.name} uses ${memRatio}x ${(baselineAvgMem - comparisonAvgMem) < 0 ? "more" : "less"} memory`);
            console.log(`Size: ${comparisonTool.name} ${sizeRatio}x ${(baselineAvgSize - comparisonAvgSize) < 0 ? "more" : "less"}`);
        }
    }
} 