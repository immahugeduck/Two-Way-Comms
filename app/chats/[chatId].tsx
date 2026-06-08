import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
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
import { getGroupSymKey } from '@/lib/encryption';
import MessageBubble from '@/components/MessageBubble';
import DateSeparator from '@/components/DateSeparator';
import WalkieButton from '@/components/WalkieButton';
import PrivacyBadge from '@/components/PrivacyBadge';
import { colors, spacing, radius, typography } from '@/constants/theme';
import type { Database } from '@/lib/supabase';

type Message = Database['public']['Tables']['messages']['Row'];

type ListItem =
  | { type: 'message'; data: Message; isGrouped: boolean }
  | { type: 'separator'; date: string; key: string };

const SETTINGS_KEY = 'twoWay_privacy_settings';
const PAGE_SIZE = 50;
const GROUP_THRESHOLD_MS = 5 * 60 * 1000;
const TYPING_STOP_DELAY = 3000;

// Builds a combined list of messages and date separators.
// Messages array is newest-first (for inverted FlatList).
function buildListData(messages: Message[]): ListItem[] {
  const result: ListItem[] = [];
  for (let i = 0; i < messages.length; i++) {
    // A message is "grouped" if the chronologically previous message (array index i+1 = older)
    // is from the same sender within the grouping threshold.
    const older = messages[i + 1];
    const isGrouped =
      !!older &&
      older.sender_id === messages[i].sender_id &&
      new Date(messages[i].created_at).getTime() - new Date(older.created_at).getTime() <
        GROUP_THRESHOLD_MS;

    result.push({ type: 'message', data: messages[i], isGrouped });

    // Insert a date separator when the day changes (or after the oldest message)
    const currDay = new Date(messages[i].created_at).toDateString();
    const nextDay = messages[i + 1]
      ? new Date(messages[i + 1].created_at).toDateString()
      : null;

    if (!nextDay || currDay !== nextDay) {
      result.push({ type: 'separator', date: messages[i].created_at, key: `sep-${messages[i].id}` });
    }
  }
  return result;
}

export default function ChatScreen() {
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  const navigation = useNavigation();

  // Messages stored newest-first for inverted FlatList
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [myDisplayName, setMyDisplayName] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chatType, setChatType] = useState<'direct' | 'group'>('direct');
  const [groupE2E, setGroupE2E] = useState(false);
  const [otherUserId, setOtherUserId] = useState<string | null>(null);
  const [walkieMode, setWalkieMode] = useState(false);
  const [latestAudioId, setLatestAudioId] = useState<string | null>(null);
  const [senderNames, setSenderNames] = useState<Record<string, string>>({});
  const [readBy, setReadBy] = useState<Record<string, string[]>>({});
  const [readReceiptsEnabled, setReadReceiptsEnabled] = useState(true);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);

  const listRef = useRef<FlatList>(null);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const stopTypingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load user identity + privacy setting
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (uid) {
        supabase
          .from('profiles')
          .select('display_name')
          .eq('id', uid)
          .single()
          .then(({ data: p }) => {
            if (p) setMyDisplayName(p.display_name);
          });
      }
    });

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

    // Presence channel for typing indicators
    const typingChannel = supabase.channel(`typing:${chatId}`, {
      config: { presence: { key: userId } },
    });
    typingChannel.on('presence', { event: 'sync' }, () => {
      const state = typingChannel.presenceState<{ displayName: string; typing: boolean }>();
      const typing = Object.entries(state)
        .filter(([key]) => key !== userId)
        .flatMap(([, presences]) => presences)
        .filter((p) => p.typing)
        .map((p) => p.displayName);
      setTypingUsers(typing);
    });
    typingChannel.subscribe();
    typingChannelRef.current = typingChannel;

    return () => {
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(readsChannel);
      supabase.removeChannel(typingChannel);
      typingChannelRef.current = null;
      if (stopTypingTimer.current) clearTimeout(stopTypingTimer.current);
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
      // Check whether the current user has a group E2E key
      getGroupSymKey(chatId).then((key) => setGroupE2E(!!key));
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

      const readMap: Record<string, string[]> = {};
      for (const r of reads) {
        if (!readMap[r.message_id]) readMap[r.message_id] = [];
        readMap[r.message_id].push(r.user_id);
      }
      setReadBy(readMap);

      if (readReceiptsEnabled) {
        const unread = raw
          .filter((m) => m.sender_id !== userId)
          .map((m) => m.id);
        if (unread.length) markMessagesRead(unread, userId!, chatId);
      }

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

  const trackTyping = useCallback((isTyping: boolean) => {
    typingChannelRef.current?.track({ displayName: myDisplayName, typing: isTyping });
  }, [myDisplayName]);

  const handleTextChange = (t: string) => {
    setText(t);
    if (t.length > 0) {
      trackTyping(true);
      if (stopTypingTimer.current) clearTimeout(stopTypingTimer.current);
      stopTypingTimer.current = setTimeout(() => trackTyping(false), TYPING_STOP_DELAY);
    } else {
      trackTyping(false);
      if (stopTypingTimer.current) clearTimeout(stopTypingTimer.current);
    }
  };

  const handleSendText = async () => {
    if (!text.trim() || !userId || !chatId) return;
    const content = text.trim();
    setText('');
    trackTyping(false);
    if (stopTypingTimer.current) clearTimeout(stopTypingTimer.current);
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
    return (readBy[msg.id] ?? []).includes(otherUserId) ? 'read' : 'sent';
  };

  const listData = useMemo(() => buildListData(messages), [messages]);

  const encryptionStatus = chatType === 'direct' || groupE2E ? 'e2e' : 'in_transit';

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      <View style={styles.privacyBar}>
        <PrivacyBadge status={encryptionStatus as any} />
        {chatType === 'group' && !groupE2E && (
          <Text style={styles.groupEncNote}>Group key pending — messages in transit</Text>
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
          data={listData}
          inverted
          keyExtractor={(item) =>
            item.type === 'separator' ? item.key : item.data.id
          }
          renderItem={({ item }) => {
            if (item.type === 'separator') {
              return <DateSeparator date={item.date} />;
            }
            const msg = item.data;
            return (
              <MessageBubble
                type={msg.message_type as 'text' | 'audio'}
                content={msg.content}
                audioUrl={msg.audio_url}
                isOwn={msg.sender_id === userId}
                senderName={
                  chatType === 'group' && msg.sender_id !== userId
                    ? senderNames[msg.sender_id]
                    : undefined
                }
                timestamp={msg.created_at}
                encryptionStatus={msg.encryption_status as any}
                autoPlayAudio={msg.id === latestAudioId && msg.sender_id !== userId}
                readStatus={getReadStatus(msg)}
                isGrouped={item.isGrouped}
              />
            );
          }}
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

      {typingUsers.length > 0 && (
        <View style={styles.typingBar}>
          <Text style={styles.typingText}>
            {typingUsers.length === 1
              ? `${typingUsers[0]} is typing...`
              : `${typingUsers.slice(0, 2).join(' & ')} are typing...`}
          </Text>
        </View>
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
              onChangeText={handleTextChange}
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
  typingBar: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  typingText: {
    fontSize: 12,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
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
