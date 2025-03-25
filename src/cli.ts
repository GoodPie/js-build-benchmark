#!/usr/bin/env bun
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { Benchmarker } from './benchmark';
import { type BuildToolConfig, type BenchmarkConfig, BenchmarkConfigSchema } from './types';
import { input } from '@inquirer/prompts';
import checkbox, { Separator } from "@inquirer/checkbox"
import { webBuildTools } from './tools';

const program = new Command();

program
    .name('js-build-benchmarker')
    .description('A CLI tool to benchmark and compare build tools')
    .version('1.0.7');

program.command('init')
    .description('Initialize a new benchmark configuration file')
    .option('-f, --file <path>', 'Configuration file path', 'benchmark.config.json')
    .option('-m, --mode <env>', 'Node Environment', 'development')
    .option("-i, --iterations <iterations>", "Iterations to run by default", '3')
    .action(async (options) => {

        let buildDirectory = await input({ message: "Enter the build directory", default: `dist/` }) as string;
        if (!buildDirectory.endsWith("/")) buildDirectory = buildDirectory + "/";

        console.log(chalk.green(`Set project directory to: ${buildDirectory}`))

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
            const buildCommand = await input({
                message: `Enter the build command for ${tool.name}`,
                default: tool.defaultCommand,
            })

            const toolOutputDir = await input({
                message: `Enter the output directory for this tool`,
                default: buildDirectory,
            })

            const clearCacheDir = await input({
                message: `Enter the clear cache directory for ${tool.name}`,
                default: tool.clearCacheDir,
            })

            selectedToolConfigs.push({
                name: tool.name,
                command: buildCommand,
                clearCacheDir: clearCacheDir,
                outputDir: toolOutputDir,
            })
        }


        const config = {
            iterations: parseInt(`${options.iterations}`, 10),
            clearCache: true,
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
            if (error instanceof Error) {
                console.error(chalk.red('Error creating configuration file:', error.message));
                process.exit(1);
            }
        }
    });

program.command('run')
    .description('Run the benchmark')
    .option('-f, --file <path>', 'Configuration file path', 'benchmark.config.json')
    .option('-i, --iterations <number>', 'Override number of iterations')
    .option('--no-cache-clear', 'Disable cache clearing')
    .action(async (options) => {
        try {
            // Load and validate configuration
            if (!fs.existsSync(options.file)) {
                console.error(chalk.red(`Configuration file not found: ${options.file}`));
                console.log(chalk.gray('Run "js-build-benchmarker init" to create a configuration file.'));
                process.exit(1);
            }

            const configFile = fs.readFileSync(options.file, 'utf8');
            let config = JSON.parse(configFile);

            // Override config with command line options
            if (options.iterations) {
                config.iterations = parseInt(options.iterations, 10);
            }
            if (options.cacheClear === false) {
                config.clearCache = false;
            }

            // Validate configuration
            const validatedConfig = BenchmarkConfigSchema.parse(config);

            // Run benchmarks
            const benchmarker = new Benchmarker(validatedConfig);
            await benchmarker.run();

        } catch (error) {
            if (error instanceof Error) {
                console.error(chalk.red('Error running benchmark:', error.message));
                process.exit(1);
            }
        }
    });


export default program;