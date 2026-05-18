/**
 * Avatar — RN-idiomatic port of frontend/src/components/ui/Avatar.tsx.
 *
 * Hybrid Option D: Avatar born inside its first real consumer's slice (profile).
 * Shows a photo if available, otherwise a role-appropriate icon.
 *
 * role colors mirror frontend ringByRole mapping using mobile theme tokens.
 */

import React from 'react';
import { Image } from 'expo-image';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, shadows } from '../../shared/theme';

export type AvatarRole = 'parent' | 'family' | 'friend' | 'agent' | 'baby';
export type AvatarSize = 'sm' | 'md' | 'lg';

export interface AvatarProps {
  src?: string | null;
  label?: string;
  role?: AvatarRole;
  size?: AvatarSize;
  style?: ViewStyle;
}

type RoleStyle = { backgroundColor: string; iconColor: string };

const ROLE_STYLE: Record<AvatarRole, RoleStyle> = {
  parent: { backgroundColor: colors['nursery-butter'], iconColor: colors['brand-strong'] },
  family: { backgroundColor: colors['card'], iconColor: colors['role-grandma'] },
  friend: { backgroundColor: colors['card'], iconColor: colors['dark-gray'] },
  agent: { backgroundColor: colors['nursery-mint'], iconColor: colors['brand-strong'] },
  baby: { backgroundColor: colors['nursery-powder'], iconColor: colors['info-blue'] },
};

const SIZE: Record<AvatarSize, number> = { sm: 36, md: 44, lg: 64 };
const ICON_SIZE: Record<AvatarSize, number> = { sm: 18, md: 20, lg: 28 };

function roleIcon(role: AvatarRole): React.ComponentProps<typeof Ionicons>['name'] {
  if (role === 'agent') return 'hardware-chip-outline';
  if (role === 'baby') return 'happy-outline';
  return 'person-outline';
}

export function Avatar({ src, label, role = 'family', size = 'sm', style }: AvatarProps) {
  const dim = SIZE[size];
  const iconSize = ICON_SIZE[size];
  const roleStyle = ROLE_STYLE[role];

  return (
    <View
      accessibilityLabel={label}
      style={[
        styles.base,
        {
          width: dim,
          height: dim,
          borderRadius: radii.full,
          backgroundColor: roleStyle.backgroundColor,
        },
        style,
      ]}
    >
      {src ? (
        <Image
          source={{ uri: src }}
          accessibilityLabel={label}
          cachePolicy="memory-disk"
          style={{ width: dim, height: dim, borderRadius: radii.full }}
        />
      ) : (
        <Ionicons name={roleIcon(role)} size={iconSize} color={roleStyle.iconColor} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: colors['card'],
    ...shadows.card,
  },
});
