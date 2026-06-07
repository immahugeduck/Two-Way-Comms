import * as SecureStore from 'expo-secure-store';
import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64 } from 'tweetnacl-util';
import { supabase } from './supabase';

const PRIVATE_KEY_KEY = 'relay_e2e_private_key';

export async function ensureKeyPair(userId: string): Promise<void> {
  const stored = await SecureStore.getItemAsync(PRIVATE_KEY_KEY);

  if (stored) {
    // Ensure the public key is still synced (could have been cleared from DB)
    const keyPair = nacl.box.keyPair.fromSecretKey(decodeBase64(stored));
    await syncPublicKey(userId, encodeBase64(keyPair.publicKey));
    return;
  }

  // First time: generate a fresh key pair
  const keyPair = nacl.box.keyPair();
  await SecureStore.setItemAsync(PRIVATE_KEY_KEY, encodeBase64(keyPair.secretKey));
  await syncPublicKey(userId, encodeBase64(keyPair.publicKey));
}

export async function getPrivateKey(): Promise<Uint8Array | null> {
  const stored = await SecureStore.getItemAsync(PRIVATE_KEY_KEY);
  if (!stored) return null;
  return decodeBase64(stored);
}

export async function getPublicKeyForUser(userId: string): Promise<Uint8Array | null> {
  const { data } = await supabase
    .from('profiles')
    .select('public_key')
    .eq('id', userId)
    .single();

  if (!data?.public_key) return null;
  return decodeBase64(data.public_key);
}

async function syncPublicKey(userId: string, publicKeyB64: string): Promise<void> {
  await supabase
    .from('profiles')
    .update({ public_key: publicKeyB64 })
    .eq('id', userId);
}
