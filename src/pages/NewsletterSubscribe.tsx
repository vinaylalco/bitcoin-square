import React, { useState } from 'react';
import { useNewsletter, useSubscribe, useUnsubscribe } from '../hooks/useNewsletter';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function NewsletterSubscribe() {
  const { data, isLoading, error } = useNewsletter();
  const subscribe = useSubscribe();
  const unsubscribe = useUnsubscribe();
  const [email, setEmail] = useState('');
  const [validation, setValidation] = useState('');

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailRegex.test(email)) {
      setValidation('Please enter a valid email.');
      return;
    }
    setValidation('');
    if (data) {
      subscribe.mutate({ id: data.id, subscribers: data.subscribers || [], email });
    }
  };

  const handleUnsubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailRegex.test(email)) {
      setValidation('Please enter a valid email.');
      return;
    }
    setValidation('');
    if (data) {
      unsubscribe.mutate({ id: data.id, subscribers: data.subscribers || [], email });
    }
  };

  return (
    <div className="flex justify-center">
      <div className="max-w-md w-full text-center px-4 py-8">
        <h1>Newsletter</h1>
        <h2>No spam, just value.</h2>
        <h3>Sign up for news on our latest features and offering</h3>

        {isLoading && <p className="mt-4">Loading...</p>}
        {error && <p className="mt-4 text-red-500">Error loading newsletter</p>}

        {!isLoading && !error && (
          <form
            className="border border-neutral-300 dark:border-neutral-700 mt-6 p-4 space-y-4"
            onSubmit={handleSubscribe}
          >
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 bg-transparent"
            />
            {validation && <p className="text-red-500 text-sm">{validation}</p>}
            {(subscribe.isError || unsubscribe.isError) && (
              <p className="text-red-500 text-sm">Something went wrong.</p>
            )}
            <div className="flex gap-2 justify-center">
              <button
                type="submit"
                disabled={subscribe.isPending}
                className="px-4 py-2 bg-brand text-white rounded disabled:opacity-50"
              >
                {subscribe.isPending ? 'Loading...' : 'Subscribe'}
              </button>
              <button
                type="button"
                onClick={handleUnsubscribe}
                disabled={unsubscribe.isPending}
                className="px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded disabled:opacity-50"
              >
                {unsubscribe.isPending ? 'Loading...' : 'Unsubscribe'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
