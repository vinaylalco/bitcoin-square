import { bytesToHex, generateSecretKey, getPublicKey } from "nostr-tools";

export default {
  async beforeCreate(event) {
    const sk = generateSecretKey();
    const pk = getPublicKey(sk);
    event.params.data.nostrPrivateKey = bytesToHex(sk);
    event.params.data.nostrPublicKey = pk;
  },
};
