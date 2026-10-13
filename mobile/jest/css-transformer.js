/**
 * Arkusz stylów w teście jednostkowym. Jest nie umie go wczytać i nie ma po co: komponenty
 * nie czytają z niego niczego, co dałoby się sprawdzić — import jest tu wyłącznie po to, żeby
 * w aplikacji trafił do paczki. Oddajemy pusty moduł.
 *
 * Robimy to transformacją, a nie `moduleNameMapper`, bo jest przestawia wzorce mapowania
 * i ogólne `^@/(.*)$` łapie `@/global.css` przed regułą dla CSS-a.
 */
module.exports = {
  process: () => ({ code: 'module.exports = {};' }),
};
