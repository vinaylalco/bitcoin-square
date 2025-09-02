import React from "react";
import { getSubscribers, useSubscribers } from "../../hooks/useNewsletter";

export default function NewsletterAdmin() {
  const subs = useSubscribers();

  const exportCsv = () => {
    const csv = getSubscribers().join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "subscribers.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <h2 className="text-lg font-semibold">Subscribers ({subs.length})</h2>
        <button
          type="button"
          onClick={exportCsv}
          className="px-3 py-1.5 rounded bg-brand text-white text-sm"
        >
          Export CSV
        </button>
      </div>
      <ul className="list-disc pl-5 space-y-1">
        {subs.map((s) => (
          <li key={s}>{s}</li>
        ))}
        {subs.length === 0 && <li className="opacity-70 list-none">No subscribers.</li>}
      </ul>
    </div>
  );
}
