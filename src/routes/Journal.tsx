import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { useJournalSession } from '../hooks/useJournalSession';
import { decryptJson, encryptJson, JournalCryptoError } from '../lib/crypto';
import { supabase, type JournalEntryStatus } from '../lib/supabaseClient';

type JournalFormData = {
  eventName: string;
  factualMemory: string;
  emotionsPresent: string;
  oppositeEmotions: string;
  balancingMemories: string;
  positiveEmotionReflection: string;
  wisestPerspective: string;
  underlyingPattern: string;
  observedPattern: string;
  futureMitigation: string;
  nextActions: string;
  actionTiming: string;
  forgivenessReflection: string;
};

type JournalFieldKey = keyof JournalFormData;

type EncryptedJournalPayloadData = {
  currentStep?: unknown;
  formData?: Partial<Record<JournalFieldKey, unknown>>;
};

type JournalStep = {
  title: string;
  description: string;
  fields: Array<{
    key: JournalFieldKey;
    label: string;
    placeholder: string;
  }>;
};

const EMPTY_FORM: JournalFormData = {
  eventName: '',
  factualMemory: '',
  emotionsPresent: '',
  oppositeEmotions: '',
  balancingMemories: '',
  positiveEmotionReflection: '',
  wisestPerspective: '',
  underlyingPattern: '',
  observedPattern: '',
  futureMitigation: '',
  nextActions: '',
  actionTiming: '',
  forgivenessReflection: '',
};

const JOURNAL_STEPS: JournalStep[] = [
  {
    title: 'Choose a memory or event',
    description: 'Capture the event and the factual memory without trying to solve it yet.',
    fields: [
      {
        key: 'eventName',
        label: 'Event name',
        placeholder: 'A private label for this moment',
      },
      {
        key: 'factualMemory',
        label: 'Factual memory',
        placeholder: 'What happened, as factually as possible?',
      },
    ],
  },
  {
    title: 'Achieve Balance',
    description: 'Notice what was present and whether any opposite emotion also existed.',
    fields: [
      {
        key: 'emotionsPresent',
        label: 'Emotions present',
        placeholder: 'Which emotions did you notice?',
      },
      {
        key: 'oppositeEmotions',
        label: 'Opposite emotions',
        placeholder: 'Was there any opposite or mixed emotion?',
      },
    ],
  },
  {
    title: 'Tap into the wisest parts of you',
    description: 'Bring in balancing memories and reflect on positive emotional evidence.',
    fields: [
      {
        key: 'balancingMemories',
        label: 'Balancing memories',
        placeholder: 'What memories balance or soften this event?',
      },
      {
        key: 'positiveEmotionReflection',
        label: 'Positive emotion reflection',
        placeholder: 'Where was there warmth, gratitude, relief, or care?',
      },
    ],
  },
  {
    title: 'Understand',
    description: 'Look for the wisest interpretation and the pattern underneath.',
    fields: [
      {
        key: 'wisestPerspective',
        label: 'Wisest perspective',
        placeholder: 'What would your wisest self say?',
      },
      {
        key: 'underlyingPattern',
        label: 'Underlying pattern',
        placeholder: 'What pattern may be underneath this?',
      },
      {
        key: 'observedPattern',
        label: 'Observed pattern',
        placeholder: 'What have you observed before?',
      },
    ],
  },
  {
    title: 'Accept',
    description: 'Choose mitigation and concrete next actions.',
    fields: [
      {
        key: 'futureMitigation',
        label: 'Future mitigation',
        placeholder: 'What can reduce this risk next time?',
      },
      {
        key: 'nextActions',
        label: 'Next actions',
        placeholder: 'What are the next small actions?',
      },
      {
        key: 'actionTiming',
        label: 'Action timing',
        placeholder: 'When will you do them?',
      },
    ],
  },
  {
    title: 'Forgive',
    description: 'Close with forgiveness, integration, or release.',
    fields: [
      {
        key: 'forgivenessReflection',
        label: 'Forgiveness reflection',
        placeholder: 'What forgiveness or release is available now?',
      },
    ],
  },
];

function buildDisplayTitle(date: Date): string {
  return `Journal entry - ${date.toLocaleDateString()}`;
}

function buildEncryptedPayload(formData: JournalFormData, currentStep: number) {
  return {
    currentStep,
    formData: { ...formData },
    savedAt: new Date().toISOString(),
  };
}

function normalizeLoadedFormData(payload: EncryptedJournalPayloadData): JournalFormData {
  const loaded = payload.formData ?? {};
  return Object.keys(EMPTY_FORM).reduce<JournalFormData>((next, key) => {
    const field = key as JournalFieldKey;
    const value = loaded[field];
    next[field] = typeof value === 'string' ? value : '';
    return next;
  }, { ...EMPTY_FORM });
}

function normalizeLoadedStep(step: unknown): number {
  return typeof step === 'number' && Number.isInteger(step)
    ? Math.min(Math.max(step, 0), JOURNAL_STEPS.length - 1)
    : 0;
}

function getRlsAwareMessage(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes('row-level security') || normalized.includes('rls')) {
    return 'Supabase denied access to this journal entry. Please log out and log back in, then try again.';
  }
  return message;
}

export default function Journal() {
  const {
    currentUser,
    hasJournalSecret,
    journalSecret,
    loadingAuthState,
    logout,
    session,
    setJournalSecret,
    unlockJournal,
  } = useJournalSession();
  const [secret, setSecret] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [currentEntryId, setCurrentEntryId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<JournalFormData>(EMPTY_FORM);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingEntry, setLoadingEntry] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const activeStep = JOURNAL_STEPS[currentStep] ?? JOURNAL_STEPS[0];
  const isFinalStep = currentStep === JOURNAL_STEPS.length - 1;

  const handleUnlock = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setUnlockError(null);

    if (!secret) {
      setUnlockError('Enter your journal secret to unlock your journal.');
      return;
    }

    unlockJournal(secret);
    setSecret('');
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      setCurrentEntryId(null);
      setCurrentStep(0);
      setFormData(EMPTY_FORM);
      setSaveError(null);
      setSaveSuccess(null);
      setLoadError(null);
    } finally {
      setLoggingOut(false);
    }
  };

  const handleFieldChange = (key: JournalFieldKey, value: string) => {
    setFormData((previous) => ({ ...previous, [key]: value }));
    setSaveError(null);
    setSaveSuccess(null);
  };

  const saveEntry = async (status: JournalEntryStatus) => {
    setSaveError(null);
    setSaveSuccess(null);

    if (!currentUser || !session?.access_token || !journalSecret) {
      setSaveError('Unlock your journal before saving.');
      return;
    }

    setSaving(true);
    try {
      const now = new Date();
      const encrypted = await encryptJson(buildEncryptedPayload(formData, currentStep), journalSecret);
      const payload = {
        encrypted_payload: encrypted.encrypted_payload,
        encryption_salt: encrypted.encryption_salt,
        iv: encrypted.iv,
        version: encrypted.version,
        display_title: buildDisplayTitle(now),
        status,
        completed_at: status === 'complete' ? now.toISOString() : null,
      };

      const result = currentEntryId
        ? await supabase.journalEntries.update(session.access_token, currentEntryId, payload)
        : await supabase.journalEntries.insert(session.access_token, {
            ...payload,
            user_id: currentUser.id,
          });

      if (result.error) {
        setSaveError(getRlsAwareMessage(result.error.message));
        return;
      }

      if (result.data?.id) {
        setCurrentEntryId(result.data.id);
      }

      setSaveSuccess(status === 'complete' ? 'Journal entry completed.' : 'Draft saved.');
    } catch {
      setSaveError('Unable to encrypt and save your journal entry. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDraft = async () => {
    await saveEntry('draft');
  };

  const handleComplete = async () => {
    await saveEntry('complete');
  };

  const handleNext = () => {
    setCurrentStep((previous) => Math.min(previous + 1, JOURNAL_STEPS.length - 1));
    setSaveError(null);
    setSaveSuccess(null);
  };

  const handleBack = () => {
    setCurrentStep((previous) => Math.max(previous - 1, 0));
    setSaveError(null);
    setSaveSuccess(null);
  };

  const handleTryAnotherSecret = () => {
    setJournalSecret(null);
    setCurrentEntryId(null);
    setCurrentStep(0);
    setFormData(EMPTY_FORM);
    setLoadError(null);
    setSaveError(null);
    setSaveSuccess(null);
  };

  useEffect(() => {
    if (currentUser && hasJournalSecret) {
      return;
    }

    setCurrentEntryId(null);
    setCurrentStep(0);
    setFormData(EMPTY_FORM);
    setSaveError(null);
    setSaveSuccess(null);
    setLoadError(null);
  }, [currentUser, hasJournalSecret]);

  useEffect(() => {
    if (!currentUser || !session?.access_token || !journalSecret) {
      return;
    }

    let cancelled = false;

    const loadEntry = async () => {
      setLoadingEntry(true);
      setLoadError(null);

      try {
        const result = currentEntryId
          ? await supabase.journalEntries.getById(session.access_token, currentEntryId)
          : await supabase.journalEntries.getLatestDraft(session.access_token, currentUser.id);

        if (cancelled) return;

        if (result.error) {
          setLoadError(getRlsAwareMessage(result.error.message));
          return;
        }

        if (!result.data) {
          if (!currentEntryId) {
            setCurrentStep(0);
            setFormData(EMPTY_FORM);
          }
          return;
        }

        const decrypted = await decryptJson<EncryptedJournalPayloadData>(
          result.data.encrypted_payload,
          result.data.encryption_salt,
          result.data.iv,
          journalSecret,
        );

        if (cancelled) return;

        setCurrentEntryId(result.data.id);
        setFormData(normalizeLoadedFormData(decrypted));
        setCurrentStep(normalizeLoadedStep(decrypted.currentStep));
      } catch (caught) {
        if (cancelled) return;
        if (caught instanceof JournalCryptoError) {
          setLoadError('We could not unlock this journal with that secret. Please check the secret and try again.');
          return;
        }
        setLoadError('Unable to load your journal entry. Please try again.');
      } finally {
        if (!cancelled) {
          setLoadingEntry(false);
        }
      }
    };

    loadEntry();

    return () => {
      cancelled = true;
    };
  }, [currentEntryId, currentUser, journalSecret, session?.access_token]);

  if (loadingAuthState) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center text-[var(--fg-default)] sm:px-6">
        <p className="text-sm font-semibold uppercase tracking-[0.32em] text-[var(--fg-muted)]">
          Loading your journal…
        </p>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
        <section className="rounded-3xl border border-brand/20 bg-[var(--bg-card)] p-8 shadow-[var(--shadow-soft)]">
          <p className="text-xs font-semibold uppercase tracking-[0.42em] text-brand">
            Distinctive Journaling
          </p>
          <h1 className="mt-4 text-3xl font-black uppercase tracking-[0.16em] text-[var(--fg-default)]">
            Sign in to journal
          </h1>
          <p className="mt-4 text-sm font-medium leading-relaxed text-[var(--fg-muted)]">
            Log in or sign up to access your private journaling space.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              to="/login"
              className="rounded-full bg-brand px-6 py-3 text-sm font-semibold uppercase tracking-[0.28em] text-white shadow-[0_18px_40px_rgba(169,21,255,0.35)]"
            >
              Log in
            </Link>
            <Link
              to="/signup"
              className="rounded-full border border-brand/30 px-6 py-3 text-sm font-semibold uppercase tracking-[0.28em] text-brand"
            >
              Sign up
            </Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.42em] text-brand">
            Distinctive Journaling
          </p>
          <h1 className="mt-2 text-3xl font-black uppercase tracking-[0.16em] text-[var(--fg-default)]">
            Your journal
          </h1>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="rounded-full border border-brand/30 px-5 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-brand disabled:opacity-70"
        >
          {loggingOut ? 'Logging out…' : 'Logout'}
        </button>
      </div>

      {!hasJournalSecret ? (
        <section className="rounded-3xl border border-brand/20 bg-[var(--bg-card)] p-6 shadow-[var(--shadow-soft)] sm:p-8">
          <h2 className="text-xl font-bold text-[var(--fg-default)]">Unlock your journal</h2>
          <p className="mt-3 text-sm font-medium leading-relaxed text-[var(--fg-muted)]">
            Your secret is used only in this browser session to unlock your encrypted journal. It is not stored or sent to Supabase.
          </p>
          <form onSubmit={handleUnlock} className="mt-6 space-y-4">
            <div className="space-y-2">
              <label htmlFor="journal-unlock-secret" className="text-xs font-semibold uppercase tracking-[0.32em] text-[var(--fg-muted)]">
                Secret
              </label>
              <input
                id="journal-unlock-secret"
                type="password"
                value={secret}
                onChange={(event) => setSecret(event.target.value)}
                autoComplete="off"
                className="w-full rounded-2xl border border-brand/20 bg-transparent px-4 py-3 text-sm text-[var(--fg-default)] shadow-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/60"
              />
            </div>
            {unlockError && <p className="text-sm font-semibold text-red-500">{unlockError}</p>}
            <button
              type="submit"
              className="rounded-full bg-brand px-6 py-3 text-sm font-semibold uppercase tracking-[0.28em] text-white shadow-[0_18px_40px_rgba(169,21,255,0.35)]"
            >
              Unlock journal
            </button>
          </form>
        </section>
      ) : (
        <section className="rounded-3xl border border-brand/20 bg-[var(--bg-card)] p-6 shadow-[var(--shadow-soft)] sm:p-8">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-brand">
                Step {currentStep + 1} of {JOURNAL_STEPS.length}
              </p>
              <h2 className="mt-2 text-xl font-bold text-[var(--fg-default)]">{activeStep.title}</h2>
              <p className="mt-3 text-sm font-medium leading-relaxed text-[var(--fg-muted)]">
                {activeStep.description}
              </p>
            </div>
            {currentEntryId && (
              <p className="rounded-full bg-brand/10 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-brand">
                Editing saved draft
              </p>
            )}
          </div>

          {loadingEntry && (
            <p className="mt-6 text-sm font-semibold text-[var(--fg-muted)]">Loading encrypted draft…</p>
          )}
          {loadError && (
            <div className="mt-6 space-y-3">
              <p className="text-sm font-semibold text-red-500">{loadError}</p>
              <button
                type="button"
                onClick={handleTryAnotherSecret}
                className="rounded-full border border-brand/30 px-5 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-brand"
              >
                Try another secret
              </button>
            </div>
          )}

          <form className="mt-6 space-y-5" onSubmit={(event) => event.preventDefault()}>
            {activeStep.fields.map((field) => (
              <div key={field.key} className="space-y-2">
                <label htmlFor={`journal-${field.key}`} className="text-xs font-semibold uppercase tracking-[0.32em] text-[var(--fg-muted)]">
                  {field.label}
                </label>
                <textarea
                  id={`journal-${field.key}`}
                  value={formData[field.key]}
                  onChange={(event) => handleFieldChange(field.key, event.target.value)}
                  placeholder={field.placeholder}
                  className="min-h-32 w-full rounded-2xl border border-brand/20 bg-transparent px-4 py-3 text-sm text-[var(--fg-default)] shadow-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/60"
                />
              </div>
            ))}

            {saveError && <p className="text-sm font-semibold text-red-500">{saveError}</p>}
            {saveSuccess && <p className="text-sm font-semibold text-brand">{saveSuccess}</p>}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleBack}
                  disabled={currentStep === 0 || saving}
                  className="rounded-full border border-brand/30 px-5 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-brand disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={isFinalStep || saving}
                  className="rounded-full border border-brand/30 px-5 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-brand disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={saving}
                  className="rounded-full bg-brand px-6 py-3 text-sm font-semibold uppercase tracking-[0.28em] text-white shadow-[0_18px_40px_rgba(169,21,255,0.35)] disabled:opacity-70"
                >
                  {saving ? 'Saving…' : currentEntryId ? 'Save draft' : 'Create draft'}
                </button>
                {isFinalStep && (
                  <button
                    type="button"
                    onClick={handleComplete}
                    disabled={saving}
                    className="rounded-full bg-[#FFF582] px-6 py-3 text-sm font-semibold uppercase tracking-[0.28em] text-neutral-900 shadow-[0_18px_40px_rgba(255,245,130,0.25)] disabled:opacity-70"
                  >
                    Complete entry
                  </button>
                )}
              </div>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
