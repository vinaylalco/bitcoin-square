import { cn } from "../../utils/cn";

export type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;

export default function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      {...props}
      className={cn(
        "relative isolate overflow-hidden rounded-xl bg-neutral-200/70 dark:bg-neutral-800/60",
        "before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.6s_infinite] before:content-['']",
        "before:bg-gradient-to-r before:from-transparent before:via-white/60 before:to-transparent dark:before:via-white/10",
        className,
      )}
    />
  );
}

