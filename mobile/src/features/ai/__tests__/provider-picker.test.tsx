import { describe, expect, it, jest } from '@jest/globals';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ProviderPicker } from '../provider-picker';

/**
 * Wybór dostawcy na jedno zapytanie. Sprawdzamy jedno: że rząd znaczników pojawia się dopiero
 * wtedy, gdy jest z czego wybierać — przy jednym kluczu udawałby decyzję, której nie ma.
 */

function render(element: React.ReactElement): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(element);
  });
  return tree;
}

const labels = (tree: ReactTestRenderer) =>
  tree.root
    .findAllByType(Text)
    .map((node) => node.props.children)
    .filter((child): child is string => typeof child === 'string');

describe('ProviderPicker', () => {
  it('milczy, dopóki klucz ma jeden dostawca', () => {
    const tree = render(
      <ProviderPicker configured={['GEMINI']} value="GEMINI" onChange={() => {}} />,
    );

    expect(tree.toJSON()).toBeNull();
  });

  it('milczy też wtedy, gdy nie ma żadnego klucza', () => {
    const tree = render(<ProviderPicker configured={[]} value="GEMINI" onChange={() => {}} />);

    expect(tree.toJSON()).toBeNull();
  });

  it('pokazuje tylko tych dostawców, którzy mają klucz', () => {
    const tree = render(
      <ProviderPicker configured={['GEMINI', 'OPENAI']} value="OPENAI" onChange={() => {}} />,
    );

    expect(labels(tree)).toContain('Gemini');
    expect(labels(tree)).toContain('ChatGPT');
    expect(labels(tree)).not.toContain('Claude');
  });

  it('oddaje wybór ekranowi, zamiast zapisywać go za niego', () => {
    const chosen = jest.fn();
    const tree = render(
      <ProviderPicker configured={['GEMINI', 'CLAUDE']} value="GEMINI" onChange={chosen} />,
    );

    const claude = tree.root.findAll(
      (node) => node.props.accessibilityRole === 'checkbox' && node.props.accessibilityState?.checked === false,
    );
    act(() => {
      claude[0].props.onPress();
    });

    expect(chosen).toHaveBeenCalledWith('CLAUDE');
  });
});
