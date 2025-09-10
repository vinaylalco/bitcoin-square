import { generateSecretKey, getPublicKey } from "nostr-tools";

const bytesToHex = (bytes: Uint8Array): string => Buffer.from(bytes).toString("hex");

export default {
  async beforeCreate(event) {
    const sk = generateSecretKey();
    const pk = getPublicKey(sk);
    event.params.data.nostr_private_key = bytesToHex(sk);
    event.params.data.nostr_public_key = pk;
  },
};
