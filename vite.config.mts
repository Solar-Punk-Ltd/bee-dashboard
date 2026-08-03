import path from 'path'
import { createRequire } from 'module'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import dts from 'vite-plugin-dts'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

const require = createRequire(import.meta.url)

const DEFAULT_VITE_DEV_PORT = 3002

const NODE_POLYFILLS_SHIM_SPECIFIERS = new Set([
  'vite-plugin-node-polyfills/shims/buffer',
  'vite-plugin-node-polyfills/shims/global',
  'vite-plugin-node-polyfills/shims/process',
])

// vite-plugin-node-polyfills resolves its shim imports itself for every normal module,
// so aliasing them project-wide (as `resolve.alias` would) makes the shim files resolve
// through a different path than the plugin's own resolution, which causes them to be
// pulled into the module graph twice and produces a circular self-reference
// ("Cannot access '...' before initialization"). Instead, only override resolution for
// modules imported from the pnpm-linked `@solarpunkltd/file-manager-lib` package, whose
// real location outside this project's directory otherwise fails Node's node_modules walk-up.
function fileManagerLibNodePolyfillsShimsAlias(): Plugin {
  return {
    name: 'file-manager-lib-node-polyfills-shims-alias',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!importer || !NODE_POLYFILLS_SHIM_SPECIFIERS.has(source)) return null
      if (!importer.includes('file-manager-lib')) return null
      return require.resolve(source)
    },
  }
}

export default defineConfig(({ mode }) => {
  const isProd = mode === 'production'
  const isComponentBuild = process.env.BUILD_MODE === 'component'

  if (isComponentBuild) {
    return {
      build: {
        lib: {
          entry: path.resolve(__dirname, 'src/App.tsx'),
          name: 'beeDashboard',
          fileName: format => `App.${format === 'es' ? 'js' : 'cjs.js'}`,
          formats: ['es', 'cjs'],
        },
        sourcemap: !isProd,
        minify: false,
        outDir: 'lib',
        rollupOptions: {
          external: ['react', 'react-dom'],
          output: {
            globals: {
              react: 'React',
              'react-dom': 'ReactDOM',
            },
            assetFileNames: (assetInfo: any) => {
              if (assetInfo.originalFileNames?.includes('style.css') || assetInfo.names?.includes('bee-dashboard.css'))
                return 'App.css'
              return assetInfo.names?.[0] || 'asset'
            },
          },
        },
      },
      plugins: [
        react(),
        dts({
          exclude: ['**/tests/**', 'src/index.tsx'],
          outDir: 'lib',
          entryRoot: 'src',
          tsconfigPath: './tsconfig.lib.json',
        }),
      ],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, 'src'),
        },
        extensions: ['.ts', '.tsx', '.js', '.jsx', '.css', '.scss'],
      },
    }
  }

  return {
    plugins: [
      react(),
      fileManagerLibNodePolyfillsShimsAlias(),
      nodePolyfills({
        include: ['util', 'buffer', 'stream'],
        globals: {
          Buffer: true,
          global: true,
          process: true,
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.css', '.scss'],
    },
    optimizeDeps: {
      // include: [],
      exclude: ['@solarpunkltd/file-manager-lib', 'swarm-desktop-ui'],
    },
    build: {
      outDir: 'build',
      sourcemap: !isProd,
      commonjsOptions: {
        transformMixedEsModules: true,
      },
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('react') || id.includes('react-dom') || id.includes('@mui') || id.includes('@emotion'))
                return 'vendor-react-mui'
              if (id.includes('ethers') || id.includes('@ethersproject')) return 'vendor-ethers'
              if (id.includes('@ethersphere/bee-js')) return 'vendor-bee-js'
              if (id.includes('notistack')) return 'vendor-notistack'

              // let Vite handle the rest
            }
          },
        },
      },
    },
    server: {
      port: DEFAULT_VITE_DEV_PORT,
      open: true,
    },
    publicDir: 'public',
    assetsInclude: ['**/*.svg'],
  }
})
