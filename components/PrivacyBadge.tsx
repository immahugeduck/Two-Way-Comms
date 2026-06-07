import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, radius, typography } from '@/constants/theme';
import type { EncryptionStatus } from '@/lib/encryption';
import { getEncryptionLabel } from '@/lib/encryption';

interface Props {
  status: EncryptionStatus;
  compact?: boolean;
}

export default function PrivacyBadge({ status, compact = false }: Props) {
  const isSecure = status === 'e2e' || status === 'in_transit';
  const label = getEncryptionLabel(status);

  return (
    <View style={[styles.badge, isSecure ? styles.secure : styles.insecure]}>
      <Text style={[typography.caption, compact ? styles.textCompact : styles.text]}>
        {compact ? (isSecure ? '🔒' : '⚠️') : `${isSecure ? '🔒' : '⚠️'} ${label}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    alignSelf: 'flex-start',
  },
  secure: {
    backgroundColor: colors.primaryDim,
  },
  insecure: {
    backgroundColor: colors.dangerDim,
  },
  text: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '600',
  },
  textCompact: {
    fontSize: 12,
  },
});
