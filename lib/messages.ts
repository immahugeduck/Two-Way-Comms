import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64 } from 'tweetnacl-util';
import { supabase } from './supabase';
import type { Database } from './supabase';
import { encryptForRecipient, encryptForGroup, decryptContent } from './encryption';
import { getPrivateKey } from './keystore';

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
  expiresAt?: string,
  encryptionMode: 'standard' | 'e2e' = 'standard'
): Promise<Message> {
  let content = plaintext;
  let status: 'none' | 'in_transit' | 'e2e' = 'in_transit';

  if (encryptionMode === 'e2e') {
    const recipientId = await getDirectChatRecipient(chatId, senderId);
    const result = recipientId
      ? await encryptForRecipient(plaintext, recipientId)
      : await encryptForGroup(plaintext, chatId);
    content = result.content;
    status = result.status;
  }

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
  return data!;
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

const PAGE_SIZE = 50;

// Returns messages in descending order (newest first) for use with inverted FlatList.
// Pass `before` (ISO timestamp) to load messages older than that point.
export async function fetchMessages(
  chatId: string,
  options: { before?: string; limit?: number } = {}
): Promise<Message[]> {
  let query = supabase
    .from('messages')
    .select('*')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: false })
    .limit(options.limit ?? PAGE_SIZE);

  if (options.before) {
    query = query.lt('created_at', options.before);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

// Marks messages as read by the given user. Silently ignores duplicate reads.
export async function markMessagesRead(
  messageIds: string[],
  userId: string,
  chatId: string
): Promise<void> {
  if (!messageIds.length) return;
  const rows = messageIds.map((message_id) => ({ message_id, user_id: userId, chat_id: chatId }));
  await supabase.from('message_reads').upsert(rows, { ignoreDuplicates: true });
}

// Returns all read records for a chat (used to seed initial readBy state).
export async function fetchReadReceipts(
  chatId: string
): Promise<{ message_id: string; user_id: string }[]> {
  const { data } = await supabase
    .from('message_reads')
    .select('message_id, user_id')
    .eq('chat_id', chatId);
  return data ?? [];
}

export function subscribeToReadReceipts(
  chatId: string,
  onRead: (messageId: string, userId: string) => void
) {
  return supabase
    .channel(`reads:${chatId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'message_reads',
        filter: `chat_id=eq.${chatId}`,
      },
      (payload) => {
        const row = payload.new as { message_id: string; user_id: string };
        onRead(row.message_id, row.user_id);
      }
    )
    .subscribe();
}

/**
 * Decrypts a message's content in place.
 * Only decrypts text messages with e2e status.
 */
export async function decryptMessage(msg: Message): Promise<Message> {
  if (msg.message_type !== 'text' || msg.encryption_status !== 'e2e' || !msg.content) {
    return msg;
  }
  const decrypted = await decryptContent(msg.content, msg.sender_id, msg.chat_id);
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
  userB: string,
  mode: 'standard' | 'e2e' = 'standard'
): Promise<string> {
  const { data: existing } = await supabase.rpc('get_direct_chat', {
    user_a: userA,
    user_b: userB,
    mode,
  });

  if (existing) return existing as string;

  const { data: chat, error: chatError } = await supabase
    .from('chats')
    .insert({ type: 'direct', encryption_mode: mode })
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
    .insert({ type: 'group', group_name: groupName, encryption_mode: 'e2e' })
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

  // Distribute E2E symmetric key to all members who have public keys (non-fatal)
  distributeGroupKey(chat.id, creatorId, allMembers).catch(() => {});

  return chat.id;
}

// Generates a 32-byte symmetric key and encrypts it for each member using nacl.box.
async function distributeGroupKey(
  chatId: string,
  creatorId: string,
  memberIds: string[]
): Promise<void> {
  const creatorPrivateKey = await getPrivateKey();
  if (!creatorPrivateKey) return;

  const creatorPublicKey = nacl.box.keyPair.fromSecretKey(creatorPrivateKey).publicKey;
  const creatorPublicKeyB64 = encodeBase64(creatorPublicKey);

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, public_key')
    .in('id', memberIds);

  if (!profiles) return;

  const symKey = nacl.randomBytes(nacl.secretbox.keyLength);

  const keyRows: {
    chat_id: string;
    user_id: string;
    encrypted_sym_key: string;
    key_nonce: string;
    sender_public_key: string;
  }[] = [];

  for (const profile of profiles) {
    if (!profile.public_key) continue;
    const memberPubKey = decodeBase64(profile.public_key);
    const nonce = nacl.randomBytes(nacl.box.nonceLength);
    const encryptedKey = nacl.box(symKey, nonce, memberPubKey, creatorPrivateKey);
    keyRows.push({
      chat_id: chatId,
      user_id: profile.id,
      encrypted_sym_key: encodeBase64(encryptedKey),
      key_nonce: encodeBase64(nonce),
      sender_public_key: creatorPublicKeyB64,
    });
  }

  if (keyRows.length > 0) {
    await supabase.from('group_keys').insert(keyRows);
  }
}
