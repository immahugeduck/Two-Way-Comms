import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Supabase Database Webhook payload shape for INSERT events
interface WebhookPayload {
  type: 'INSERT';
  table: string;
  schema: string;
  record: {
    id: string;
    chat_id: string;
    sender_id: string;
    message_type: 'text' | 'audio' | 'system';
    content: string | null;
    audio_url: string | null;
    encryption_status: string;
    expires_at: string | null;
    created_at: string;
  };
}

interface ExpoPushMessage {
  to: string | string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default';
  badge?: number;
  channelId?: string;
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

Deno.serve(async (req) => {
  // Only accept POST from Supabase webhooks
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  if (payload.type !== 'INSERT' || payload.table !== 'messages') {
    return new Response('Ignored', { status: 200 });
  }

  const { chat_id, sender_id, message_type, content } = payload.record;

  // Get sender display name
  const { data: sender } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', sender_id)
    .single();

  const senderName = sender?.display_name ?? 'Someone';

  // Get all chat members except the sender
  const { data: members } = await supabase
    .from('chat_members')
    .select('user_id')
    .eq('chat_id', chat_id)
    .neq('user_id', sender_id);

  if (!members?.length) {
    return new Response('No recipients', { status: 200 });
  }

  const recipientIds = members.map((m) => m.user_id);

  // Get push tokens for all recipients
  const { data: tokenRows } = await supabase
    .from('push_tokens')
    .select('token')
    .in('user_id', recipientIds);

  if (!tokenRows?.length) {
    return new Response('No push tokens', { status: 200 });
  }

  const tokens = tokenRows.map((r) => r.token);

  // Build notification body
  const body =
    message_type === 'audio'
      ? '🎙 Sent a voice message'
      : content ?? 'New message';

  const messages: ExpoPushMessage[] = tokens.map((token) => ({
    to: token,
    title: senderName,
    body,
    sound: 'default',
    data: { chatId: chat_id },
    channelId: 'messages',
  }));

  // Send to Expo Push API (max 100 per request)
  const chunks: ExpoPushMessage[][] = [];
  for (let i = 0; i < messages.length; i += 100) {
    chunks.push(messages.slice(i, i + 100));
  }

  const results = await Promise.allSettled(
    chunks.map((chunk) =>
      fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(chunk),
      }).then((r) => r.json())
    )
  );

  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length) {
    console.error('Some push chunks failed:', failed);
  }

  return new Response(JSON.stringify({ sent: tokens.length }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
