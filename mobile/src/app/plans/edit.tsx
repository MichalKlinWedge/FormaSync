import { router, Stack, useNavigation } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { NumberField } from '@/components/number-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import { type DraftItem, moveItem, PlanValidationError, removeItem, updateItem } from '@/features/plans/draft';
import { isDraftDirty, usePlanDraftStore } from '@/features/plans/draft-store';
import { savePlan } from '@/features/plans/repository';
import { useTheme } from '@/hooks/use-theme';

export default function PlanEditorScreen() {
  const theme = useTheme();
  const navigation = useNavigation();
  const draft = usePlanDraftStore((s) => s.draft);
  const baseline = usePlanDraftStore((s) => s.baseline);
  const apply = usePlanDraftStore((s) => s.apply);
  const clear = usePlanDraftStore((s) => s.clear);
  const dirty = isDraftDirty(draft, baseline);
  const saving = useRef(false);

  // Ostrzeżenie przed utratą niezapisanych zmian (przycisk/gest wstecz).
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e) => {
        if (!dirty || saving.current) return;
        e.preventDefault();
        Alert.alert('Odrzucić zmiany?', 'Plan ma niezapisane zmiany.', [
          { text: 'Zostań', style: 'cancel' },
          { text: 'Odrzuć', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
        ]);
      }),
    [navigation, dirty],
  );

  if (!draft) return <ThemedView style={styles.flex} />;

  const save = () => {
    try {
      const id = savePlan(db, draft);
      saving.current = true;
      clear();
      if (draft.id === undefined) router.replace({ pathname: '/plans/[id]', params: { id } });
      else router.back();
    } catch (e) {
      if (e instanceof PlanValidationError) Alert.alert('Uzupełnij plan', e.message);
      else throw e;
    }
  };

  const inputStyle = [styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }];

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <ThemedView style={styles.flex}>
        <Stack.Screen options={{ title: draft.id === undefined ? 'Nowy plan' : 'Edycja planu' }} />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <TextInput
            value={draft.title}
            onChangeText={(title) => apply((d) => ({ ...d, title }))}
            placeholder="Nazwa planu"
            placeholderTextColor={theme.textSecondary}
            style={[inputStyle, styles.title]}
          />
          <TextInput
            value={draft.description}
            onChangeText={(description) => apply((d) => ({ ...d, description }))}
            placeholder="Opis (opcjonalnie)"
            placeholderTextColor={theme.textSecondary}
            multiline
            style={inputStyle}
          />

          {draft.items.map((item, index) => (
            <PlanItemEditor
              key={item.key}
              item={item}
              index={index}
              isFirst={index === 0}
              isLast={index === draft.items.length - 1}
              onChange={(patch) => apply((d) => updateItem(d, item.key, patch))}
              onMove={(offset) => apply((d) => moveItem(d, item.key, offset))}
              onRemove={() => apply((d) => removeItem(d, item.key))}
            />
          ))}

          <Button
            label="Dodaj ćwiczenia"
            icon="add"
            variant="secondary"
            onPress={() => router.push('/plans/pick-exercise')}
          />
          <Button label="Zapisz plan" icon="check" onPress={save} />
        </ScrollView>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

type PlanItemEditorProps = {
  item: DraftItem;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onChange: (patch: Partial<Omit<DraftItem, 'key'>>) => void;
  onMove: (offset: number) => void;
  onRemove: () => void;
};

function PlanItemEditor({ item, index, isFirst, isLast, onChange, onMove, onRemove }: PlanItemEditorProps) {
  const theme = useTheme();
  const iconButton = (
    name: 'arrow_upward' | 'arrow_downward' | 'delete',
    label: string,
    onPress: () => void,
    disabled = false,
  ) => (
    <Pressable
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={{ opacity: disabled ? 0.25 : 1 }}>
      <Icon name={name} size={22} color={name === 'delete' ? theme.accent : theme.text} />
    </Pressable>
  );

  return (
    <ThemedView type="backgroundElement" style={styles.item}>
      <View style={styles.itemHeader}>
        <ThemedText type="smallBold" style={styles.itemTitle} numberOfLines={2}>
          {index + 1}. {item.exerciseName}
        </ThemedText>
        {iconButton('arrow_upward', 'Przesuń w górę', () => onMove(-1), isFirst)}
        {iconButton('arrow_downward', 'Przesuń w dół', () => onMove(1), isLast)}
        {iconButton('delete', 'Usuń z planu', onRemove)}
      </View>
      <View style={styles.fields}>
        <NumberField label="Serie" value={item.targetSets} onChange={(v) => onChange({ targetSets: v ?? 0 })} />
        {item.trackingType === 'REPS' ? (
          <NumberField label="Powt." value={item.targetReps} onChange={(v) => onChange({ targetReps: v })} />
        ) : (
          <NumberField
            label="Czas (s)"
            value={item.targetDurationSeconds}
            onChange={(v) => onChange({ targetDurationSeconds: v })}
          />
        )}
        <NumberField
          label="Ciężar (kg)"
          value={item.targetWeight}
          decimal
          placeholder="–"
          onChange={(v) => onChange({ targetWeight: v })}
        />
        <NumberField
          label="Przerwa (s)"
          value={item.restDurationSeconds}
          onChange={(v) => onChange({ restDurationSeconds: v ?? 0 })}
        />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.six },
  input: { borderRadius: 12, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + Spacing.one, fontSize: 16 },
  title: { fontSize: 20, fontWeight: 600 },
  item: { borderRadius: 16, padding: Spacing.three, gap: Spacing.three },
  itemHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  itemTitle: { flex: 1 },
  fields: { flexDirection: 'row', gap: Spacing.two },
});
