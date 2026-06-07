import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors, spacing, radius, typography } from '@/constants/theme';

interface ChatPreview {
  id: string;
  otherUser: {
    id: string;
    display_name: string;
    username: string;
    avatar_url: string | null;
  } | null;
  lastMessage: string | null;
  lastMessageType: 'text' | 'audio' | null;
  lastMessageAt: string | null;
  unread: number;
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

  useEffect(() => {
    if (!userId) return;
    fetchChats();
  }, [userId]);

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
      const { data: members } = await supabase
        .from('chat_members')
        .select('user_id, profiles(id, display_name, username, avatar_url)')
        .eq('chat_id', chatId)
        .neq('user_id', userId)
        .limit(1);

      const other = members?.[0]?.profiles as ChatPreview['otherUser'] ?? null;

      const { data: lastMsg } = await supabase
        .from('messages')
        .select('content, message_type, created_at')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      previews.push({
        id: chatId,
        otherUser: other,
        lastMessage: lastMsg?.content ?? null,
        lastMessageType: lastMsg?.message_type ?? null,
        lastMessageAt: lastMsg?.created_at ?? null,
        unread: 0,
      });
    }

    setChats(previews.sort((a, b) =>
      (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? '')
    ));
    setLoading(false);
  };

  const renderItem = ({ item }: { item: ChatPreview }) => {
    const preview =
      item.lastMessageType === 'audio'
        ? '🎙 Voice message'
        : item.lastMessage ?? 'No messages yet';

    const time = item.lastMessageAt
      ? new Date(item.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '';

    const initials = (item.otherUser?.display_name ?? '?')
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
          <Text style={styles.initials}>{initials}</Text>
        </View>
        <View style={styles.chatInfo}>
          <Text style={[typography.body, styles.name]}>
            {item.otherUser?.display_name ?? 'Unknown'}
          </Text>
          <Text style={typography.bodySmall} numberOfLines={1}>{preview}</Text>
        </View>
        <Text style={[typography.caption, styles.time]}>{time}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
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
  chatInfo: { flex: 1 },
  name: { marginBottom: 2 },
  time: { color: colors.textMuted },
});
