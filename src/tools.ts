export const webBuildTools = [
    {
        name: 'webpack',
        defaultCommand: 'webpack --mode production',
        clearCacheDir: 'node_modules/.cache/webpack'
    },
    {
        name: 'vite',
        defaultCommand: 'vite build',
        clearCacheDir: 'node_modules/.vite'
    },
    {
        name: 'esbuild',
        defaultCommand: 'esbuild --bundle --minify',
        clearCacheDir: '.esbuild-cache'
    },
    {
        name: 'rollup',
        defaultCommand: 'rollup -c',
        clearCacheDir: '.rollup-cache'
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
]
