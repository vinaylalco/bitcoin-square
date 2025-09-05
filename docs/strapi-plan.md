# Strapi Integration Plan

This project integrates a React frontend with a Strapi v5 headless CMS. Strapi models three domains: a singleton **Home** type for landing page content, a **Lesson** collection for individual lessons, and a **Language** collection that lessons reference. The frontend talks to Strapi over the REST API using a small typed client and a reusable `useStrapiQuery` hook backed by TanStack Query. Data is loaded from `VITE_STRAPI_URL` so environments can point to different CMS instances. Components handle loading, error, and empty states, while tests cover the core hook and the home page.

## Content Types

### Home (single type)
- `heroTitle` (string, required)
- `heroSubtitle` (string)
- `heroImage` (media)
- `featuredLessons` (relation → Lesson)
- `blocks` (dynamic zone of `shared.rich-text`)
- `seo` (component `shared.seo`)

### Lesson (collection)
- `title` (string, required)
- `slug` (UID, unique)
- `language` (relation → Language, required)
- `summary` (text)
- `content` (rich text)
- `level` (enum: beginner/intermediate/advanced)
- `duration` (integer)
- `tags` (JSON)
- `coverImage` (media)
- `publishedAt` (datetime)

### Language (collection)
- `name` (string, required)
- `code` (string, unique, required)
- `description` (text)
- `icon` (media)

These schemas live under `strapi/` and can be loaded into an existing Strapi v5 project. `scripts/import-strapi.ts` uses the REST API to import legacy JSON data for languages, lessons and home content.
