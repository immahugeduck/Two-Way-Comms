import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, spacing, radius, typography } from '@/constants/theme';
import PrivacyBadge from './PrivacyBadge';
import { playAudio } from '@/lib/audio';
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
}

export default function MessageBubble({
  type,
  content,
  audioUrl,
  isOwn,
  senderName,
  timestamp,
  encryptionStatus,
}: Props) {
  const [playing, setPlaying] = useState(false);

  const handlePlayAudio = async () => {
    if (!audioUrl || playing) return;
    try {
      setPlaying(true);
      await playAudio(audioUrl);
    } finally {
      setPlaying(false);
    }
  };

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
          <Text style={[typography.body, styles.messageText]}>{content}</Text>
        ) : type === 'audio' ? (
          <TouchableOpacity style={styles.audioRow} onPress={handlePlayAudio}>
            {playing ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={styles.playIcon}>▶</Text>
            )}
            <View style={styles.waveform}>
              {Array.from({ length: 20 }).map((_, i) => (
                <View
                  key={i}
                  style={[styles.bar, { height: 4 + Math.sin(i * 0.8) * 8 }]}
                />
              ))}
            </View>
            <Text style={styles.audioDuration}>PTT</Text>
          </TouchableOpacity>
        ) : null}

        <View style={styles.footer}>
          <Text style={styles.time}>{time}</Text>
          <PrivacyBadge status={encryptionStatus} compact />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    marginVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
  },
  rowOwn: { justifyContent: 'flex-end' },
  rowOther: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '75%',
    borderRadius: radius.lg,
    padding: spacing.sm + 2,
  },
  bubbleOwn: {
    backgroundColor: colors.bubbleOwn,
    borderBottomRightRadius: radius.sm,
  },
  bubbleOther: {
    backgroundColor: colors.bubbleOther,
    borderBottomLeftRadius: radius.sm,
  },
  senderName: {
    ...typography.label,
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  messageText: {
    color: colors.textPrimary,
    lineHeight: 22,
  },
  audioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  playIcon: {
    color: colors.primary,
    fontSize: 18,
  },
  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    flex: 1,
  },
  bar: {
    width: 3,
    backgroundColor: colors.primary,
    borderRadius: 2,
    opacity: 0.7,
  },
  audioDuration: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  time: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
