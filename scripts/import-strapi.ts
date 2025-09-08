import fs from 'fs/promises';

const STRAPI_URL = process.env.STRAPI_URL || 'http://localhost:1337';
const TOKEN = process.env.STRAPI_TOKEN || '';

async function request(path: string, data: any) {
  const res = await fetch(`${STRAPI_URL}/api/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {})
    },
    body: JSON.stringify({ data })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${text}`);
  }
}

async function importLanguages() {
  const raw = await fs.readFile('src/data/languages.json', 'utf-8').catch(() => '[]');
  const languages = JSON.parse(raw);
  for (const lang of languages) {
    await request('languages', lang);
  }
}

async function importLessons() {
  const raw = await fs.readFile('src/data/lessons.en.json', 'utf-8');
  const lessons = JSON.parse(raw);
  for (const lesson of lessons) {
    await request('lessons', lesson);
  }
}

async function importHome() {
  const raw = await fs.readFile('src/data/home.en.json', 'utf-8');
  const home = JSON.parse(raw);
  await fetch(`${STRAPI_URL}/api/home`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {})
    },
    body: JSON.stringify({ data: home })
  });
}

async function main() {
  await importLanguages();
  await importLessons();
  await importHome();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
