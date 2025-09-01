export default function CMSDashboard() {
  return (
    <div className="space-y-4">
      <p>Welcome to the CMS. Use the tabs above to edit lessons and the home page.</p>
      <ul className="list-disc pl-5">
        <li>Edit EN/ES content for lessons.</li>
        <li>Reorder topics and cards.</li>
        <li>Upload JSON to replace current files (auto-archived).</li>
        <li>Edit EN/ES home page content.</li>
      </ul>
    </div>
  );
}
