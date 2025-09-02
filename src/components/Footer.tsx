import React from "react";
import NewsletterForm from "./NewsletterForm";

export default function Footer() {
  return (
    <footer className="border-t border-neutral-200 dark:border-neutral-800 mt-8 px-4 py-6 text-center text-sm">
      <div className="max-w-screen-sm mx-auto space-y-4">
        <NewsletterForm />
        <p className="opacity-70">&copy; {new Date().getFullYear()} Bitcoin Square</p>
      </div>
    </footer>
  );
}
