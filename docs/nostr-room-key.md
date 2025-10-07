# BitcoinSquare Casual Room Key Configuration

The BitcoinSquare Casual Chat room encrypts every message with a shared AES-GCM
key. The frontend expects this key to be supplied at build time (or injected via
a runtime config shim) so that every authenticated client can decrypt and send
messages without manual key exchange.

## Provide the key via environment variable

Set `VITE_CASUAL_ROOM_KEY` in your `.env` file. The value must be a base64
string that decodes to 32 bytes (256 bits) so it can be imported as an
AES-GCM key. You can generate a suitable value with `openssl`:

```bash
openssl rand -base64 32
```

Copy the output into your `.env` file:

```env
VITE_CASUAL_ROOM_KEY=J2Jj3yusA5WwT2e9YQ5SY8EtgN9Gm8zaflT7U0kB+0I=
```

Restart the dev server after updating environment variables so Vite exposes the
new value to the client bundle.

## Optional runtime override

If you need to inject the key dynamically (for example, when serving a static
build from a CDN), define a global `__BITCOINSQUARE_CONFIG__` object before the
bundle loads:

```html
<script>
  window.__BITCOINSQUARE_CONFIG__ = {
    casualRoomKey: 'J2Jj3yusA5WwT2e9YQ5SY8EtgN9Gm8zaflT7U0kB+0I='
  };
</script>
<script type="module" src="/src/main.tsx"></script>
```

The application will use the runtime value when the environment variable is not
present.
