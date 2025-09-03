import { useEffect, useState } from "react";
import { subscribeNewsletter, fetchSubscribers } from "../lib/strapi";

export function addSubscriber(email: string) {
  return subscribeNewsletter(email);
}

export function useSubscribers() {
  const [subs, setSubs] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await fetchSubscribers();
        if (alive) setSubs(list);
      } catch {
        if (alive) setSubs([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  return subs;
}
