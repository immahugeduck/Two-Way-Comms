import { supabase } from './supabase';
import type { Database } from './supabase';

type Message = Database['public']['Tables']['messages']['Row'];

export async function sendTextMessage(
  chatId: string,
  senderId: string,
  content: string,
  expiresAt?: string
): Promise<Message> {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      chat_id: chatId,
      sender_id: senderId,
      message_type: 'text',
      content,
      audio_url: null,
      encryption_status: 'in_transit',
      expires_at: expiresAt ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function sendVoiceMessage(
  chatId: string,
  senderId: string,
  audioUrl: string,
  expiresAt?: string
): Promise<Message> {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      chat_id: chatId,
      sender_id: senderId,
      message_type: 'audio',
      content: null,
      audio_url: audioUrl,
      encryption_status: 'in_transit',
      expires_at: expiresAt ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function fetchMessages(chatId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export function subscribeToMessages(
  chatId: string,
  onMessage: (msg: Message) => void
) {
  return supabase
    .channel(`chat:${chatId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `chat_id=eq.${chatId}`,
      },
      (payload) => onMessage(payload.new as Message)
    )
    .subscribe();
}

export async function getOrCreateDirectChat(
  userA: string,
  userB: string
): Promise<string> {
  const { data: existing } = await supabase.rpc('get_direct_chat', {
    user_a: userA,
    user_b: userB,
  });

  if (existing) return existing as string;

  const { data: chat, error: chatError } = await supabase
    .from('chats')
    .insert({ type: 'direct' })
    .select()
    .single();

  if (chatError) throw chatError;

  const { error: memberError } = await supabase.from('chat_members').insert([
    { chat_id: chat.id, user_id: userA, role: 'member' },
    { chat_id: chat.id, user_id: userB, role: 'member' },
  ]);

  if (memberError) throw memberError;

  return chat.id;
}
