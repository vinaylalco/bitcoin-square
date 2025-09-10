import { generatePrivateKey, getPublicKey } from "nostr-tools";

export default {
  async beforeCreate(event) {
    const sk = generatePrivateKey();
    const pk = getPublicKey(sk);
    event.params.data.nostrPrivateKey = sk;
    event.params.data.nostrPublicKey = pk;
  },
};
