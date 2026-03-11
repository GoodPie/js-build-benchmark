import { z } from 'zod';

export const BuildToolConfigSchema = z.object({
    name: z.string(),
    command: z.string(),
    outputDir: z.string().optional(),
    env: z.record(z.string()).optional(),
    clearCacheCommand: z.string().optional(),
    clearCacheDir: z.string().optional(),
});

export const BenchmarkConfigSchema = z.object({
    iterations: z.number().int().positive().default(30),
    cacheMode: z.enum(['cold', 'warm', 'both']).default('cold'),
    warmup: z.boolean().default(false),
    tools: z.array(BuildToolConfigSchema).min(1),
    cwd: z.string().optional(),
    globalEnv: z.record(z.string()).optional(),
    timeout: z.number().int().positive().optional(),
});

export type BuildToolConfig = z.infer<typeof BuildToolConfigSchema>;
export type BenchmarkConfig = z.infer<typeof BenchmarkConfigSchema>;

export interface BuildResult {
    buildTime: number;
    memoryUsage: number;
    size: number;
    fileCount: number;
}

export type BuildResults = BuildResult[];

export interface ToolResults {
    cold: BuildResults;
    warm: BuildResults;
}

export interface BenchmarkResults {
    [key: string]: ToolResults;
}

export interface BuildStats {
    avg: number;
    min: number;
    max: number;
}

export interface ToolGroupStats {
    time: BuildStats;
    memory: BuildStats;
    size: number;
    fileCount: number;
}

export interface HardwareInfo {
    cpu: string;
    cores: number;
    totalMemoryGB: number;
    platform: string;
    osVersion: string;
    nodeVersion: string;
}

export interface BenchmarkReport {
    timestamp: string;
    hardware: HardwareInfo;
    config: BenchmarkConfig;
    results: {
        [toolName: string]: {
            cold?: { iterations: BuildResult[]; stats: ToolGroupStats };
            warm?: { iterations: BuildResult[]; stats: ToolGroupStats };
        };
    };
} 