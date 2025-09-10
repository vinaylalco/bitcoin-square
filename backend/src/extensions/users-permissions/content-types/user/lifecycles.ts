import { generateSecretKey, getPublicKey } from "nostr-tools";

const bytesToHex = (bytes: Uint8Array): string => Buffer.from(bytes).toString("hex");

export default {
  async beforeCreate(event) {
    const sk = generateSecretKey();
    const pk = getPublicKey(sk);
    event.params.data.nostrPrivateKey = bytesToHex(sk);
    event.params.data.nostrPublicKey = pk;
  },
};
