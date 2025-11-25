import { useEffect, useRef, useState } from "react";

function useOnScreen<T extends HTMLElement>(): [React.RefObject<T>, boolean] {
  const targetRef = useRef<T>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = targetRef.current;
    if (!node) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setVisible(entry.isIntersecting);
      },
      { rootMargin: "200px 0px" },
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [targetRef]);

  return [targetRef, visible];
}

export default useOnScreen;
