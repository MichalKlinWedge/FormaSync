const expoPreset = require('jest-expo/jest-preset');

module.exports = {
  ...expoPreset,
  moduleNameMapper: {
    ...expoPreset.moduleNameMapper,
    '^@/assets/(.*)$': '<rootDir>/assets/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    ...expoPreset.transform,
    // Bez tego każdy test komponentu wywraca się na składni CSS-a: motyw importuje
    // `global.css`, a jest próbuje wykonać go jak JavaScript.
    '\\.css$': '<rootDir>/jest/css-transformer.js',
  },
};
