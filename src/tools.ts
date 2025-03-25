export const webBuildTools = [
    {
        name: 'webpack',
        defaultCommand: 'webpack --mode production',
        clearCacheDir: 'node_modules/.cache/webpack'
    },
    {
        name: 'vite',
        defaultCommand: 'bun vite build',
        clearCacheDir: 'node_modules/.vite'
    },
    {
        name: 'esbuild',
        defaultCommand: 'bun esbuild --bundle --minify',
        clearCacheDir: '.esbuild-cache'
    },
    {
        name: 'rollup',
        defaultCommand: 'bun rollup.config.js',
        clearCacheDir: '.rollup-cache'
    },
]
