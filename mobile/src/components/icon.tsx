import { SymbolView } from 'expo-symbols';
import type { ComponentProps } from 'react';
import type { ColorValue, StyleProp, ViewStyle } from 'react-native';

type AndroidSymbol = Extract<ComponentProps<typeof SymbolView>['name'], { android?: unknown }>['android'];

type IconProps = {
  /** Nazwa ikony Material Symbols. */
  name: NonNullable<AndroidSymbol>;
  size?: number;
  color: ColorValue;
  style?: StyleProp<ViewStyle>;
};

export function Icon({ name, size = 24, color, style }: IconProps) {
  return <SymbolView name={{ android: name, web: name }} size={size} tintColor={color} style={style} />;
}
