/**
 * SegmentedChoice — RN port of the inline `SegmentedChoice` in
 * frontend/src/app/(main)/record/page.tsx.
 *
 * Renders a horizontal pill group with one selected option (aria-pressed=true
 * on web; accessibilityState.selected on RN). Used by the record forms for
 * feed_type / sleep_type / record_type pickers.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  borderWidth,
  colors,
  radii,
  shadows,
  spacing,
  typography,
} from '../../shared/theme';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedChoiceProps<T extends string> {
  label: string;
  accessibilityLabel: string;
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  columns?: 2 | 3;
  disabled?: boolean;
  onChange: (value: T) => void;
}

export function SegmentedChoice<T extends string>({
  label,
  accessibilityLabel,
  options,
  value,
  disabled,
  onChange,
}: SegmentedChoiceProps<T>) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={accessibilityLabel}
        style={styles.group}
      >
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => !disabled && onChange(option.value)}
              disabled={disabled}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled: !!disabled }}
              style={({ pressed }) => [
                styles.segment,
                selected && styles.segmentActive,
                pressed && !disabled && !selected && styles.segmentPressed,
              ]}
            >
              <Text
                style={[
                  styles.segmentText,
                  selected && styles.segmentTextActive,
                  disabled && styles.segmentTextDisabled,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing['1'],
  },
  label: {
    ...typography.bodySmall,
    fontFamily: typography.tabLabel.fontFamily,
    color: colors['dark-gray'],
  },
  group: {
    flexDirection: 'row',
    gap: spacing['1'],
    backgroundColor: colors['warm-gray'],
    borderRadius: radii.md,
    borderWidth: borderWidth.hairline,
    borderColor: colors['oat-border'],
    padding: spacing['1'],
  },
  segment: {
    flex: 1,
    minHeight: 40,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing['2'],
  },
  segmentActive: {
    backgroundColor: colors['card'],
    ...shadows.card,
  },
  segmentPressed: {
    backgroundColor: colors['card-frosted'],
  },
  segmentText: {
    ...typography.bodySmall,
    fontFamily: typography.tabLabel.fontFamily,
    color: colors['dark-gray'],
  },
  segmentTextActive: {
    color: colors['fawn-amber'],
  },
  segmentTextDisabled: {
    color: colors['mid-gray'],
  },
});
