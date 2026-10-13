import { describe, expect, it, jest } from '@jest/globals';
import { TextInput } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { CompactNumberInput } from '@/components/compact-number-input';
import { NumberField } from '@/components/number-field';

/**
 * Zaznaczanie zawartości pola liczbowego przy wejściu w nie.
 *
 * Test odtwarza to, co robi natywne pole: przy zaznaczeniu całości pierwszy znak zastępuje
 * wszystko, a kolejne dopisują się do tego, co już jest. Pilnuje jednego warunku, na którym
 * stoi poprawne zachowanie: **po pierwszej zmianie zaznaczenie musi zniknąć**. Gdy zostawało
 * (tak działało `selectTextOnFocus`), druga cyfra kasowała pierwszą i trzeba było wpisywać
 * liczbę dwa razy.
 */

const inputOf = (tree: ReactTestRenderer) => tree.root.findByType(TextInput).props;

/** React 19 wymaga, żeby pierwsze renderowanie też przeszło przez `act`. */
function render(element: React.ReactElement): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(element);
  });
  return tree;
}

/** Zdarzenie z pola. Ciało musi być blokiem: `act` inaczej bierze zwróconą wartość za obietnicę. */
function fire(tree: ReactTestRenderer, event: (props: Record<string, any>) => void): void {
  act(() => {
    event(inputOf(tree));
  });
}

describe('NumberField — zaznaczenie przy wejściu w pole', () => {
  it('po wejściu zaznacza całą domyślną wartość', () => {
    const tree = render(<NumberField label="Powtórzenia" value={10} onChange={() => {}} />);
    expect(inputOf(tree).selection).toBeUndefined();

    fire(tree, (input) => input.onFocus());
    expect(inputOf(tree).selection).toEqual({ start: 0, end: 2 });
  });

  it('oddaje kursor po pierwszej zmianie', () => {
    const tree = render(<NumberField label="Powtórzenia" value={10} onChange={() => {}} />);
    fire(tree, (input) => input.onFocus());
    fire(tree, (input) => input.onChangeText('1'));

    // Sedno sprawy: gdyby zostało tu {start: 0, end: 1}, następny znak wszedłby na zaznaczenie
    // i skasował to, co przed chwilą wpisano.
    expect(inputOf(tree).selection).toBeUndefined();
    expect(inputOf(tree).value).toBe('1');
  });

  it('druga cyfra dopisuje się, zamiast kasować pierwszą', () => {
    const onChange = jest.fn();
    const tree = render(<NumberField label="Powtórzenia" value={10} onChange={onChange} />);

    fire(tree, (input) => input.onFocus());
    fire(tree, (input) => input.onChangeText('1')); // zaznaczone „10” ustępuje jedynce
    fire(tree, (input) => input.onChangeText('12')); // kursor na końcu, więc dopisanie

    expect(inputOf(tree).value).toBe('12');
    expect(onChange).toHaveBeenLastCalledWith(12);
  });

  it('wyjście z pola gasi zaznaczenie', () => {
    const tree = render(<NumberField label="Powtórzenia" value={10} onChange={() => {}} />);
    fire(tree, (input) => input.onFocus());
    fire(tree, (input) => input.onBlur());

    expect(inputOf(tree).selection).toBeUndefined();
  });
});

describe('CompactNumberInput — to samo w wierszu serii', () => {
  it('oddaje kursor po pierwszej zmianie', () => {
    const tree = render(<CompactNumberInput value={62.5} suffix="kg" decimal onChange={() => {}} />);
    fire(tree, (input) => input.onFocus());
    expect(inputOf(tree).selection).toEqual({ start: 0, end: 4 });

    fire(tree, (input) => input.onChangeText('6'));
    expect(inputOf(tree).selection).toBeUndefined();
  });

  it('wyjście z pola nadal woła onEnd — zaznaczenie nie przesłoniło zapisu serii', () => {
    const onEnd = jest.fn();
    const tree = render(
      <CompactNumberInput value={10} suffix="kg" onChange={() => {}} onEnd={onEnd} />,
    );
    fire(tree, (input) => input.onFocus());
    fire(tree, (input) => input.onBlur());

    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});
