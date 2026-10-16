import { describe, expect, it } from '@jest/globals';
import { View } from 'react-native';
import { Line, Text as SvgText } from 'react-native-svg';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { LineChart } from '../line-chart';

/**
 * Sam wykres. Reguła „gdzie postawić linie” jest sprawdzona przy `niceTicks` — tutaj chodzi
 * o jedno: czy życzenie co do liczby linii w ogóle do niego dociera i czy każda dostaje opis.
 * Bez tego poprawna reguła mogłaby nigdy nie trafić na ekran.
 */

/** Ramka rysuje dopiero po zmierzeniu szerokości, więc pomiar trzeba udać. */
function render(element: React.ReactElement): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(element);
  });
  act(() => {
    tree.root
      .findAllByType(View)
      .find((node) => typeof node.props.onLayout === 'function')
      ?.props.onLayout({ nativeEvent: { layout: { width: 320, height: 180 } } });
  });
  return tree;
}

const weight = (values: number[]) => (
  <LineChart
    labels={values.map((_, index) => `d${index}`)}
    series={[{ name: 'Waga', color: '#000', values }]}
    formatValue={(value) => String(value)}
    gridLines={5}
  />
);

describe('LineChart', () => {
  it('rysuje więcej linii, gdy ekran o nie prosi', () => {
    const many = render(weight([70, 72, 74, 76, 78]));
    const few = render(
      <LineChart
        labels={['a', 'b']}
        series={[{ name: 'Waga', color: '#000', values: [70, 78] }]}
        formatValue={(value) => String(value)}
      />,
    );

    expect(many.root.findAllByType(Line).length).toBeGreaterThan(
      few.root.findAllByType(Line).length,
    );
  });

  it('każda linia ma swój opis', () => {
    const tree = render(weight([70, 72, 74, 76, 78]));
    const lines = tree.root.findAllByType(Line).length;
    const labels = tree.root.findAllByType(SvgText).length;

    // Opisy osi poziomej (dwa) i wartość końcowa serii dochodzą do opisów linii.
    expect(labels).toBe(lines + 3);
  });

  it('bez dwóch pomiarów nie udaje wykresu', () => {
    const tree = render(
      <LineChart
        labels={['a']}
        series={[{ name: 'Waga', color: '#000', values: [70] }]}
        formatValue={(value) => String(value)}
        emptyMessage="Za mało pomiarów."
      />,
    );

    expect(tree.root.findAllByType(Line)).toHaveLength(0);
  });
});
