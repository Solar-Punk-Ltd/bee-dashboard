module.exports = {
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.[tj]sx?$': ['babel-jest', { configFile: './.babelrc.js' }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transformIgnorePatterns: ['node_modules/(?!(std-env|cafe-utility|bee-js)/)'], // TODO: review all test configs and fix ui-test/
  extensionsToTreatAsEsm: ['.ts', '.tsx', '.jsx'],
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
  modulePathIgnorePatterns: ['<rootDir>/build/'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  testMatch: ['<rootDir>/tests/**/*.spec.ts'],
}
