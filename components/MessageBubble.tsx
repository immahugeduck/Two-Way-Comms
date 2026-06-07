import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, radius, typography } from '@/constants/theme';
import PrivacyBadge from './PrivacyBadge';
import AudioPlayer from './AudioPlayer';
import type { EncryptionStatus } from '@/lib/encryption';

interface Props {
  id: string;
  type: 'text' | 'audio';
  content?: string | null;
  audioUrl?: string | null;
  isOwn: boolean;
  senderName?: string;
  timestamp: string;
  encryptionStatus: EncryptionStatus;
  autoPlayAudio?: boolean;
}

export default function MessageBubble({
  type,
  content,
  audioUrl,
  isOwn,
  senderName,
  timestamp,
  encryptionStatus,
  autoPlayAudio = false,
}: Props) {
  const time = new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <View style={[styles.row, isOwn ? styles.rowOwn : styles.rowOther]}>
      <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
        {!isOwn && senderName && (
          <Text style={styles.senderName}>{senderName}</Text>
        )}

        {type === 'text' && content ? (
          <Text style={[styles.messageText, isOwn && styles.messageTextOwn]}>
            {content}
          </Text>
        ) : type === 'audio' && audioUrl ? (
          <AudioPlayer url={audioUrl} isOwn={isOwn} autoPlay={autoPlayAudio} />
        ) : null}

        <View style={styles.footer}>
          <Text style={[styles.time, isOwn && styles.timeOwn]}>{time}</Text>
          <PrivacyBadge status={encryptionStatus} compact />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    marginVertical: 3,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
  },
  rowOwn: { justifyContent: 'flex-end' },
  rowOther: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '78%',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  bubbleOwn: {
    backgroundColor: colors.bubbleOwn,
    borderBottomRightRadius: radius.xs ?? 4,
  },
  bubbleOther: {
    backgroundColor: colors.bubbleOther,
    borderBottomLeftRadius: radius.xs ?? 4,
  },
  senderName: {
    ...typography.label,
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  messageText: {
    color: colors.textPrimary,
    fontSize: 16,
    lineHeight: 22,
  },
  messageTextOwn: {
    color: '#FFFFFF',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  time: {
    fontSize: 11,
    color: colors.textMuted,
  },
  timeOwn: {
    color: 'rgba(255,255,255,0.5)',
  },
});
