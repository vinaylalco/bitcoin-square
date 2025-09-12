import { useState } from 'react';
import {
  useNewsletter,
  useSubscribe,
  useUnsubscribe,
} from '../hooks/useNewsletter';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function NewsletterSubscribe() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState<
    { type: 'success' | 'error'; message: string } | null
  >(null);

  const { isLoading, isError } = useNewsletter();
  const subscribe = useSubscribe();
  const unsubscribe = useUnsubscribe();

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email.');
      return;
    }
    setError('');
    setStatus(null);
    subscribe.mutate(email, {
      onSuccess: () =>
        setStatus({ type: 'success', message: 'Subscribed successfully!' }),
      onError: () =>
        setStatus({ type: 'error', message: 'Subscription failed.' }),
    });
  };

  const handleUnsubscribe = () => {
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email.');
      return;
    }
    setError('');
    setStatus(null);
    unsubscribe.mutate(email, {
      onSuccess: () =>
        setStatus({ type: 'success', message: 'Unsubscribed successfully.' }),
      onError: () =>
        setStatus({ type: 'error', message: 'Unsubscribe failed.' }),
    });
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white dark:bg-neutral-800 p-6 rounded-lg shadow">
        {isLoading && <p className="mb-4">Loading...</p>}
        {isError && (
          <p className="mb-4 text-red-600">Failed to load subscribers.</p>
        )}

        <form onSubmit={handleSubscribe} className="space-y-4">
          <div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full border border-neutral-300 dark:border-neutral-700 rounded px-3 py-2"
            />
            {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
          </div>
          <button
            type="submit"
            className="w-full bg-brand text-white py-2 rounded hover:opacity-90 disabled:opacity-50"
            disabled={subscribe.isPending}
          >
            {subscribe.isPending ? 'Subscribing...' : 'Subscribe'}
          </button>
        </form>

        <button
          onClick={handleUnsubscribe}
          className="mt-4 w-full border border-neutral-300 dark:border-neutral-700 py-2 rounded hover:bg-neutral-50 dark:hover:bg-neutral-700 disabled:opacity-50"
          disabled={unsubscribe.isPending}
        >
          {unsubscribe.isPending ? 'Unsubscribing...' : 'Unsubscribe'}
        </button>

        {status && (
          <p
            className={`mt-4 text-sm ${
              status.type === 'success' ? 'text-green-600' : 'text-red-600'
            }`}
          >
            {status.message}
          </p>
        )}
      </div>
    </div>
  );
}

