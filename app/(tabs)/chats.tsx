import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors, spacing, radius, typography } from '@/constants/theme';

interface ChatPreview {
  id: string;
  chatType: 'direct' | 'group';
  name: string;
  subtitle: string;
  lastMessage: string | null;
  lastMessageType: 'text' | 'audio' | null;
  lastMessageAt: string | null;
}

export default function ChatsScreen() {
  const router = useRouter();
  const [chats, setChats] = useState<ChatPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (userId) fetchChats();
    }, [userId])
  );

  const fetchChats = async () => {
    if (!userId) return;

    const { data: memberRows } = await supabase
      .from('chat_members')
      .select('chat_id')
      .eq('user_id', userId);

    if (!memberRows?.length) {
      setChats([]);
      setLoading(false);
      return;
    }

    const chatIds = memberRows.map((r) => r.chat_id);
    const previews: ChatPreview[] = [];

    for (const chatId of chatIds) {
      const { data: chat } = await supabase
        .from('chats')
        .select('type, group_name')
        .eq('id', chatId)
        .single();

      const { data: lastMsg } = await supabase
        .from('messages')
        .select('content, message_type, created_at, encryption_status')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      let name = 'Unknown';
      let subtitle = '';

      if (chat?.type === 'group') {
        name = chat.group_name ?? 'Group';
        subtitle = 'Group chat';
      } else {
        const { data: other } = await supabase
          .from('chat_members')
          .select('profiles(display_name, username)')
          .eq('chat_id', chatId)
          .neq('user_id', userId)
          .limit(1)
          .maybeSingle();

        const profile = other?.profiles as any;
        name = profile?.display_name ?? 'Unknown';
        subtitle = profile?.username ? `@${profile.username}` : '';
      }

      // Don't show E2E message content in preview
      let previewContent = lastMsg?.content ?? null;
      if (lastMsg?.encryption_status === 'e2e' && lastMsg.message_type === 'text') {
        previewContent = '🔒 Encrypted message';
      }

      previews.push({
        id: chatId,
        chatType: chat?.type ?? 'direct',
        name,
        subtitle,
        lastMessage: previewContent,
        lastMessageType: lastMsg?.message_type ?? null,
        lastMessageAt: lastMsg?.created_at ?? null,
      });
    }

    setChats(
      previews.sort((a, b) =>
        (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? '')
      )
    );
    setLoading(false);
  };

  const renderItem = ({ item }: { item: ChatPreview }) => {
    const preview =
      item.lastMessageType === 'audio'
        ? '🎙 Voice message'
        : item.lastMessage ?? 'No messages yet';

    const time = item.lastMessageAt
      ? new Date(item.lastMessageAt).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })
      : '';

    const initials =
      item.chatType === 'group'
        ? '👥'
        : item.name
            .split(' ')
            .map((w) => w[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);

    return (
      <TouchableOpacity
        style={styles.chatRow}
        onPress={() => router.push(`/chats/${item.id}`)}
        activeOpacity={0.7}
      >
        <View style={styles.avatar}>
          <Text style={item.chatType === 'group' ? styles.groupIcon : styles.initials}>
            {initials}
          </Text>
        </View>
        <View style={styles.chatInfo}>
          <Text style={[typography.body, styles.name]}>{item.name}</Text>
          <Text style={typography.bodySmall} numberOfLines={1}>
            {preview}
          </Text>
        </View>
        <View style={styles.meta}>
          <Text style={[typography.caption, styles.time]}>{time}</Text>
          {item.chatType === 'group' && (
            <Text style={styles.groupBadge}>Group</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <TouchableOpacity
          style={styles.newGroupBtn}
          onPress={() => router.push('/chats/new-group')}
        >
          <Text style={styles.newGroupText}>+ Group</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : chats.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>💬</Text>
          <Text style={[typography.h3, styles.emptyTitle]}>No chats yet</Text>
          <Text style={typography.bodySmall}>
            Add contacts and start a secure conversation.
          </Text>
        </View>
      ) : (
        <FlatList
          data={chats}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  toolbar: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  newGroupBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.primaryDim,
    borderRadius: radius.full,
  },
  newGroupText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  loader: { marginTop: spacing.xxl },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { marginTop: spacing.sm },
  chatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  initials: { ...typography.h3, color: colors.primary, fontSize: 16 },
  groupIcon: { fontSize: 24 },
  chatInfo: { flex: 1 },
  name: { marginBottom: 2 },
  meta: { alignItems: 'flex-end', gap: 4 },
  time: { color: colors.textMuted },
  groupBadge: {
    fontSize: 10,
    color: colors.primary,
    backgroundColor: colors.primaryDim,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.full,
    fontWeight: '600',
    overflow: 'hidden',
  },
});
