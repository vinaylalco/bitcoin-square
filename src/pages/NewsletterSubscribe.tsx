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
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  );
  useNewsletter();
  const subscribe = useSubscribe();
  const unsubscribe = useUnsubscribe();

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email.');
      return;
    }
    setError('');
    subscribe.mutate(email, {
      onSuccess: () => setStatus({ type: 'success', message: 'Subscribed successfully!' }),
      onError: () => setStatus({ type: 'error', message: 'Subscription failed.' }),
    });
  };

  const handleUnsubscribe = () => {
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email.');
      return;
    }
    setError('');
    unsubscribe.mutate(email, {
      onSuccess: () => setStatus({ type: 'success', message: 'Unsubscribed successfully.' }),
      onError: () => setStatus({ type: 'error', message: 'Unsubscribe failed.' }),
    });
  };

  return (
    <div className="p-6 space-y-4 text-center">
      <section className="px-4 sm:px-6 pt-8 pb-6">
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">Newsletter</h1>
        <h2 className="mt-3 text-neutral-700 dark:text-neutral-300 text-lg sm:text-xl max-w-3xl mx-auto">
          No spam, just value. Stay up to date with our upcoming features and offerings.
        </h2>
        <div className="mt-4 h-1 w-16 bg-brand rounded-full mx-auto"></div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="w-full max-w-md mx-auto bg-white p-6 rounded-lg shadow text-center">
          <form onSubmit={handleSubscribe} className="space-y-4">
            <div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full border border-neutral-300 rounded px-3 py-2 text-center"
              />
              {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
            </div>
            <button
              type="submit"
              className="w-full bg-brand text-white py-2 rounded hover:opacity-90"
            >
              Subscribe
            </button>
          </form>
          <button
            onClick={handleUnsubscribe}
            className="mt-4 w-full border border-neutral-300 py-2 rounded hover:bg-neutral-50"
          >
            Unsubscribe
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
      </section>
    </div>
  );
}
