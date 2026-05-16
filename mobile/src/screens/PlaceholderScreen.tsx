import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { TopBar } from '../components/layout/TopBar';
import { colors, radii, shadows, spacing, typography } from '../shared/theme';

/**
 * Generic placeholder screen used by the navigation skeleton.
 *
 * Each of the five top-level tabs renders one of these until subsequent
 * issues replace the content with the real implementation (chat, dashboard,
 * record, album, profile).
 */

interface PlaceholderScreenProps {
  title: string;
  description?: string;
}

export function PlaceholderScreen({ title, description }: PlaceholderScreenProps) {
  return (
    <View style={styles.root}>
      <TopBar title={title} />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.card}>
          <Text style={[typography.heading, styles.cardTitle]}>{title}</Text>
          <Text style={[typography.body, styles.cardBody]}>
            {description ??
              '该页面将在后续子 issue 中实现。当前为导航骨架占位。'}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors['warm-cream'],
  },
  body: {
    padding: spacing['4'],
    gap: spacing['4'],
  },
  card: {
    backgroundColor: colors['card'],
    borderRadius: radii.card,
    padding: spacing['6'],
    gap: spacing['2'],
    ...shadows.card,
  },
  cardTitle: {
    color: colors['soft-charcoal'],
  },
  cardBody: {
    color: colors['dark-gray'],
  },
});
