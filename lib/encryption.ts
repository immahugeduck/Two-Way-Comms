// Phase 1: placeholder encryption layer.
// Phase 2 will integrate libsignal / Signal Protocol for true E2E encryption.

export type EncryptionStatus = 'none' | 'in_transit' | 'e2e';

export function encryptMessage(plaintext: string): string {
  // TODO Phase 2: replace with Signal Protocol double-ratchet encryption
  return plaintext;
}

export function decryptMessage(ciphertext: string): string {
  // TODO Phase 2: replace with Signal Protocol double-ratchet decryption
  return ciphertext;
}

export function getEncryptionLabel(status: EncryptionStatus): string {
  switch (status) {
    case 'e2e':
      return 'End-to-end encrypted';
    case 'in_transit':
      return 'Private App Message';
    case 'none':
    default:
      return 'Not encrypted';
  }
}

export function isEncrypted(status: EncryptionStatus): boolean {
  return status === 'e2e' || status === 'in_transit';
}
