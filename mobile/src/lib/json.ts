/**
 * Wyłuskanie JSON-a z odpowiedzi modelu językowego.
 *
 * Prosimy o czysty JSON i zwykle taki przychodzi, ale „zwykle” nie jest kontraktem: raz dojdzie
 * znacznik kodu, raz zdanie wstępu. Zwracamy null zamiast rzucać, bo każde miejsce ma własny
 * komunikat o tym, czego nie dało się odczytać.
 */
export function unwrapJson(text: string): string | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const body = (fenced === null ? text : fenced[1]).trim();
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  return start === -1 || end <= start ? null : body.slice(start, end + 1);
}
