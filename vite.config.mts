import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import dts from 'vite-plugin-dts'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig(({ mode }) => {
  const isProd = mode === 'production'
  const isComponentBuild = process.env.BUILD_MODE === 'component'

  if (isComponentBuild) {
    return {
      build: {
        lib: {
          entry: path.resolve(__dirname, 'src/App.tsx'),
          name: 'beeDashboard',
          fileName: () => 'App.js',
          formats: ['umd'],
        },
        sourcemap: true,
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
              if (assetInfo.names?.[0] === 'style.css') return 'App.css'
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
        }),
      ],
      resolve: {
        extensions: ['.ts', '.tsx', '.js', '.jsx', '.css', '.scss'],
      },
    }
  }

  return {
    plugins: [
      react(),
      nodePolyfills({
        // TODO: util needed?
        include: ['stream', 'util', 'buffer', 'crypto', 'fs'],
        globals: {
          Buffer: true,
          global: true,
          process: true,
        },
      }),
    ],
    resolve: {
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.css', '.scss'],
    },
    // TODO: is optimizeDeps needed?
    optimizeDeps: {
      exclude: ['@solarpunkltd/file-manager-lib'],
    },
    build: {
      outDir: 'build',
      sourcemap: isProd,
      commonjsOptions: {
        transformMixedEsModules: true,
      },
    },
    server: {
      port: 3000,
      open: true,
    },
    publicDir: 'public',
    assetsInclude: ['**/*.svg'],
  }
})
