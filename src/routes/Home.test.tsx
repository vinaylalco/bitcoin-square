import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import Home from './Home';

test('renders hero title', async () => {
  const fake = { data: { H1: 'Hi', MainSubHeading: 'Welcome', HomePageSection: [] } };
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(fake) }) as any;
  (import.meta as any).env = { ...(import.meta as any).env, VITE_STRAPI_URL: 'http://test' };
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <Home />
    </QueryClientProvider>
  );
  await waitFor(() => expect(screen.getByText('Hi')).toBeInTheDocument());
});
