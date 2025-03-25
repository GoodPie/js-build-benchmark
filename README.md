# JS Build Benchmarker

A command-line tool to benchmark and compare JavaScript build tools (webpack, esbuild, vite, rollup, etc.) by measuring build time, memory usage, and output size. 

This is a tool that I have used for a while to explore different build tools for old projects, personal projects and legacy projects. Please use with other benchmarking tools.

[![npm version](https://img.shields.io/npm/v/@goodpie/js-build-benchmarker.svg)](https://www.npmjs.com/package/@goodpie/js-build-benchmarker)

## Installation

Install globally:

```bash
npm install -g @goodpie/js-build-benchmarker
# or
bun install -g @goodpie/js-build-benchmarker
```

## Usage

### Initialize a benchmark configuration

```bash
js-build-benchmarker init
```

This interactive wizard will help you create a `benchmark.config.json` file with your build tools and configuration.

### Run benchmarks

```bash
js-build-benchmarker run
```

Additional options:
- `-f, --file <path>` - Specify a custom config file path
- `-i, --iterations <number>` - Override number of iterations
- `--no-cache-clear` - Disable cache clearing between runs

## Configuration

The `benchmark.config.json` file contains your benchmark configuration:

```json
{
  "iterations": 30,
  "clearCache": true,
  "tools": [
    {
      "name": "webpack",
      "command": "webpack --mode production",
      "outputDir": "dist/",
      "clearCacheDir": "node_modules/.cache/webpack"
    },
    {
      "name": "esbuild",
      "command": "bun esbuild --bundle --minify",
      "outputDir": "dist/",
      "clearCacheDir": ".esbuild-cache"
    }
  ]
}
```

### Configuration Options

| Option | Description |
|--------|-------------|
| `iterations` | Number of benchmark runs to perform for each tool |
| `clearCache` | Whether to clear caches between runs |
| `tools` | Array of build tools to benchmark |
| `cwd` | Working directory for commands (optional) |
| `globalEnv` | Environment variables for all tools (optional) |

#### Tool Configuration

| Option | Description |
|--------|-------------|
| `name` | Tool name |
| `command` | Build command to execute |
| `outputDir` | Directory with build output (for size measurement) |
| `env` | Tool-specific environment variables (optional) |
| `clearCacheCommand` | Command to clear cache (optional) |
| `clearCacheDir` | Directory to remove for cache clearing (optional) |

## Example Output

```
===== BENCHMARK SUMMARY =====

WEBPACK:
Build time (s): avg=5.42, min=4.98, max=5.87
Memory usage (MB): avg=245.32, min=220.15, max=265.87
Output Size (MB): avg=1.25, min=1.25, max=1.25

ESBUILD:
Build time (s): avg=0.32, min=0.28, max=0.38
Memory usage (MB): avg=95.42, min=90.18, max=102.33
Output Size (MB): avg=1.32, min=1.32, max=1.32

===== COMPARISONS =====

esbuild vs webpack:
Speed: esbuild is 16.94x faster
Memory: esbuild uses 0.39x less memory
Size: esbuild 0.95x less
```

## Requirements

- Node.js 20.x or later
- Bun.js (recommended for better performance)

## License

MIT
