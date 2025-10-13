import { courseContent } from "./data/course";

function countTopics() {
  return courseContent.modules.reduce((sum, module) => sum + module.topics.length, 0);
}

function countLessons() {
  return courseContent.modules.reduce(
    (sum, module) => sum + module.topics.reduce((topicSum, topic) => topicSum + topic.lessons.length, 0),
    0,
  );
}

const navItems = [
  { label: "Overview", href: "#overview" },
  { label: "Curriculum", href: "#curriculum" },
  { label: "Resources", href: "#resources" },
  { label: "FAQ", href: "#faq" },
];

export default function App() {
  const totalModules = courseContent.modules.length;
  const totalTopics = countTopics();
  const totalLessons = countLessons();

  return (
    <div className="min-h-screen bg-[var(--bg-app)] text-[var(--fg-default)]">
      <header className="sticky top-0 z-40 border-b border-[var(--border-subtle)] bg-[var(--bg-card)]/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <a href="#overview" className="flex items-center gap-2 text-lg font-black uppercase tracking-[0.28em]">
            <span className="flex items-center gap-2">
              <img src="/btc_B_orange.png" alt="Bitcoin Square" className="h-5 w-5" />
              <span className="sr-only">Bitcoin</span>
              <span>itcoin</span>
            </span>
            <span className="rounded-full bg-brand px-2 py-0.5 text-[0.65rem] font-semibold text-white">Square</span>
          </a>

          <nav className="hidden items-center gap-8 text-xs font-semibold uppercase tracking-[0.32em] sm:flex">
            {navItems.map((item) => (
              <a key={item.href} href={item.href} className="text-[var(--fg-muted)] transition hover:text-brand">
                {item.label}
              </a>
            ))}
          </nav>
          <a
            href="#curriculum"
            className="hidden rounded-full border border-brand bg-brand px-4 py-2 text-xs font-semibold uppercase tracking-[0.32em] text-white shadow-[0_12px_30px_rgba(169,21,255,0.35)] transition hover:-translate-y-0.5 sm:inline-flex"
          >
            View lessons
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-24 px-4 py-16 sm:px-6">
        <section id="overview" className="space-y-12">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div className="space-y-6">
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-brand">{courseContent.tagline}</p>
              <h1 className="text-4xl font-black tracking-tight sm:text-5xl">{courseContent.title}</h1>
              <p className="text-lg leading-relaxed text-[var(--fg-muted)]">{courseContent.description}</p>
              <p className="text-sm font-semibold uppercase tracking-[0.32em] text-brand/80">
                {totalModules} modules · {totalTopics} topics · {totalLessons} lessons
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[var(--fg-muted)]">Duration</p>
                  <p className="mt-2 text-xl font-semibold">{courseContent.estimatedLength}</p>
                </div>
                <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[var(--fg-muted)]">Level</p>
                  <p className="mt-2 text-xl font-semibold">{courseContent.level}</p>
                </div>
                <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[var(--fg-muted)]">Modules</p>
                  <p className="mt-2 text-xl font-semibold">{totalModules}</p>
                </div>
                <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[var(--fg-muted)]">Lessons</p>
                  <p className="mt-2 text-xl font-semibold">{totalLessons}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 pt-2">
                <a
                  href="#curriculum"
                  className="inline-flex rounded-full border border-brand bg-brand px-6 py-3 text-xs font-semibold uppercase tracking-[0.32em] text-white shadow-[0_12px_30px_rgba(169,21,255,0.35)] transition hover:-translate-y-0.5"
                >
                  Start learning
                </a>
                <a
                  href="#resources"
                  className="inline-flex rounded-full border border-[var(--border-subtle)] px-6 py-3 text-xs font-semibold uppercase tracking-[0.32em] text-[var(--fg-muted)] transition hover:text-brand"
                >
                  Download materials
                </a>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-4xl border border-[var(--border-subtle)] shadow-[var(--shadow-soft)]">
              <div className="aspect-video w-full bg-black">
                <iframe
                  src={courseContent.heroVideo}
                  title="Course introduction"
                  loading="lazy"
                  className="h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            </div>
          </div>

          <div className="grid gap-6 rounded-4xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-8 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[var(--fg-muted)]">Languages</p>
              <p className="mt-2 text-lg font-semibold text-[var(--fg-default)]">{courseContent.language}</p>
              <p className="mt-2 text-sm leading-relaxed text-[var(--fg-muted)]">
                Each lesson includes bilingual vocabulary, facilitator notes, and discussion prompts so the material works anywhere.
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[var(--fg-muted)]">Included resources</p>
              <ul className="mt-3 space-y-2 text-sm text-[var(--fg-default)]">
                {courseContent.resources.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="mt-1 h-2 w-2 rounded-full bg-brand" aria-hidden />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section id="curriculum" className="space-y-12">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-brand">Curriculum</p>
            <h2 className="text-3xl font-black tracking-tight sm:text-4xl">What you will explore</h2>
            <p className="max-w-3xl text-base leading-relaxed text-[var(--fg-muted)]">
              The course is organised into modules that build on each other. Topics include videos, facilitator guidance, and lesson plans
              that you can download or remix for your local workshops.
            </p>
          </div>

          <div className="space-y-10">
            {courseContent.modules.map((module, moduleIndex) => (
              <article
                key={module.id}
                className="space-y-6 rounded-4xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-8 shadow-[var(--shadow-soft)]"
              >
                <header className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[var(--fg-muted)]">
                    Module {moduleIndex + 1}
                  </p>
                  <h3 className="text-2xl font-bold tracking-tight">{module.title}</h3>
                  <p className="text-sm leading-relaxed text-[var(--fg-muted)]">{module.description}</p>
                </header>

                <div className="space-y-6">
                  {module.topics.map((topic, topicIndex) => (
                    <div
                      key={topic.id}
                      className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 p-6"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="space-y-2">
                          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.32em] text-brand">
                            Topic {moduleIndex + 1}.{topicIndex + 1}
                          </p>
                          <h4 className="text-xl font-semibold">{topic.title}</h4>
                          <p className="text-sm leading-relaxed text-[var(--fg-muted)]">{topic.description}</p>
                        </div>
                        {topic.videoUrl && (
                          <a
                            href={topic.videoUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex rounded-full border border-brand px-4 py-2 text-[0.65rem] font-semibold uppercase tracking-[0.32em] text-brand transition hover:-translate-y-0.5"
                          >
                            Watch overview
                          </a>
                        )}
                      </div>

                      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
                        <ul className="space-y-3 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 text-sm text-[var(--fg-default)]">
                          {topic.keyPoints.map((point) => (
                            <li key={point} className="flex items-start gap-2">
                              <span className="mt-1 h-2 w-2 rounded-full bg-brand" aria-hidden />
                              <span>{point}</span>
                            </li>
                          ))}
                        </ul>

                        <div className="space-y-4">
                          {topic.lessons.map((lesson) => (
                            <div
                              key={lesson.id}
                              className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-4">
                                <p className="text-base font-semibold">{lesson.title}</p>
                                <span className="text-xs font-semibold uppercase tracking-[0.32em] text-[var(--fg-muted)]">
                                  {lesson.duration}
                                </span>
                              </div>
                              <ul className="mt-3 space-y-2 text-sm text-[var(--fg-muted)]">
                                {lesson.summary.map((item) => (
                                  <li key={item} className="flex items-start gap-2">
                                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-brand" aria-hidden />
                                    <span>{item}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="resources" className="space-y-6 rounded-4xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-8">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-brand">Resources</p>
            <h2 className="text-3xl font-black tracking-tight sm:text-4xl">Facilitator toolkit</h2>
            <p className="max-w-3xl text-base leading-relaxed text-[var(--fg-muted)]">
              Download ready-to-use lesson decks, share printable guides with your learners, or remix the activities for your next meetup.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {courseContent.resources.map((item) => (
              <div key={item} className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/70 p-6 text-sm">
                <p className="font-semibold text-[var(--fg-default)]">{item}</p>
                <p className="mt-2 text-[var(--fg-muted)]">
                  Delivered as editable PDFs and slides so you can adapt them to your community.
                </p>
              </div>
            ))}
          </div>
        </section>

        <section id="faq" className="space-y-6">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-brand">FAQ</p>
            <h2 className="text-3xl font-black tracking-tight sm:text-4xl">Still curious?</h2>
            <p className="max-w-3xl text-base leading-relaxed text-[var(--fg-muted)]">
              This curriculum is open for anyone to use offline. Share it with students, community leaders, or friends who are Bitcoin curious.
            </p>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6">
              <h3 className="text-lg font-semibold">How do I use the lessons offline?</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--fg-muted)]">
                Every topic includes bullet-point summaries and facilitation notes so you can teach from printouts or a tablet without needing internet access.
              </p>
            </div>
            <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6">
              <h3 className="text-lg font-semibold">Can I translate the material?</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--fg-muted)]">
                Yes. Adapt the examples, change the vocabulary, and republish your version. Please reference Bitcoin Square so others can find the original.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="mt-16 border-t border-[var(--border-subtle)] bg-[var(--bg-card)]/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 py-10 text-center text-xs font-semibold uppercase tracking-[0.32em] text-[var(--fg-muted)] sm:px-6">
          <nav className="flex flex-wrap justify-center gap-4 sm:gap-6">
            {navItems.map((item) => (
              <a key={item.href} href={item.href} className="transition hover:text-brand">
                {item.label}
              </a>
            ))}
          </nav>
          <p className="text-[var(--fg-muted)]">&copy; {new Date().getFullYear()} Bitcoin Square. Learn, build, and share Bitcoin with your community.</p>
          <div className="flex items-center gap-4">
            <a
              href="https://www.tiktok.com/@elbitcoiner"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border-subtle)] transition hover:border-brand hover:bg-brand/10"
              aria-label="TikTok"
            >
              <svg className="h-5 w-5" viewBox="0 0 32 32" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path d="M16.656 1.029c1.637-.025 3.262-.012 4.886-.025.054 2.031.878 3.859 2.189 5.213 1.411 1.271 3.247 2.095 5.271 2.235v5.036c-1.912-.048-3.71-.489-5.331-1.247-.784-.377-1.447-.764-2.077-1.196v10.934c-.103 1.853-.719 3.543-1.707 4.954-1.652 2.366-4.328 3.919-7.371 4.011-.123.006-.268.009-.414.009-1.73 0-3.347-.482-4.725-1.319-2.508-1.509-4.238-4.091-4.558-7.094-.025-.625-.037-1.25-.012-1.862.49-4.779 4.494-8.476 9.361-8.476.547 0 1.083.047 1.604.136.025 1.849-.05 3.699-.05 5.548-.423-.153-.911-.242-1.42-.242-1.868 0-3.457 1.194-4.045 2.861-.133.427-.21.918-.21 1.426 0 .206.013.41.037.61.332 2.046 2.086 3.59 4.201 3.59.061 0 .121-.001.181-.004 1.463-.044 2.733-.831 3.451-1.994.267-.372.45-.822.511-1.311.125-2.237.075-4.461.087-6.698.012-5.036-.012-10.06.025-15.083z" />
              </svg>
            </a>
            <a
              href="https://www.instagram.com/elbitcoiner"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border-subtle)] transition hover:border-brand hover:bg-brand/10"
              aria-label="Instagram"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                <line x1="17.5" y1="6.5" x2="17.5" y2="6.5" />
              </svg>
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
