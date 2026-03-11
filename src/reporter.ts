import chalk from 'chalk';
import type { HardwareInfo, BuildResults, BenchmarkConfig, BenchmarkResults, ToolResults, BuildToolConfig } from './types.js';
import { calculateStats } from './statistics.js';

export function printHardwareInfo(hardware: HardwareInfo): void {
    console.log(chalk.cyan('\n===== SYSTEM INFO ====='));
    console.log(`CPU: ${hardware.cpu} (${hardware.cores} cores)`);
    console.log(`RAM: ${hardware.totalMemoryGB} GB`);
    console.log(`Platform: ${hardware.platform} (${hardware.osVersion})`);
    console.log(`Node: ${hardware.nodeVersion}`);
}

function printGroupStats(label: string, results: BuildResults): void {
    if (results.length === 0) {
        console.log(chalk.yellow(`  ${label}: no successful runs`));
        return;
    }
    const time = calculateStats(results.map(r => r.buildTime));
    const memory = calculateStats(results.map(r => r.memoryUsage));
    const size = results[0]?.size ?? 0;
    const fileCount = results[0]?.fileCount ?? 0;

    console.log(`  ${label}:`);
    console.log(`    Build time (s): avg=${time.avg.toFixed(2)}, min=${time.min.toFixed(2)}, max=${time.max.toFixed(2)}`);
    console.log(`    Memory usage (MB): avg=${memory.avg.toFixed(2)}, min=${memory.min.toFixed(2)}, max=${memory.max.toFixed(2)}`);
    console.log(`    Output size (MB): ${size.toFixed(2)}`);
    console.log(`    File count: ${fileCount}`);
}

function printComparisons(config: BenchmarkConfig, results: BenchmarkResults): void {
    console.log(chalk.cyan('\n===== COMPARISONS ====='));

    const baselineTool = config.tools[0] as BuildToolConfig;
    const baselineResults = results[baselineTool.name];
    if (!baselineResults) {
        console.log(chalk.yellow(`Skipping comparisons: no results found for baseline tool "${baselineTool.name}".`));
        return;
    }

    const groups: Array<{ key: 'cold' | 'warm'; label: string }> = [];
    if (config.cacheMode === 'cold' || config.cacheMode === 'both') {
        groups.push({ key: 'cold', label: 'Cold' });
    }
    if (config.cacheMode === 'warm' || config.cacheMode === 'both') {
        groups.push({ key: 'warm', label: 'Warm' });
    }

    for (const group of groups) {
        const baselineGroup = baselineResults[group.key];
        if (baselineGroup.length === 0) {
            console.log(chalk.yellow(`Skipping ${group.label} comparisons: baseline tool "${baselineTool.name}" had no successful runs.`));
            continue;
        }

        if (config.cacheMode === 'both') {
            console.log(chalk.cyan(`\n[${group.label} cache]`));
        }

        const baselineAvgTime = calculateStats(baselineGroup.map(r => r.buildTime)).avg;
        const baselineAvgMem = calculateStats(baselineGroup.map(r => r.memoryUsage)).avg;

        for (let i = 1; i < config.tools.length; i++) {
            const comparisonTool = config.tools[i] as BuildToolConfig;
            const comparisonToolResults = results[comparisonTool.name];
            if (!comparisonToolResults) {
                console.log(chalk.yellow(`\nSkipping ${comparisonTool.name} vs ${baselineTool.name}: no results found.`));
                continue;
            }
            const comparisonGroup = comparisonToolResults[group.key];

            if (comparisonGroup.length === 0) {
                console.log(chalk.yellow(`\nSkipping ${comparisonTool.name} vs ${baselineTool.name}: no successful runs.`));
                continue;
            }

            const comparisonAvgTime = calculateStats(comparisonGroup.map(r => r.buildTime)).avg;
            const comparisonAvgMem = calculateStats(comparisonGroup.map(r => r.memoryUsage)).avg;
            const baselineSize = baselineGroup[0]?.size ?? 0;
            const comparisonSize = comparisonGroup[0]?.size ?? 0;

            const timeFasterOrSlower = comparisonAvgTime < baselineAvgTime ? 'faster' : 'slower';
            const timeRatio = comparisonAvgTime === 0 || baselineAvgTime === 0
                ? 'N/A'
                : timeFasterOrSlower === 'faster'
                    ? (baselineAvgTime / comparisonAvgTime).toFixed(2)
                    : (comparisonAvgTime / baselineAvgTime).toFixed(2);

            const memMoreOrLess = comparisonAvgMem < baselineAvgMem ? 'less' : 'more';
            const memRatio = comparisonAvgMem === 0 || baselineAvgMem === 0
                ? 'N/A'
                : memMoreOrLess === 'less'
                    ? (baselineAvgMem / comparisonAvgMem).toFixed(2)
                    : (comparisonAvgMem / baselineAvgMem).toFixed(2);

            const sizeMoreOrLess = comparisonSize < baselineSize ? 'smaller' : 'larger';
            const sizeRatio = comparisonSize === 0 || baselineSize === 0
                ? 'N/A'
                : sizeMoreOrLess === 'smaller'
                    ? (baselineSize / comparisonSize).toFixed(2)
                    : (comparisonSize / baselineSize).toFixed(2);

            console.log(chalk.bold(`\n${comparisonTool.name} vs ${baselineTool.name}:`));
            console.log(`  Speed: ${comparisonTool.name} is ${timeRatio}x ${timeFasterOrSlower}`);
            console.log(`  Memory: ${comparisonTool.name} uses ${memRatio}x ${memMoreOrLess} memory`);
            console.log(`  Size: ${comparisonTool.name} output is ${sizeRatio}x ${sizeMoreOrLess}`);
        }
    }
}

export function printSummary(config: BenchmarkConfig, results: BenchmarkResults): void {
    console.log(chalk.cyan('\n===== BENCHMARK SUMMARY ====='));

    for (const tool of config.tools) {
        const toolResults = results[tool.name];
        if (!toolResults) {
            console.log(chalk.yellow(`\n${tool.name.toUpperCase()}: no results`));
            continue;
        }
        console.log(chalk.bold(`\n${tool.name.toUpperCase()}:`));

        if (config.cacheMode === 'both') {
            printGroupStats('Cold', toolResults.cold);
            printGroupStats('Warm', toolResults.warm);
        } else if (config.cacheMode === 'cold') {
            printGroupStats('Cold', toolResults.cold);
        } else {
            printGroupStats('Warm', toolResults.warm);
        }
    }

    if (config.tools.length > 1) {
        printComparisons(config, results);
    }
}
