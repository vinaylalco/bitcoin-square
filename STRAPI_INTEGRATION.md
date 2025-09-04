# Strapi v5 Integration Guide

This project ships with a React Admin interface located under `/cms`. Follow these steps to connect it to a local Strapi v5 backend.

## 1. Content Types & Permissions

1. Install Strapi v5 locally and create a project.
2. In the Strapi admin panel create the following collection types:
   - **blog-post**: fields `title` (Text) and `content` (Rich Text).
   - **lesson**: fields `title`, `body`, optional media fields as needed.
   - **home**: fields representing homepage sections.
   - **newsletter**: fields `email`, `createdAt`.
   - **contact**: fields `name`, `email`, `message`.
3. Under *Settings → Roles*, enable `find`, `findOne`, `create`, `update`, and `delete` for each collection type for the desired role (e.g. `Authenticated`).

## 2. API Exposure

Strapi exposes REST endpoints under `/api/{collection}`. Ensure the server runs at `http://localhost:1337` or set `VITE_STRAPI_URL` in `.env` to match your instance.

- **Authentication**: Obtain a JWT by POSTing to `/api/auth/local` with `identifier` and `password`.
- Save the returned token to `localStorage` as `strapi_token` so requests from React Admin include it in the `Authorization` header.

If you prefer GraphQL, enable the GraphQL plugin and update the data provider accordingly.

## 3. React Admin Data Provider

The data provider in `src/admin/dataProvider.ts` adapts Strapi responses to React Admin's format. It handles pagination, sorting, CRUD operations and authentication headers automatically.

## 4. Running the Admin UI

1. Start the Strapi server: `npm run develop` inside the Strapi project.
2. In this project, set `VITE_STRAPI_URL` in `.env` if Strapi runs on a different host/port.
3. Log in to Strapi and copy the JWT token. Save it to `localStorage` in the browser console:
   ```js
   localStorage.setItem('strapi_token', 'your-jwt-token');
   ```
4. Start this frontend: `npm run dev`. Visit `/cms` to access React Admin.

## 5. Additional Considerations

- Use Strapi's media library for file uploads. The data provider can be extended to handle upload endpoints.
- Configure CORS in Strapi to allow requests from your frontend origin.
- For deployment, set environment variables for the production Strapi URL and ensure HTTPS is used.
