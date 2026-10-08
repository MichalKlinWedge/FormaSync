const expoPreset = require('jest-expo/jest-preset');

module.exports = {
  ...expoPreset,
  moduleNameMapper: {
    ...expoPreset.moduleNameMapper,
    '^@/assets/(.*)$': '<rootDir>/assets/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
