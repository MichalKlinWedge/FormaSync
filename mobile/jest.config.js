const expoPreset = require('jest-expo/jest-preset');

// @garmin/fitsdk jest dostarczany jako ESM, a Jest domyślnie nie przetwarza node_modules.
// Dopisujemy go do listy wyjątków, zachowując resztę ustawień presetu Expo.
const transformIgnorePatterns = expoPreset.transformIgnorePatterns.map((pattern) =>
  pattern.startsWith('/node_modules/(?!(') ? pattern.replace('(?!(', '(?!(@garmin|') : pattern,
);

module.exports = {
  ...expoPreset,
  transformIgnorePatterns,
  moduleNameMapper: {
    ...expoPreset.moduleNameMapper,
    '^@/assets/(.*)$': '<rootDir>/assets/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
