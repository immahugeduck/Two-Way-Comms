import React, { useEffect, useRef, useState } from 'react';
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
import { fetchMessages, sendTextMessage, sendVoiceMessage, subscribeToMessages } from '@/lib/messages';
import { uploadAudio, stopRecording, startRecording } from '@/lib/audio';
import MessageBubble from '@/components/MessageBubble';
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
  const [isRecording, setIsRecording] = useState(false);
  const [otherName, setOtherName] = useState('Chat');
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    if (!userId || !chatId) return;

    fetchOtherUser();
    fetchMessages(chatId).then((msgs) => {
      setMessages(msgs);
      setLoading(false);
    });

    const channel = subscribeToMessages(chatId, (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    return () => { supabase.removeChannel(channel); };
  }, [userId, chatId]);

  useEffect(() => {
    if (messages.length > 0) {
      listRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages]);

  const fetchOtherUser = async () => {
    const { data } = await supabase
      .from('chat_members')
      .select('user_id, profiles(display_name)')
      .eq('chat_id', chatId)
      .neq('user_id', userId!)
      .limit(1);
    const name = (data?.[0]?.profiles as any)?.display_name;
    if (name) {
      setOtherName(name);
      navigation.setOptions({ title: name });
    }
  };

  const handleSendText = async () => {
    if (!text.trim() || !userId || !chatId) return;
    const content = text.trim();
    setText('');
    await sendTextMessage(chatId, userId, content);
  };

  const handleRecordPress = async () => {
    if (!userId || !chatId) return;
    if (!isRecording) {
      setIsRecording(true);
      await startRecording();
    } else {
      setIsRecording(false);
      const uri = await stopRecording();
      if (!uri) return;
      const url = await uploadAudio(uri, chatId);
      if (url) await sendVoiceMessage(chatId, userId, url);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      <View style={styles.privacyBar}>
        <PrivacyBadge status="in_transit" />
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <MessageBubble
              id={item.id}
              type={item.message_type as 'text' | 'audio'}
              content={item.content}
              audioUrl={item.audio_url}
              isOwn={item.sender_id === userId}
              senderName={item.sender_id !== userId ? otherName : undefined}
              timestamp={item.created_at}
              encryptionStatus={item.encryption_status as any}
            />
          )}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        />
      )}

      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          placeholder="Message..."
          placeholderTextColor={colors.textMuted}
          value={text}
          onChangeText={setText}
          multiline
          maxLength={2000}
          returnKeyType="send"
          onSubmitEditing={handleSendText}
        />
        <TouchableOpacity
          style={[styles.iconBtn, isRecording && styles.iconBtnActive]}
          onPress={handleRecordPress}
        >
          <Text style={styles.iconBtnText}>{isRecording ? '⏹' : '🎙'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.sendBtn} onPress={handleSendText} disabled={!text.trim()}>
          <Text style={styles.sendIcon}>↑</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  privacyBar: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  loader: { marginTop: spacing.xxl },
  messageList: { paddingVertical: spacing.md },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.textPrimary,
    fontSize: 16,
    maxHeight: 120,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.walkieDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnActive: { backgroundColor: colors.dangerDim },
  iconBtnText: { fontSize: 20 },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendIcon: { color: colors.background, fontSize: 20, fontWeight: '700' },
});
