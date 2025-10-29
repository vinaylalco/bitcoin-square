import { decodeBech32 } from "../lib/nostrToolsShim";

// Minimal secp256k1 implementation for browser-compatible key generation
// Uses BigInt math to derive a public key from a randomly generated private key.

interface Point { x: bigint; y: bigint }

const P = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F');
const N = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');
const G: Point = {
  x: BigInt('0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798'),
  y: BigInt('0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8'),
};

const HEX_PUBKEY_REGEX = /^[0-9a-f]{64}$/i;

function mod(a: bigint, m = P): bigint {
  const res = a % m;
  return res >= 0n ? res : res + m;
}

function powMod(a: bigint, e: bigint, m: bigint): bigint {
  let result = 1n;
  let base = mod(a, m);
  while (e > 0n) {
    if (e & 1n) result = mod(result * base, m);
    base = mod(base * base, m);
    e >>= 1n;
  }
  return result;
}

function invMod(a: bigint, m = P): bigint {
  return powMod(a, m - 2n, m);
}

function pointAdd(p: Point | null, q: Point | null): Point | null {
  if (!p) return q;
  if (!q) return p;
  if (p.x === q.x) {
    if (p.y !== q.y) return null;
    return pointDouble(p);
  }
  const lam = mod((q.y - p.y) * invMod(q.x - p.x));
  const x = mod(lam * lam - p.x - q.x);
  const y = mod(lam * (p.x - x) - p.y);
  return { x, y };
}

function pointDouble(p: Point): Point | null {
  if (p.y === 0n) return null;
  const lam = mod((3n * p.x * p.x) * invMod(2n * p.y));
  const x = mod(lam * lam - 2n * p.x);
  const y = mod(lam * (p.x - x) - p.y);
  return { x, y };
}

function scalarMult(k: bigint, point: Point): Point | null {
  let res: Point | null = null;
  let add = point;
  let n = k;
  while (n > 0n) {
    if (n & 1n) res = pointAdd(res, add);
    add = pointDouble(add) as Point;
    n >>= 1n;
    if (!add) break;
  }
  return res;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function bigIntToBytes(num: bigint): Uint8Array {
  const hex = num.toString(16).padStart(64, '0');
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  return BigInt('0x' + bytesToHex(bytes));
}

function randomPrivateKey(): Uint8Array {
  const priv = new Uint8Array(32);
  let bn = 0n;
  do {
    crypto.getRandomValues(priv);
    bn = bytesToBigInt(priv);
  } while (bn === 0n || bn >= N);
  return priv;
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

function base64ToBytes(str: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(str, 'base64'));
  }
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveKey(password: string, salt: Uint8Array) {
  const enc = new TextEncoder().encode(password);
  const keyMaterial = await crypto.subtle.importKey('raw', enc, 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export function generateNostrKeyPair() {
  const privBytes = randomPrivateKey();
  const priv = bytesToHex(privBytes);
  const pubPoint = scalarMult(bytesToBigInt(privBytes), G);
  if (!pubPoint) throw new Error('Failed to derive public key');
  const pub = bytesToHex(bigIntToBytes(pubPoint.x));
  return { pub, priv };
}

export async function encryptPrivateKey(priv: string, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(priv));
  const data = {
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    cipher: bytesToBase64(new Uint8Array(cipher)),
  };
  return JSON.stringify(data);
}

export async function decryptPrivateKey(data: string, password: string): Promise<string> {
  const parsed = JSON.parse(data);
  const salt = base64ToBytes(parsed.salt);
  const iv = base64ToBytes(parsed.iv);
  const cipher = base64ToBytes(parsed.cipher);
  const key = await deriveKey(password, salt);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
  return new TextDecoder().decode(plain);
}

export async function normalizeToHexPubkey(value: string | null | undefined): Promise<string | null> {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (HEX_PUBKEY_REGEX.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  if (/^npub/i.test(trimmed)) {
    try {
      const decoded = await decodeBech32(trimmed);
      if (decoded.type === 'npub') {
        if (typeof decoded.data === 'string' && HEX_PUBKEY_REGEX.test(decoded.data)) {
          return decoded.data.toLowerCase();
        }
        if (decoded.data instanceof Uint8Array) {
          const normalized = bytesToHex(decoded.data).toLowerCase();
          if (HEX_PUBKEY_REGEX.test(normalized)) {
            return normalized;
          }
        }
      }
    } catch (error) {
      if (import.meta.env?.DEV) {
        console.warn('Failed to decode bech32 pubkey', error);
      }
    }
  }

  return null;
}
