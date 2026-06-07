import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, radius, typography } from '@/constants/theme';

interface Props {
  id: string;
  displayName: string;
  username: string;
  avatarUrl?: string | null;
  isOnline?: boolean;
  onPress?: () => void;
  onWalkiePress?: () => void;
  trailing?: React.ReactNode;
}

export default function ContactCard({
  displayName,
  username,
  avatarUrl,
  isOnline = false,
  onPress,
  onWalkiePress,
  trailing,
}: Props) {
  const initials = displayName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.avatarWrapper}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarFallback}>
            <Text style={styles.initials}>{initials}</Text>
          </View>
        )}
        {isOnline && <View style={styles.onlineDot} />}
      </View>

      <View style={styles.info}>
        <Text style={[typography.body, styles.name]}>{displayName}</Text>
        <Text style={typography.bodySmall}>@{username}</Text>
      </View>

      {onWalkiePress && (
        <TouchableOpacity style={styles.walkieBtn} onPress={onWalkiePress}>
          <Text style={styles.walkieIcon}>🎙</Text>
        </TouchableOpacity>
      )}
      {trailing}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  avatarWrapper: {
    position: 'relative',
    marginRight: spacing.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
  },
  avatarFallback: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    ...typography.h3,
    color: colors.primary,
    fontSize: 16,
  },
  onlineDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: radius.full,
    backgroundColor: colors.online,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  info: {
    flex: 1,
  },
  name: {
    marginBottom: 2,
  },
  walkieBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.walkieDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  walkieIcon: {
    fontSize: 20,
  },
});
