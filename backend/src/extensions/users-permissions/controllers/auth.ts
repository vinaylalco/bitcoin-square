import auth from '@strapi/plugin-users-permissions/controllers/auth';
import { generateSecretKey, getPublicKey } from 'nostr-tools';

const bytesToHex = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex');

export default {
  async register(ctx) {
    const res = await (auth as any).register(ctx);
    if (res && res.user) {
      const sk = generateSecretKey();
      const pk = getPublicKey(sk);
      const skHex = bytesToHex(sk);
      await strapi.entityService.update('plugin::users-permissions.user', res.user.id, {
        data: { nostr_private_key: skHex, nostr_public_key: pk },
      });
      res.user.nostr_private_key = skHex;
      res.user.nostr_public_key = pk;
    }
    return res;
  },
};
