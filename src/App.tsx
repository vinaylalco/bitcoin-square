import Translator from "./components/Translator";

/**
 * Root application component that centers the Translator on the page and
 * provides a subtle gradient background.
 */
function App() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-slate-200 p-6 text-slate-900">
      <div className="flex min-h-[80vh] items-center justify-center">
        <Translator />
      </div>
    </main>
  );
}

export default App;
