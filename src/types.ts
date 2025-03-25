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
    clearCache: z.boolean().default(true),
    tools: z.array(BuildToolConfigSchema).min(1),
    cwd: z.string().optional(),
    globalEnv: z.record(z.string()).optional(),
});

export type BuildToolConfig = z.infer<typeof BuildToolConfigSchema>;
export type BenchmarkConfig = z.infer<typeof BenchmarkConfigSchema>;

export interface BuildResult {
    buildTime: number;
    memoryUsage: number;
    size: number;
}

export type BuildResults = BuildResult[];

export interface BenchmarkResults {
    [key: string]: BuildResults;
}

export interface BuildStats {
    avg: string;
    min: string;
    max: string;
} 

git remote add origin https://github.com/GoodPie/js-build-benchmark.git
git branch -M main
git push -u origin main