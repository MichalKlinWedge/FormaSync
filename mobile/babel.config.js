module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Migracje Drizzle (.sql) są wbudowywane w bundle jako stringi.
    plugins: [['inline-import', { extensions: ['.sql'] }]],
  };
};
