import React, { useEffect, useState, useCallback } from 'react';
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
import { getOrCreateDirectChat, sendVoiceMessage } from '@/lib/messages';
import WalkieButton from '@/components/WalkieButton';
import ContactCard from '@/components/ContactCard';
import { colors, spacing, radius, typography } from '@/constants/theme';

interface Conversation {
  chatId: string;
  chatType: 'direct' | 'group';
  name: string;
  username?: string;
  avatarUrl?: string | null;
  lastActivity: string | null;
  userId?: string;
}

export default function WalkieScreen() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    if (!userId) return;
    fetchConversations();
  }, [userId]);

  const fetchConversations = async () => {
    if (!userId) return;

    const { data: memberRows } = await supabase
      .from('chat_members')
      .select('chat_id')
      .eq('user_id', userId);

    if (!memberRows?.length) { setLoading(false); return; }

    const chatIds = memberRows.map((r) => r.chat_id);
    const convs: Conversation[] = [];

    for (const chatId of chatIds) {
      const { data: chat } = await supabase
        .from('chats')
        .select('type, group_name')
        .eq('id', chatId)
        .single();

      const { data: lastMsg } = await supabase
        .from('messages')
        .select('created_at')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (chat?.type === 'group') {
        convs.push({
          chatId,
          chatType: 'group',
          name: chat.group_name ?? 'Group',
          lastActivity: lastMsg?.created_at ?? null,
        });
      } else {
        const { data: other } = await supabase
          .from('chat_members')
          .select('user_id, profiles(id, display_name, username, avatar_url)')
          .eq('chat_id', chatId)
          .neq('user_id', userId)
          .limit(1)
          .maybeSingle();

        const profile = other?.profiles as any;
        if (profile) {
          convs.push({
            chatId,
            chatType: 'direct',
            name: profile.display_name,
            username: profile.username,
            avatarUrl: profile.avatar_url,
            lastActivity: lastMsg?.created_at ?? null,
            userId: profile.id,
          });
        }
      }
    }

    setConversations(
      convs.sort((a, b) => (b.lastActivity ?? '').localeCompare(a.lastActivity ?? ''))
    );
    setLoading(false);
  };

  const selectConversation = (conv: Conversation) => {
    setActiveConv(conv);
  };

  const openChat = (conv: Conversation) => {
    router.push(`/chats/${conv.chatId}`);
  };

  const handleAudioSent = useCallback(async (audioUrl: string) => {
    if (!activeConv || !userId) return;
    await sendVoiceMessage(activeConv.chatId, userId, audioUrl);
  }, [activeConv, userId]);

  return (
    <View style={styles.container}>
      {/* PTT Zone */}
      <View style={styles.pttZone}>
        {activeConv ? (
          <>
            <Text style={[typography.bodySmall, styles.toLabel]}>Talking to</Text>
            <Text style={[typography.h2, styles.activeName]}>{activeConv.name}</Text>
            <WalkieButton
              chatId={activeConv.chatId}
              onAudioSent={handleAudioSent}
              size="large"
            />
            <TouchableOpacity style={styles.openChatBtn} onPress={() => openChat(activeConv)}>
              <Text style={styles.openChatText}>Open Thread →</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setActiveConv(null)} style={styles.changeBtn}>
              <Text style={styles.changeBtnText}>Change</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.idleIcon}>📻</Text>
            <Text style={[typography.h2, styles.idleTitle]}>Walkie</Text>
            <Text style={[typography.bodySmall, styles.idleSubtitle]}>
              Select a conversation below{'\n'}then hold the button to talk
            </Text>
          </>
        )}
      </View>

      {/* Conversations */}
      <View style={styles.listSection}>
        <View style={styles.listHeader}>
          <Text style={styles.listHeaderText}>CONVERSATIONS</Text>
          <TouchableOpacity onPress={() => router.push('/chats/new-group')}>
            <Text style={styles.newGroupBtn}>+ New Group</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={styles.loader} />
        ) : conversations.length === 0 ? (
          <View style={styles.empty}>
            <Text style={typography.bodySmall}>
              No conversations yet. Start a chat from the Contacts tab.
            </Text>
          </View>
        ) : (
          <FlatList
            data={conversations}
            keyExtractor={(item) => item.chatId}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.convRow, activeConv?.chatId === item.chatId && styles.convRowActive]}
                onPress={() => selectConversation(item)}
                activeOpacity={0.7}
              >
                <View style={styles.convAvatar}>
                  <Text style={styles.convAvatarText}>
                    {item.chatType === 'group' ? '👥' : item.name[0].toUpperCase()}
                  </Text>
                </View>
                <View style={styles.convInfo}>
                  <Text style={[typography.body, styles.convName]}>{item.name}</Text>
                  {item.username && (
                    <Text style={typography.bodySmall}>@{item.username}</Text>
                  )}
                  {item.chatType === 'group' && (
                    <Text style={typography.bodySmall}>Group chat</Text>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.pttBtn}
                  onPress={() => selectConversation(item)}
                >
                  <Text style={styles.pttIcon}>🎙</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            )}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  pttZone: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.xl,
  },
  toLabel: { color: colors.textMuted },
  activeName: { textAlign: 'center', marginBottom: spacing.sm },
  openChatBtn: {
    paddingVertical: spacing.xs,
  },
  openChatText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  changeBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  changeBtnText: { color: colors.textMuted, fontSize: 14 },
  idleIcon: { fontSize: 56 },
  idleTitle: {},
  idleSubtitle: { textAlign: 'center', color: colors.textSecondary, lineHeight: 22 },
  listSection: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    maxHeight: 300,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  listHeaderText: { ...typography.label, letterSpacing: 1 },
  newGroupBtn: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  loader: { marginTop: spacing.lg },
  empty: { padding: spacing.xl, alignItems: 'center' },
  convRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  convRowActive: {
    backgroundColor: colors.primaryDim,
  },
  convAvatar: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  convAvatarText: { fontSize: 20, color: colors.primary },
  convInfo: { flex: 1 },
  convName: { marginBottom: 2 },
  pttBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.full,
    backgroundColor: colors.walkieDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pttIcon: { fontSize: 18 },
});
