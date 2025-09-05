import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import Home from './Home';

test('renders hero title', async () => {
  const fake = { data: { id: 1, attributes: { heroTitle: 'Hi', heroSubtitle: 'Welcome' } } };
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(fake) }) as any;
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <Home />
    </QueryClientProvider>
  );
  await waitFor(() => expect(screen.getByText('Hi')).toBeInTheDocument());
});
