module.exports = api => {
  api.cache(true)

  return {
    presets: ['@babel/preset-typescript', ['@babel/preset-react', { runtime: 'automatic' }]],
    plugins: [
      [
        {
          relative: true,
          extensions: ['.js', '.jsx', '.ts', '.tsx', '.es', '.es6', '.mjs'],
          rootDir: '.',
          tsconfig: 'tsconfig.lib.json',
        },
      ],
      [
        '@babel/plugin-transform-runtime',
        {
          helpers: false,
          regenerator: true,
        },
      ],
    ],
  }
}
