import { useState } from 'react';
import { useNewsletter, useSubscribe, useUnsubscribe } from '../hooks/useNewsletter';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function NewsletterSubscribe() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
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
    subscribe.mutate(email);
  };

  const handleUnsubscribe = () => {
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email.');
      return;
    }
    setError('');
    unsubscribe.mutate(email);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 p-4">
      <div className="w-full max-w-md bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-semibold text-center mb-4">Newsletter</h2>
        <form onSubmit={handleSubscribe} className="space-y-4">
          <div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full border border-neutral-300 rounded px-3 py-2"
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
      </div>
    </div>
  );
}
