import type { BuildToolConfig } from './types.js';

/**
 * A build tool definition used by the init wizard.
 * `defaultCommand` is the suggested command shown to users during setup —
 * it becomes `command` in the generated BuildToolConfig.
 */
export interface BuildToolDefinition extends Omit<BuildToolConfig, 'command'> {
    defaultCommand: string;
    clearCacheDir?: string;
}

export const webBuildTools: BuildToolDefinition[] = [
    {
        name: 'webpack',
        defaultCommand: 'webpack --mode production',
        clearCacheDir: 'node_modules/.cache/webpack'
    },
    {
        name: 'vite',
        defaultCommand: 'vite build',
        // Vite's dep pre-bundling cache lives here, but vite build does not
        // cache chunks to disk by default. Clearing this ensures a cold dep
        // pre-bundle on the next run, which is the closest approximation.
        clearCacheDir: 'node_modules/.vite'
    },
    {
        name: 'esbuild',
        defaultCommand: 'esbuild --bundle --minify',
        // esbuild has no persistent on-disk cache by default.
        // Set clearCacheDir in your config if you are using a caching plugin.
        clearCacheDir: undefined
    },
    {
        name: 'rollup',
        defaultCommand: 'rollup -c',
        // Rollup's cache is in-memory only; no persistent disk cache by default.
        // Set clearCacheDir in your config if you are using a caching plugin.
        clearCacheDir: undefined
    },
    {
        name: 'rspack',
        defaultCommand: 'rspack build',
        clearCacheDir: 'node_modules/.cache/rspack'
    },
    {
        name: 'bun build',
        defaultCommand: 'bun build ./src/index.ts --outdir ./dist',
        clearCacheDir: undefined
    },
    {
        name: 'rolldown',
        defaultCommand: 'rolldown --config',
        clearCacheDir: undefined,
    },
    {
        name: 'farm',
        defaultCommand: 'farm build',
        clearCacheDir: 'node_modules/.farm',
    },
]
