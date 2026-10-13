import { describe, expect, it } from '@jest/globals';
import { StyleSheet, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { DayBar } from '../day-bar';
import type { DayWindow } from '../day';

/**
 * Sam pasek. Reguły „kiedy kreska ma milczeć” są sprawdzone przy `paceRatio` w day.test.ts —
 * tutaj chodzi o jedno: czy pasek w ogóle tę kreskę rysuje i stawia tam, gdzie każe liczba.
 * Bez tego testu poprawna logika mogłaby nigdy nie trafić na ekran.
 */

const WINDOW: DayWindow = { from: '08:00', to: '21:00' };
const at = (hours: number, minutes = 0) => new Date(2026, 9, 10, hours, minutes);

function render(element: React.ReactElement): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(element);
  });
  return tree;
}

type Style = Record<string, unknown>;

const styles = (tree: ReactTestRenderer): Style[] =>
  tree.root.findAllByType(View).map((node) => StyleSheet.flatten(node.props.style) as Style);

/** Wypełnienie ciągnie się przez całą wysokość paska, kreska leży nad nim. */
const fillOf = (tree: ReactTestRenderer) => styles(tree).find((style) => style.height === '100%');
const paceOf = (tree: ReactTestRenderer) =>
  styles(tree).find((style) => style.position === 'absolute');

describe('DayBar', () => {
  it('stawia kreskę tam, gdzie wypada pora dnia', () => {
    const tree = render(
      <DayBar consumedMl={800} targetMl={2600} window={WINDOW} at={at(14, 30)} />,
    );

    expect(paceOf(tree)?.left).toBe('50%');
    // Wypełnienie zostaje za kreską — to jest właśnie „jestem pod kreską”, widoczne wprost.
    expect(fillOf(tree)?.width).toBe(`${(800 / 2600) * 100}%`);
  });

  it('nie zaokrągla końca wypełnienia, żeby dało się je zestawić z kreską', () => {
    const fill = fillOf(render(<DayBar consumedMl={800} targetMl={2600} window={WINDOW} at={at(14)} />));

    expect(fill?.borderTopLeftRadius).toBe(7);
    expect(fill?.borderRadius).toBeUndefined();
  });

  it('rysuje kreskę także wtedy, gdy wypada dokładnie na końcu wypitego', () => {
    // Co do mililitra na kresce: pasek i zdanie pod nim muszą mówić to samo, więc kreska
    // zostaje — po prostu styka się z końcem wypełnienia.
    const tree = render(<DayBar consumedMl={1300} targetMl={2600} window={WINDOW} at={at(14, 30)} />);

    expect(paceOf(tree)?.left).toBe('50%');
    expect(fillOf(tree)?.width).toBe('50%');
  });

  it('nie rysuje kreski, gdy cel jest dowieziony', () => {
    const tree = render(
      <DayBar consumedMl={2600} targetMl={2600} window={WINDOW} at={at(14, 30)} />,
    );
    expect(paceOf(tree)).toBeUndefined();
  });

  it('nie rysuje kreski przed otwarciem okna dnia', () => {
    const tree = render(<DayBar consumedMl={0} targetMl={2600} window={WINDOW} at={at(6)} />);
    expect(paceOf(tree)).toBeUndefined();
  });
});
