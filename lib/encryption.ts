import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64, encodeUTF8, decodeUTF8 } from 'tweetnacl-util';
import { getPrivateKey, getPublicKeyForUser } from './keystore';

export type EncryptionStatus = 'none' | 'in_transit' | 'e2e';

// Stored in the content field for E2E messages
interface E2EPayload {
  e2e: true;
  c: string; // ciphertext base64
  n: string; // nonce base64
}

export function getEncryptionLabel(status: EncryptionStatus): string {
  switch (status) {
    case 'e2e':       return 'End-to-end encrypted';
    case 'in_transit': return 'Private App Message';
    case 'none':
    default:           return 'Not encrypted';
  }
}

export function isEncrypted(status: EncryptionStatus): boolean {
  return status === 'e2e' || status === 'in_transit';
}

/**
 * Encrypts plaintext for a specific recipient.
 * Returns a JSON string to store in messages.content, or null if keys unavailable
 * (caller should fall back to in_transit plaintext).
 */
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

/**
 * Decrypts a message content field.
 * If the content isn't an E2E payload, returns it as-is.
 */
export async function decryptContent(
  content: string,
  senderUserId: string
): Promise<string> {
  let payload: E2EPayload;
  try {
    const parsed = JSON.parse(content);
    if (!parsed?.e2e) return content;
    payload = parsed;
  } catch {
    return content;
  }

  const [privateKey, senderPublicKey] = await Promise.all([
    getPrivateKey(),
    getPublicKeyForUser(senderUserId),
  ]);

  if (!privateKey || !senderPublicKey) return '[Encrypted message — key unavailable]';

  const decrypted = nacl.box.open(
    decodeBase64(payload.c),
    decodeBase64(payload.n),
    senderPublicKey,
    privateKey
  );

  if (!decrypted) return '[Could not decrypt message]';
  return decodeUTF8(decrypted);
}
