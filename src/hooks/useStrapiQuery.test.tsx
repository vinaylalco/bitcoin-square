import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { useStrapiQuery } from './useStrapiQuery';

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

test('fetches data from Strapi', async () => {
  const fake = { hello: 'world' };
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(fake) }) as any;
  const { result } = renderHook(() => useStrapiQuery<typeof fake>('test', '/test'), { wrapper });
  await waitFor(() => expect(result.current.data).toEqual(fake));
});
