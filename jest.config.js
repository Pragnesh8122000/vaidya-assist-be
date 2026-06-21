module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/src/**/*.test.js'],
  collectCoverageFrom: ['src/**/*.js', '!src/**/*.test.js'],
  clearMocks: true,
  restoreMocks: true,
};
