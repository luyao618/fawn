import React from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { colors, radii, spacing } from '../../shared/theme';

/**
 * Three pulsing dots — mirrors `frontend/src/components/chat/TypingIndicator.tsx`.
 *
 * Uses RN's built-in Animated (no reanimated dependency). Each dot fades
 * between 0.3 and 1 opacity with a staggered delay.
 */

function Dot({ delay }: { delay: number }) {
  const opacity = React.useRef(new Animated.Value(0.3)).current;

  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 350,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 350,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [delay, opacity]);

  return <Animated.View style={[styles.dot, { opacity }]} />;
}

export function TypingIndicator() {
  return (
    <View style={styles.row} accessibilityLabel="管家正在输入">
      <Dot delay={0} />
      <Dot delay={150} />
      <Dot delay={300} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing['1'],
    paddingVertical: spacing['1'],
    paddingHorizontal: spacing['1'],
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radii.full,
    backgroundColor: colors['mid-gray'],
  },
});
