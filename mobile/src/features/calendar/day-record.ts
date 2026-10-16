/**
 * Zdanie pod wartością dnia w kalendarzu.
 *
 * Osobno od widoku, bo widok ciągnie za sobą bazę na telefonie i nie da się go zaimportować
 * w teście — a „cel dowieziony” przy brakujących 200 ml byłoby kłamstwem, którego na ekranie
 * nikt nie odróżni od prawdy.
 */
export function describeLeft(left: number, format: (value: number) => string): string {
  if (left > 0) return `Zabrakło ${format(left)}.`;
  if (left < 0) return `Ponad cel o ${format(-left)}.`;
  return 'Cel dowieziony co do jednostki.';
}
