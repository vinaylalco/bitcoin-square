import { renderHook, waitFor } from "@testing-library/react";
import { useStrapiQuery } from "./useStrapiQuery";

test('fetches data from Strapi', async () => {
  const fake = { hello: 'world' };
  process.env.VITE_STRAPI_URL = "https://strapi.test";
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(fake) }) as any;
  const { result } = renderHook(() => useStrapiQuery<typeof fake>('test', '/test'));
  await waitFor(() => expect(result.current.data).toEqual(fake));
});
