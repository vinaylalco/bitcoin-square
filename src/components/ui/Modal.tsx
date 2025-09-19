import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import FocusTrap from "../FocusTrap";

interface ModalProps {
  open: boolean;
  onClose?: () => void;
  children: ReactNode;
  labelledBy?: string;
  describedBy?: string;
  dismissible?: boolean;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}

export default function Modal({
  open,
  onClose,
  children,
  labelledBy,
  describedBy,
  dismissible = true,
  returnFocusRef,
}: ModalProps) {
  const [isMounted, setIsMounted] = useState(open);
  const [isVisible, setIsVisible] = useState(open);
  const closeTimeoutRef = useRef<number | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setIsMounted(open);
    setIsVisible(open);
  }, []);

  useEffect(() => {
    if (open) {
      if (!isMounted) {
        setIsMounted(true);
      }
      requestAnimationFrame(() => {
        setIsVisible(true);
      });
    } else if (isMounted) {
      setIsVisible(false);
      if (typeof window !== "undefined") {
        if (closeTimeoutRef.current) {
          window.clearTimeout(closeTimeoutRef.current);
        }
        closeTimeoutRef.current = window.setTimeout(() => {
          setIsMounted(false);
          closeTimeoutRef.current = null;
        }, 200);
      } else {
        setIsMounted(false);
      }
    }
    return () => {
      if (typeof window !== "undefined" && closeTimeoutRef.current) {
        window.clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = null;
      }
    };
  }, [open, isMounted]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && dismissible) {
        onClose?.();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
    };
  }, [open, onClose, dismissible]);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && closeTimeoutRef.current) {
        window.clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  if (!isMounted) {
    return null;
  }

  const handleOverlayClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!dismissible) return;
    if (event.target === overlayRef.current) {
      onClose?.();
    }
  };

  const content = (
    <div
      className={`fixed inset-0 z-[60] flex items-center justify-center px-4 py-8 transition-all duration-200 ease-out ${
        isVisible ? "pointer-events-auto" : "pointer-events-none"
      }`}
    >
      <div
        ref={overlayRef}
        onClick={handleOverlayClick}
        className={`absolute inset-0 bg-neutral-950/60 backdrop-blur-sm transition-opacity duration-200 ease-out dark:bg-black/70 ${
          isVisible ? "opacity-100" : "opacity-0"
        }`}
        aria-hidden="true"
      />
      <FocusTrap active={open} onDeactivate={dismissible ? onClose : undefined} returnFocusRef={returnFocusRef}>
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelledBy}
          aria-describedby={describedBy}
          className={`relative z-10 w-full max-w-xl transform transition-all duration-200 ease-out ${
            isVisible ? "scale-100 opacity-100" : "scale-95 opacity-0"
          }`}
        >
          {children}
        </div>
      </FocusTrap>
    </div>
  );

  return createPortal(content, document.body);
}
