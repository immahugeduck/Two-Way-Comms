import { supabase } from './supabase';
import type { Database } from './supabase';
import { encryptForRecipient, decryptContent } from './encryption';

type Message = Database['public']['Tables']['messages']['Row'];

// Returns the other user's ID for a direct chat, null for groups
async function getDirectChatRecipient(chatId: string, senderId: string): Promise<string | null> {
  const { data } = await supabase
    .from('chat_members')
    .select('user_id')
    .eq('chat_id', chatId)
    .neq('user_id', senderId)
    .limit(1);

  const { data: chat } = await supabase
    .from('chats')
    .select('type')
    .eq('id', chatId)
    .single();

  if (chat?.type !== 'direct') return null;
  return data?.[0]?.user_id ?? null;
}

export async function sendTextMessage(
  chatId: string,
  senderId: string,
  plaintext: string,
  expiresAt?: string
): Promise<Message> {
  // Attempt E2E for direct chats
  const recipientId = await getDirectChatRecipient(chatId, senderId);
  const { content, status } = recipientId
    ? await encryptForRecipient(plaintext, recipientId)
    : { content: plaintext, status: 'in_transit' as const };

  const { data, error } = await supabase
    .from('messages')
    .insert({
      chat_id: chatId,
      sender_id: senderId,
      message_type: 'text',
      content,
      audio_url: null,
      encryption_status: status,
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

/**
 * Decrypts a message's content in place.
 * Only decrypts text messages with e2e status.
 */
export async function decryptMessage(msg: Message): Promise<Message> {
  if (msg.message_type !== 'text' || msg.encryption_status !== 'e2e' || !msg.content) {
    return msg;
  }
  const decrypted = await decryptContent(msg.content, msg.sender_id);
  return { ...msg, content: decrypted };
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

export async function createGroupChat(
  creatorId: string,
  memberIds: string[],
  groupName: string
): Promise<string> {
  const { data: chat, error: chatError } = await supabase
    .from('chats')
    .insert({ type: 'group', group_name: groupName })
    .select()
    .single();

  if (chatError) throw chatError;

  const allMembers = Array.from(new Set([creatorId, ...memberIds]));
  const memberRows = allMembers.map((uid) => ({
    chat_id: chat.id,
    user_id: uid,
    role: uid === creatorId ? 'admin' : 'member',
  }));

  const { error: memberError } = await supabase.from('chat_members').insert(memberRows);
  if (memberError) throw memberError;

  return chat.id;
}
