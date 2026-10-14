/**
 * Mediana z listy; null dla pustej.
 *
 * Wszędzie tam, gdzie pytamy „ile zwykle”, bierzemy środkową wartość, a nie średnią: jeden obiad
 * na weselu albo jeden trening przerwany po pięciu minutach przestawiłby średnią na tydzień
 * w przód, a mediany nie ruszy.
 */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}
