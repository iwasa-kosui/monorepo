export type EncryptedSecret = Readonly<{ ciphertext: string; iv: string }>;

export type SecretCipher = Readonly<{
  encrypt: (plaintext: string) => Promise<EncryptedSecret>;
  decrypt: (secret: EncryptedSecret) => Promise<string | undefined>;
}>;
