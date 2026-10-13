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

/** Warstwy paska: tło, wypełnienie i — gdy jest co pokazać — kreska. */
const layers = (tree: ReactTestRenderer) =>
  tree.root.findAllByType(View).map((node) => StyleSheet.flatten(node.props.style));

describe('DayBar', () => {
  it('stawia kreskę tam, gdzie wypada pora dnia', () => {
    const tree = render(
      <DayBar consumedMl={800} targetMl={2600} window={WINDOW} at={at(14, 30)} />,
    );
    const [, fill, pace] = layers(tree);

    expect(pace).toBeDefined();
    expect(pace.left).toBe('50%');
    // Wypełnienie zostaje za kreską — to jest właśnie „jestem pod kreską”, widoczne wprost.
    expect(fill.width).toBe(`${(800 / 2600) * 100}%`);
  });

  it('nie rysuje kreski, gdy cel jest dowieziony', () => {
    const tree = render(
      <DayBar consumedMl={2600} targetMl={2600} window={WINDOW} at={at(14, 30)} />,
    );
    expect(layers(tree)).toHaveLength(2);
  });

  it('nie rysuje kreski przed otwarciem okna dnia', () => {
    const tree = render(<DayBar consumedMl={0} targetMl={2600} window={WINDOW} at={at(6)} />);
    expect(layers(tree)).toHaveLength(2);
  });
});
