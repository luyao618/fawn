import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { colors, spacing } from '../../shared/theme';

/**
 * Doubao-style three-dot wave animation shown while waiting for the first
 * streaming token from the assistant.
 *
 * Three dots animate opacity 0.3 → 1 → 0.3 in a staggered loop (200 ms phase
 * offset each), giving a left-to-right wave. Full cycle: ~1200 ms.
 */
export function ThinkingDots() {
  const dots = [useRef(new Animated.Value(0.3)).current, useRef(new Animated.Value(0.3)).current, useRef(new Animated.Value(0.3)).current];

  useEffect(() => {
    const animations = dots.map((anim, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 200),
          Animated.timing(anim, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0.3,
            duration: 400,
            useNativeDriver: true,
          }),
          // hold so the total loop period aligns to ~1200 ms for all three dots
          Animated.delay((2 - i) * 200),
        ]),
      ),
    );
    // Start all three simultaneously; they self-stagger via the leading delay.
    Animated.parallel(animations).start();
    return () => animations.forEach((a) => a.stop());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.row}>
      {dots.map((anim, i) => (
        <Animated.View key={i} style={[styles.dot, { opacity: anim }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing['2'],
    paddingVertical: spacing['2'],
    paddingHorizontal: spacing['1'],
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors['mid-gray'],
  },
});
