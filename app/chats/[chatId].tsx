import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { supabase } from '@/lib/supabase';
import {
  fetchMessages,
  sendTextMessage,
  sendVoiceMessage,
  subscribeToMessages,
  decryptMessage,
  markMessagesRead,
  fetchReadReceipts,
  subscribeToReadReceipts,
} from '@/lib/messages';
import MessageBubble from '@/components/MessageBubble';
import WalkieButton from '@/components/WalkieButton';
import PrivacyBadge from '@/components/PrivacyBadge';
import { colors, spacing, radius, typography } from '@/constants/theme';
import type { Database } from '@/lib/supabase';

type Message = Database['public']['Tables']['messages']['Row'];

const SETTINGS_KEY = 'twoWay_privacy_settings';
const PAGE_SIZE = 50;

export default function ChatScreen() {
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  const navigation = useNavigation();

  // Messages stored newest-first for inverted FlatList
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chatType, setChatType] = useState<'direct' | 'group'>('direct');
  const [otherUserId, setOtherUserId] = useState<string | null>(null);
  const [walkieMode, setWalkieMode] = useState(false);
  const [latestAudioId, setLatestAudioId] = useState<string | null>(null);
  const [senderNames, setSenderNames] = useState<Record<string, string>>({});
  // readBy[messageId] = array of userIds who have read it
  const [readBy, setReadBy] = useState<Record<string, string[]>>({});
  const [readReceiptsEnabled, setReadReceiptsEnabled] = useState(true);

  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    AsyncStorage.getItem(SETTINGS_KEY).then((stored) => {
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (typeof parsed.readReceipts === 'boolean') {
            setReadReceiptsEnabled(parsed.readReceipts);
          }
        } catch {}
      }
    });
  }, []);

  useEffect(() => {
    if (!userId || !chatId) return;

    loadChatMeta();
    loadMessages();

    const msgChannel = subscribeToMessages(chatId, async (msg) => {
      const decrypted = await decryptMessage(msg);
      setMessages((prev) => [decrypted, ...prev]);
      if (msg.message_type === 'audio') setLatestAudioId(msg.id);
      if (msg.sender_id !== userId && !senderNames[msg.sender_id]) {
        fetchSenderName(msg.sender_id);
      }
      // Mark incoming message as read immediately if setting is on
      if (msg.sender_id !== userId && readReceiptsEnabled) {
        markMessagesRead([msg.id], userId, chatId);
      }
    });

    const readsChannel = subscribeToReadReceipts(chatId, (messageId, readerId) => {
      setReadBy((prev) => ({
        ...prev,
        [messageId]: [...(prev[messageId] ?? []), readerId],
      }));
    });

    return () => {
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(readsChannel);
    };
  }, [userId, chatId, readReceiptsEnabled]);

  const fetchSenderName = async (uid: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('id, display_name')
      .eq('id', uid)
      .single();
    if (data) {
      setSenderNames((prev) => ({ ...prev, [data.id]: data.display_name }));
    }
  };

  const loadChatMeta = async () => {
    const { data: chat } = await supabase
      .from('chats')
      .select('type, group_name')
      .eq('id', chatId)
      .single();

    if (chat?.type === 'group' && chat.group_name) {
      setChatType('group');
      navigation.setOptions({ title: chat.group_name });
      return;
    }

    const { data: members } = await supabase
      .from('chat_members')
      .select('user_id, profiles(display_name)')
      .eq('chat_id', chatId)
      .neq('user_id', userId!)
      .limit(1);

    const other = members?.[0];
    if (other) {
      setOtherUserId(other.user_id);
      const name = (other.profiles as any)?.display_name;
      if (name) navigation.setOptions({ title: name });
    }
  };

  const loadMessages = async () => {
    try {
      const [raw, reads] = await Promise.all([
        fetchMessages(chatId),
        fetchReadReceipts(chatId),
      ]);

      const decrypted = await Promise.all(raw.map(decryptMessage));
      setMessages(decrypted);
      setHasMore(raw.length === PAGE_SIZE);

      // Seed readBy map
      const readMap: Record<string, string[]> = {};
      for (const r of reads) {
        if (!readMap[r.message_id]) readMap[r.message_id] = [];
        readMap[r.message_id].push(r.user_id);
      }
      setReadBy(readMap);

      // Batch-mark all other-sender messages as read
      if (readReceiptsEnabled) {
        const unread = raw
          .filter((m) => m.sender_id !== userId)
          .map((m) => m.id);
        if (unread.length) markMessagesRead(unread, userId!, chatId);
      }

      // Build sender name map
      const otherIds = [...new Set(raw.map((m) => m.sender_id).filter((id) => id !== userId))];
      if (otherIds.length) {
        const { data } = await supabase
          .from('profiles')
          .select('id, display_name')
          .in('id', otherIds);
        if (data) {
          setSenderNames(Object.fromEntries(data.map((p) => [p.id, p.display_name])));
        }
      }

      const firstAudio = decrypted.find((m) => m.message_type === 'audio');
      if (firstAudio) setLatestAudioId(firstAudio.id);
    } catch {
      setError('Failed to load messages');
    } finally {
      setLoading(false);
    }
  };

  const loadOlderMessages = useCallback(async () => {
    if (loadingMore || !hasMore || messages.length === 0) return;
    const oldest = messages[messages.length - 1];
    setLoadingMore(true);
    try {
      const raw = await fetchMessages(chatId, { before: oldest.created_at });
      const decrypted = await Promise.all(raw.map(decryptMessage));
      setMessages((prev) => [...prev, ...decrypted]);
      setHasMore(raw.length === PAGE_SIZE);

      // Fetch sender names for any new senders
      const newIds = [...new Set(raw.map((m) => m.sender_id))].filter(
        (id) => id !== userId && !senderNames[id]
      );
      if (newIds.length) {
        const { data } = await supabase
          .from('profiles')
          .select('id, display_name')
          .in('id', newIds);
        if (data) {
          setSenderNames((prev) => ({
            ...prev,
            ...Object.fromEntries(data.map((p) => [p.id, p.display_name])),
          }));
        }
      }
    } catch {}
    setLoadingMore(false);
  }, [loadingMore, hasMore, messages, chatId, userId, senderNames]);

  const handleSendText = async () => {
    if (!text.trim() || !userId || !chatId) return;
    const content = text.trim();
    setText('');
    try {
      await sendTextMessage(chatId, userId, content);
    } catch {
      setError('Failed to send message');
    }
  };

  const handleAudioSent = useCallback(async (audioUrl: string) => {
    if (!userId || !chatId) return;
    await sendVoiceMessage(chatId, userId, audioUrl);
  }, [userId, chatId]);

  const getReadStatus = (msg: Message): 'sent' | 'read' | undefined => {
    if (msg.sender_id !== userId || chatType !== 'direct' || !otherUserId) return undefined;
    const readers = readBy[msg.id] ?? [];
    return readers.includes(otherUserId) ? 'read' : 'sent';
  };

  const encryptionStatus = chatType === 'direct' ? 'e2e' : 'in_transit';

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      <View style={styles.privacyBar}>
        <PrivacyBadge status={encryptionStatus as any} />
        {chatType === 'group' && (
          <Text style={styles.groupEncNote}>Group messages use private transport</Text>
        )}
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : error ? (
        <View style={styles.empty}>
          <Text style={[typography.bodySmall, { color: colors.danger }]}>{error}</Text>
        </View>
      ) : messages.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>💬</Text>
          <Text style={typography.bodySmall}>
            {chatType === 'direct'
              ? 'Send a message or hold the mic to talk.'
              : 'Group chat started. Say hello!'}
          </Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          inverted
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <MessageBubble
              type={item.message_type as 'text' | 'audio'}
              content={item.content}
              audioUrl={item.audio_url}
              isOwn={item.sender_id === userId}
              senderName={
                chatType === 'group' && item.sender_id !== userId
                  ? senderNames[item.sender_id]
                  : undefined
              }
              timestamp={item.created_at}
              encryptionStatus={item.encryption_status as any}
              autoPlayAudio={item.id === latestAudioId && item.sender_id !== userId}
              readStatus={getReadStatus(item)}
            />
          )}
          contentContainerStyle={styles.messageList}
          onEndReached={loadOlderMessages}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator
                size="small"
                color={colors.textMuted}
                style={styles.loadingMore}
              />
            ) : null
          }
        />
      )}

      <View style={styles.inputBar}>
        <TouchableOpacity style={styles.modeToggle} onPress={() => setWalkieMode((v) => !v)}>
          <Text style={styles.modeIcon}>{walkieMode ? '⌨️' : '🎙'}</Text>
        </TouchableOpacity>

        {walkieMode ? (
          <View style={styles.walkieModeContainer}>
            <WalkieButton chatId={chatId} onAudioSent={handleAudioSent} size="normal" />
          </View>
        ) : (
          <>
            <TextInput
              style={styles.input}
              placeholder="Message..."
              placeholderTextColor={colors.textMuted}
              value={text}
              onChangeText={setText}
              multiline
              maxLength={2000}
            />
            <TouchableOpacity
              style={[styles.sendBtn, !text.trim() && styles.sendBtnDisabled]}
              onPress={handleSendText}
              disabled={!text.trim()}
            >
              <Text style={styles.sendIcon}>↑</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  privacyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  groupEncNote: {
    fontSize: 11,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  loader: { marginTop: spacing.xxl },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
  },
  emptyIcon: { fontSize: 40 },
  messageList: { paddingVertical: spacing.sm },
  loadingMore: { paddingVertical: spacing.md },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.sm,
    minHeight: 64,
  },
  modeToggle: {
    width: 38,
    height: 38,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeIcon: { fontSize: 18 },
  walkieModeContainer: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? spacing.sm : spacing.xs,
    color: colors.textPrimary,
    fontSize: 16,
    maxHeight: 120,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendIcon: { color: colors.background, fontSize: 20, fontWeight: '700' },
});
