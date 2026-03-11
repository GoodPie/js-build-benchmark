import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { Benchmarker } from './benchmark.js';
import { type BuildToolConfig, type BenchmarkConfig, BenchmarkConfigSchema, type BenchmarkReport } from './types.js';
import { input, select } from '@inquirer/prompts';
import checkbox from "@inquirer/checkbox"
import { webBuildTools } from './tools.js';
import { calculateStats } from './statistics.js';

const program = new Command();

program
    .name('js-build-benchmarker')
    .description('A CLI tool to benchmark and compare build tools')
    .version('1.0.8');

// Per-project-type default command overrides for the init wizard
const projectTypeDefaults: Record<string, Record<string, string>> = {
    library: {
        esbuild: 'esbuild src/index.ts --bundle --minify --platform=node --outfile=dist/index.js',
        rollup: 'rollup -c --environment BUILD:production',
        rolldown: 'rolldown --config rolldown.config.js',
    },
    ssr: {
        vite: 'vite build --ssr src/entry-server.ts',
    },
    spa: {},
};

program.command('init')
    .description('Initialize a new benchmark configuration file')
    .option('-f, --file <path>', 'Configuration file path', 'benchmark.config.json')
    .option("-i, --iterations <iterations>", "Iterations to run by default", '3')
    .option('--cache-mode <mode>', 'Default cache mode: cold, warm, or both', 'cold')
    .action(async (options) => {

        let buildDirectory = await input({ message: "Enter the build directory", default: `dist/` }) as string;
        if (!buildDirectory.endsWith("/")) buildDirectory = buildDirectory + "/";

        console.log(chalk.green(`Set project directory to: ${buildDirectory}`))

        const projectType = await select({
            message: 'What type of project are you benchmarking?',
            choices: [
                { name: 'SPA (Single Page Application)', value: 'spa' },
                { name: 'Library (ESM/CJS output)', value: 'library' },
                { name: 'SSR (Server-Side Rendering)', value: 'ssr' },
            ],
        });

        console.log(chalk.green(`Project type: ${projectType}`));

        // Loop through each build tool
        const availableConfigs = await checkbox({
            message: 'Select the build tools to benchmark',
            choices: webBuildTools.map((tool) => ({
                name: tool.name,
                value: tool,
            })),
        })

        const selectedToolConfigs = [] as BuildToolConfig[];
        for (const tool of availableConfigs) {
            const defaultCommand = projectTypeDefaults[projectType]?.[tool.name] ?? tool.defaultCommand;

            const buildCommand = await input({
                message: `Enter the build command for ${tool.name}`,
                default: defaultCommand,
            })

            const toolOutputDir = await input({
                message: `Enter the output directory for this tool`,
                default: buildDirectory,
            })

            const clearCacheDirInput = await input({
                message: `Enter the clear cache directory for ${tool.name} (leave blank to skip)`,
                default: tool.clearCacheDir ?? '',
            })
            const clearCacheDir = clearCacheDirInput.trim() || undefined;

            const toolConfig: BuildToolConfig = {
                name: tool.name,
                command: buildCommand,
                outputDir: toolOutputDir,
            };
            if (clearCacheDir) toolConfig.clearCacheDir = clearCacheDir;
            selectedToolConfigs.push(toolConfig);
        }


        const config = {
            iterations: parseInt(`${options.iterations}`, 10),
            cacheMode: options.cacheMode as 'cold' | 'warm' | 'both',
            warmup: false,
            tools: selectedToolConfigs,
        } as BenchmarkConfig;


        try {
            fs.writeFileSync(
                options.file as string,
                JSON.stringify(config, null, 2),
                'utf8'
            );
            console.log(chalk.green(`✓ Created configuration file at ${options.file}`));
            console.log(chalk.gray('\nEdit this file to configure your build tools for benchmarking.'));
            console.log(chalk.gray('Then run: js-build-benchmarker run'));
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(chalk.red(`Error creating configuration file: ${message}`));
            process.exit(1);
        }
    });

program.command('run')
    .description('Run the benchmark')
    .option('-f, --file <path>', 'Configuration file path', 'benchmark.config.json')
    .option('-i, --iterations <number>', 'Override number of iterations')
    .option('--cache-mode <mode>', 'Cache mode: cold, warm, or both (overrides config)')
    .option('--warmup', 'Run one discarded warmup iteration before collecting results')
    .option('--output <file>', 'Write full results as JSON to this file')
    .action(async (options) => {
        try {
            // Load and validate configuration
            if (!fs.existsSync(options.file)) {
                console.error(chalk.red(`Configuration file not found: ${options.file}`));
                console.log(chalk.gray('Run "js-build-benchmarker init" to create a configuration file.'));
                process.exit(1);
            }

            const configFile = fs.readFileSync(options.file, 'utf8');
            let config: unknown;
            try {
                config = JSON.parse(configFile);
            } catch {
                throw new Error(`Could not parse config file: ${options.file}. Is it valid JSON?`);
            }

            // Override config with command line options — only when the user explicitly
            // provided the flag on the CLI, not when Commander filled in a default value.
            if (options.iterations) {
                (config as Record<string, unknown>).iterations = parseInt(options.iterations, 10);
            }
            if (process.argv.includes('--cache-mode')) {
                (config as Record<string, unknown>).cacheMode = options.cacheMode;
            }
            if (options.warmup) {
                (config as Record<string, unknown>).warmup = true;
            }

            // Validate configuration
            const validatedConfig = BenchmarkConfigSchema.parse(config);

            // Run benchmarks
            const benchmarker = new Benchmarker(validatedConfig);
            const { results, hardware } = await benchmarker.run();

            // Write JSON output if requested
            if (options.output) {
                const report: BenchmarkReport = {
                    timestamp: new Date().toISOString(),
                    hardware,
                    config: validatedConfig,
                    results: Object.fromEntries(
                        Object.entries(results).map(([toolName, toolResults]) => {
                            const entry: BenchmarkReport['results'][string] = {};

                            if (toolResults.cold.length > 0) {
                                const coldStats = {
                                    time: calculateStats(toolResults.cold.map(r => r.buildTime)),
                                    memory: calculateStats(toolResults.cold.map(r => r.memoryUsage)),
                                    size: toolResults.cold[0]?.size ?? 0,
                                    fileCount: toolResults.cold[0]?.fileCount ?? 0,
                                };
                                entry.cold = { iterations: toolResults.cold, stats: coldStats };
                            }

                            if (toolResults.warm.length > 0) {
                                const warmStats = {
                                    time: calculateStats(toolResults.warm.map(r => r.buildTime)),
                                    memory: calculateStats(toolResults.warm.map(r => r.memoryUsage)),
                                    size: toolResults.warm[0]?.size ?? 0,
                                    fileCount: toolResults.warm[0]?.fileCount ?? 0,
                                };
                                entry.warm = { iterations: toolResults.warm, stats: warmStats };
                            }

                            return [toolName, entry];
                        })
                    ),
                };

                const outputPath = path.resolve(options.output);
                fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');
                console.log(chalk.green(`\n✓ Results written to ${outputPath}`));
            }

        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(chalk.red(`Error running benchmark: ${message}`));
            process.exit(1);
        }
    });

export default program;
