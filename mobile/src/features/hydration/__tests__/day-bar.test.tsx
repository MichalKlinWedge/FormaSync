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
/** Kreska: wąski pasek na wierzchu. Odcinek zaplanowanego treningu też leży absolutnie, więc
 * rozróżniamy je po tym, co każde z nich ma własnego: szerokość kreski i prawą krawędź odcinka. */
const paceOf = (tree: ReactTestRenderer) =>
  styles(tree).find((style) => style.position === 'absolute' && style.width === 2);
const plannedOf = (tree: ReactTestRenderer) =>
  styles(tree).find((style) => style.position === 'absolute' && style.right === 0);

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

  it('zaplanowany trening rozciąga pasek i dostaje własny odcinek', () => {
    const tree = render(
      <DayBar consumedMl={800} targetMl={2600} plannedMl={400} window={WINDOW} at={at(14, 30)} />,
    );

    // Wypełnienie mierzy się całym dniem, nie samym dzisiejszym celem.
    expect(fillOf(tree)?.width).toBe(`${(800 / 3000) * 100}%`);
    // Odcinek zaczyna się dokładnie tam, gdzie kończy się cel na teraz.
    expect(plannedOf(tree)?.left).toBe(`${(2600 / 3000) * 100}%`);
  });

  it('kreska celu zostaje przy dzisiejszym celu, choć pasek jest dłuższy', () => {
    const tree = render(
      <DayBar consumedMl={800} targetMl={2600} plannedMl={400} window={WINDOW} at={at(14, 30)} />,
    );

    // O 14:30 wypada połowa dzisiejszego celu — na rozciągniętym pasku to mniej niż połowa.
    expect(paceOf(tree)?.left).toBe(`${0.5 * (2600 / 3000) * 100}%`);
  });

  it('bez zaplanowanego treningu nie rysuje odcinka', () => {
    const tree = render(
      <DayBar consumedMl={800} targetMl={2600} window={WINDOW} at={at(14, 30)} />,
    );

    expect(plannedOf(tree)).toBeUndefined();
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
