# Bitcoin Square

React + Strapi integration demo. The frontend uses Vite and TanStack Query to consume content from a Strapi v5 instance.

## Setup

1. Copy `.env.example` to `.env` and fill in your Strapi URL and token.
2. Ensure Strapi v5 is running with the content types from `strapi/`.
3. Import legacy data:
   ```bash
   node scripts/import-strapi.ts
   ```
4. Start the dev server:
   ```bash
   npm run dev
   ```

## Testing

Vitest is configured for unit tests. Run:

```bash
npm test
```

## Strapi

The `strapi` directory contains schema definitions for Home, Lesson and Language as well as reusable SEO and rich text components. See `docs/strapi-plan.md` for more details.

## LibreTranslate integration

This project includes a lightweight helper, React hook, and demo component for working with a self-hosted [LibreTranslate](https://libretranslate.com/) instance.

### Environment configuration

Create a `.env` file (or extend your existing one) with the LibreTranslate base URL:

```env
VITE_TRANSLATE_API_URL=http://localhost:5000
```

### Trying the demo

1. Start the development server:
   ```bash
   npm run dev
   ```
2. Render the `TranslatorDemo` component anywhere in your app to try a basic UI for translating free text.

### Sample hook usage

```tsx
import { useTranslation } from "./hooks/useTranslation";

const Example = () => {
  const { translate } = useTranslation();

  const handleClick = async () => {
    const output = await translate("Hello world", "es");
    console.log(output); // "Hola mundo"
  };

  return <button onClick={handleClick}>Translate greeting</button>;
};
```
