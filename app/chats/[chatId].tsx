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
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { supabase } from '@/lib/supabase';
import {
  fetchMessages,
  sendTextMessage,
  sendVoiceMessage,
  subscribeToMessages,
  decryptMessage,
} from '@/lib/messages';
import MessageBubble from '@/components/MessageBubble';
import WalkieButton from '@/components/WalkieButton';
import PrivacyBadge from '@/components/PrivacyBadge';
import { colors, spacing, radius, typography } from '@/constants/theme';
import type { Database } from '@/lib/supabase';

type Message = Database['public']['Tables']['messages']['Row'];

export default function ChatScreen() {
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  const navigation = useNavigation();

  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chatType, setChatType] = useState<'direct' | 'group'>('direct');
  const [walkieMode, setWalkieMode] = useState(false);
  const [latestAudioId, setLatestAudioId] = useState<string | null>(null);
  const [senderNames, setSenderNames] = useState<Record<string, string>>({});

  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    if (!userId || !chatId) return;

    loadChatMeta();
    loadMessages();

    const channel = subscribeToMessages(chatId, async (msg) => {
      const decrypted = await decryptMessage(msg);
      setMessages((prev) => [...prev, decrypted]);
      if (msg.message_type === 'audio') setLatestAudioId(msg.id);
      // Fetch sender name if we don't have it yet
      if (msg.sender_id !== userId && !senderNames[msg.sender_id]) {
        fetchSenderName(msg.sender_id);
      }
    });

    return () => { supabase.removeChannel(channel); };
  }, [userId, chatId]);

  useEffect(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages.length]);

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

    const name = (members?.[0]?.profiles as any)?.display_name;
    if (name) navigation.setOptions({ title: name });
  };

  const loadMessages = async () => {
    try {
      const raw = await fetchMessages(chatId);
      const decrypted = await Promise.all(raw.map(decryptMessage));
      setMessages(decrypted);

      // Build sender name map for all non-self senders
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

      const lastAudio = [...decrypted].reverse().find((m) => m.message_type === 'audio');
      if (lastAudio) setLatestAudioId(lastAudio.id);
    } catch (e: any) {
      setError('Failed to load messages');
    } finally {
      setLoading(false);
    }
  };

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
            />
          )}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
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
