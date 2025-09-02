import React, { useState } from "react";
import { addSubscriber } from "../hooks/useNewsletter";

export default function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    addSubscriber(email);
    setDone(true);
    setEmail("");
  };

  return (
    <form onSubmit={onSubmit} className="space-y-2 text-left">
      {done ? (
        <p className="text-sm">Thanks for subscribing!</p>
      ) : (
        <div className="flex gap-2">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            className="flex-1 px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-transparent"
          />
          <button
            type="submit"
            className="px-4 py-2 rounded bg-brand text-white text-sm"
          >
            Subscribe
          </button>
        </div>
      )}
    </form>
  );
}
