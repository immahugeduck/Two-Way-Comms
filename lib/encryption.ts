import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64, encodeUTF8, decodeUTF8 } from 'tweetnacl-util';
import { getPrivateKey, getPublicKeyForUser } from './keystore';
import { supabase } from './supabase';

export type EncryptionStatus = 'none' | 'in_transit' | 'e2e';

interface E2EPayload {
  e2e: true;
  c: string;
  n: string;
}

interface GroupE2EPayload extends E2EPayload {
  grp: true;
}

// Session-scoped cache: chatId → decrypted 32-byte group symmetric key
const groupKeyCache = new Map<string, Uint8Array>();

export function getEncryptionLabel(status: EncryptionStatus): string {
  switch (status) {
    case 'e2e':         return 'End-to-end encrypted';
    case 'in_transit':  return 'Private App Message';
    case 'none':
    default:            return 'Not encrypted';
  }
}

export function isEncrypted(status: EncryptionStatus): boolean {
  return status === 'e2e' || status === 'in_transit';
}

// ─── Direct (1:1) E2E ────────────────────────────────────────────────────────

export async function encryptForRecipient(
  plaintext: string,
  recipientUserId: string
): Promise<{ content: string; status: EncryptionStatus }> {
  const [privateKey, recipientPublicKey] = await Promise.all([
    getPrivateKey(),
    getPublicKeyForUser(recipientUserId),
  ]);

  if (!privateKey || !recipientPublicKey) {
    return { content: plaintext, status: 'in_transit' };
  }

  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const encrypted = nacl.box(encodeUTF8(plaintext), nonce, recipientPublicKey, privateKey);

  const payload: E2EPayload = {
    e2e: true,
    c: encodeBase64(encrypted),
    n: encodeBase64(nonce),
  };

  return { content: JSON.stringify(payload), status: 'e2e' };
}

// ─── Group E2E ───────────────────────────────────────────────────────────────

// Fetches and decrypts the group symmetric key, caching it for the session.
export async function getGroupSymKey(chatId: string): Promise<Uint8Array | null> {
  const cached = groupKeyCache.get(chatId);
  if (cached) return cached;

  const { data: keyRow } = await supabase
    .from('group_keys')
    .select('encrypted_sym_key, key_nonce, sender_public_key')
    .eq('chat_id', chatId)
    .single();

  if (!keyRow) return null;

  const myPrivateKey = await getPrivateKey();
  if (!myPrivateKey) return null;

  const symKey = nacl.box.open(
    decodeBase64(keyRow.encrypted_sym_key),
    decodeBase64(keyRow.key_nonce),
    decodeBase64(keyRow.sender_public_key),
    myPrivateKey
  );

  if (!symKey) return null;

  const key = new Uint8Array(symKey);
  groupKeyCache.set(chatId, key);
  return key;
}

export async function encryptForGroup(
  plaintext: string,
  chatId: string
): Promise<{ content: string; status: EncryptionStatus }> {
  const symKey = await getGroupSymKey(chatId);
  if (!symKey) return { content: plaintext, status: 'in_transit' };

  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const encrypted = nacl.secretbox(encodeUTF8(plaintext), nonce, symKey);

  const payload: GroupE2EPayload = {
    e2e: true,
    grp: true,
    c: encodeBase64(encrypted),
    n: encodeBase64(nonce),
  };

  return { content: JSON.stringify(payload), status: 'e2e' };
}

// ─── Unified decrypt ─────────────────────────────────────────────────────────

export async function decryptContent(
  content: string,
  senderUserId: string,
  chatId?: string
): Promise<string> {
  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    return content;
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    parsed.e2e !== true ||
    typeof parsed.c !== 'string' ||
    typeof parsed.n !== 'string'
  ) {
    return content;
  }

  // Group message: secretbox decrypt
  if (parsed.grp === true && chatId) {
    const symKey = await getGroupSymKey(chatId);
    if (!symKey) return '[Encrypted message — key unavailable]';

    const decrypted = nacl.secretbox.open(
      decodeBase64(parsed.c),
      decodeBase64(parsed.n),
      symKey
    );

    if (!decrypted) return '[Could not decrypt message]';
    return decodeUTF8(decrypted);
  }

  // Direct message: box decrypt
  const [privateKey, senderPublicKey] = await Promise.all([
    getPrivateKey(),
    getPublicKeyForUser(senderUserId),
  ]);

  if (!privateKey || !senderPublicKey) return '[Encrypted message — key unavailable]';

  const decrypted = nacl.box.open(
    decodeBase64(parsed.c),
    decodeBase64(parsed.n),
    senderPublicKey,
    privateKey
  );

  if (!decrypted) return '[Could not decrypt message]';
  return decodeUTF8(decrypted);
}
