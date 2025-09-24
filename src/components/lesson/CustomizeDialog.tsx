import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Check, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  CategoryId,
  FlatPlan,
  SurveyAnswers,
} from "../../utils/buildPersonalizedFlatPlan";

const CATEGORY_IDS: CategoryId[] = ["1", "2", "3", "4", "5", "6", "7", "8"];

const EMPTY_ANSWERS: SurveyAnswers = {
  q1: [],
  q2: "",
  q3: "",
  q4: "",
  q5: "",
};

type CustomizeDialogProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (answers: SurveyAnswers) => void;
  initialAnswers?: SurveyAnswers | null;
  plan?: FlatPlan | null;
};

type SurveyQuestion = {
  value: string;
  label: string;
};

export default function CustomizeDialog({
  open,
  onClose,
  onSubmit,
  initialAnswers,
  plan,
}: CustomizeDialogProps) {
  const { t } = useTranslation();
  const [answers, setAnswers] = useState<SurveyAnswers>(EMPTY_ANSWERS);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  useEffect(() => {
    if (!open) return;
    const nextAnswers = initialAnswers
      ? { ...initialAnswers, q1: [...initialAnswers.q1] }
      : { ...EMPTY_ANSWERS, q1: [] };
    setAnswers(nextAnswers);
    setAttemptedSubmit(false);
  }, [open, initialAnswers]);

  const categoryOptions = useMemo(
    () =>
      CATEGORY_IDS.map((id) => ({
        id,
        label: t(`lesson.customize.categories.${id}`),
      })),
    [t],
  );

  const q2Options = useMemo<SurveyQuestion[]>(
    () => [
      { value: "1/2", label: t("lesson.customize.q2.options.12") },
      { value: "3", label: t("lesson.customize.q2.options.3") },
      { value: "4", label: t("lesson.customize.q2.options.4") },
      { value: "5/6", label: t("lesson.customize.q2.options.56") },
      { value: "7", label: t("lesson.customize.q2.options.7") },
      { value: "8", label: t("lesson.customize.q2.options.8") },
    ],
    [t],
  );

  const q3Options = useMemo<SurveyQuestion[]>(
    () =>
      CATEGORY_IDS.map((id) => ({
        value: id,
        label: t(`lesson.customize.q3.options.${id}`),
      })),
    [t],
  );

  const q4Options = useMemo<SurveyQuestion[]>(
    () =>
      CATEGORY_IDS.map((id) => ({
        value: id,
        label: t(`lesson.customize.q4.options.${id}`),
      })),
    [t],
  );

  const q5Options = useMemo<SurveyQuestion[]>(
    () => [
      { value: "1/2", label: t("lesson.customize.q5.options.12") },
      { value: "3", label: t("lesson.customize.q5.options.3") },
      { value: "4", label: t("lesson.customize.q5.options.4") },
      { value: "5", label: t("lesson.customize.q5.options.5") },
      { value: "6", label: t("lesson.customize.q5.options.6") },
      { value: "7", label: t("lesson.customize.q5.options.7") },
      { value: "8", label: t("lesson.customize.q5.options.8") },
    ],
    [t],
  );

  const handleToggleCategory = useCallback((categoryId: CategoryId) => {
    setAnswers((prev) => {
      const hasCategory = prev.q1.includes(categoryId);
      if (hasCategory) {
        return { ...prev, q1: prev.q1.filter((id) => id !== categoryId) };
      }
      if (prev.q1.length >= 3) {
        return prev;
      }
      return { ...prev, q1: [...prev.q1, categoryId] };
    });
  }, []);

  const handleRadioChange = useCallback(
    (question: "q2" | "q3" | "q4" | "q5", value: string) => {
      setAnswers((prev) => ({ ...prev, [question]: value }));
    },
    [],
  );

  const isQ1Valid = answers.q1.length === 3;
  const isComplete =
    isQ1Valid &&
    answers.q2.length > 0 &&
    answers.q3.length > 0 &&
    answers.q4.length > 0 &&
    answers.q5.length > 0;

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setAttemptedSubmit(true);
      if (!isComplete) return;
      onSubmit({ ...answers, q1: [...answers.q1] });
    },
    [answers, isComplete, onSubmit],
  );

  const summarySecondaryLabels = useMemo(() => {
    if (!plan) return [] as string[];
    return plan.secondaryCategories
      .slice(0, 3)
      .map((id) => t(`lesson.customize.categories.${id}`));
  }, [plan, t]);

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center px-4 py-8">
      <div
        className="absolute inset-0 bg-neutral-900/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="customize-dialog-title"
        className="relative z-10 w-full max-w-3xl rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6 text-left shadow-[var(--shadow-soft)] sm:p-8"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border-subtle)] text-[var(--fg-muted)] transition hover:text-[var(--fg-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <span className="sr-only">{t("lesson.customize.actions.close")}</span>
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="space-y-6">
          <div className="space-y-3 pr-10 sm:pr-12">
            <h2
              id="customize-dialog-title"
              className="text-2xl font-semibold tracking-tight text-[var(--fg-default)]"
            >
              {t("lesson.customize.title")}
            </h2>
            <p className="text-sm text-[var(--fg-muted)]">
              {t("lesson.customize.intro")}
            </p>
            {plan && (
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 text-sm text-[var(--fg-muted)]">
                <p className="text-xs font-semibold uppercase tracking-[0.32em] text-brand">
                  {t("lesson.customize.summary.title")}
                </p>
                <p className="mt-2 font-medium text-[var(--fg-default)]">
                  {t("lesson.customize.summary.primary", {
                    label: t(`lesson.customize.categories.${plan.primaryCategory}`),
                  })}
                </p>
                {summarySecondaryLabels.length > 0 && (
                  <p className="mt-1">
                    {t("lesson.customize.summary.secondary", {
                      list: summarySecondaryLabels.join(", "),
                    })}
                  </p>
                )}
              </div>
            )}
          </div>
          <form onSubmit={handleSubmit} className="space-y-8">
            <section>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
                <h3 className="text-lg font-semibold text-[var(--fg-default)]">
                  {t("lesson.customize.q1.prompt")}
                </h3>
                <span className="text-sm font-medium text-[var(--fg-muted)]">
                  {t("lesson.customize.q1.selectedCount", {
                    count: answers.q1.length,
                    total: 3,
                  })}
                </span>
              </div>
              <p className="mt-1 text-sm text-[var(--fg-muted)]">
                {t("lesson.customize.q1.helper")}
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {categoryOptions.map((option) => {
                  const selected = answers.q1.includes(option.id);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => handleToggleCategory(option.id)}
                      aria-pressed={selected}
                      className={`group flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                        selected
                          ? "border-brand bg-brand text-white shadow-[0_12px_30px_rgba(169,21,255,0.35)]"
                          : "border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--fg-default)] hover:-translate-y-0.5"
                      }`}
                    >
                      <span className="font-medium leading-snug">
                        {option.label}
                      </span>
                      {selected && <Check className="h-4 w-4" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
              {attemptedSubmit && !isQ1Valid && (
                <p className="mt-2 text-sm font-medium text-red-500">
                  {t("lesson.customize.errors.q1")}
                </p>
              )}
            </section>

            <SurveyRadios
              name="q2"
              title={t("lesson.customize.q2.prompt")}
              options={q2Options}
              value={answers.q2}
              onChange={(value) => handleRadioChange("q2", value)}
              attempted={attemptedSubmit}
              errorLabel={t("lesson.customize.errors.required")}
            />

            <SurveyRadios
              name="q3"
              title={t("lesson.customize.q3.prompt")}
              options={q3Options}
              value={answers.q3}
              onChange={(value) => handleRadioChange("q3", value)}
              attempted={attemptedSubmit}
              errorLabel={t("lesson.customize.errors.required")}
            />

            <SurveyRadios
              name="q4"
              title={t("lesson.customize.q4.prompt")}
              options={q4Options}
              value={answers.q4}
              onChange={(value) => handleRadioChange("q4", value)}
              attempted={attemptedSubmit}
              errorLabel={t("lesson.customize.errors.required")}
            />

            <SurveyRadios
              name="q5"
              title={t("lesson.customize.q5.prompt")}
              options={q5Options}
              value={answers.q5}
              onChange={(value) => handleRadioChange("q5", value)}
              attempted={attemptedSubmit}
              errorLabel={t("lesson.customize.errors.required")}
            />

            <div className="flex flex-col gap-4 border-t border-[var(--border-subtle)] pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-[var(--fg-muted)]">
                {t("lesson.customize.footerNote")}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex items-center justify-center rounded-full border border-[var(--border-subtle)] px-5 py-2 text-sm font-semibold uppercase tracking-[0.32em] text-[var(--fg-default)] transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  {t("lesson.customize.actions.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={!isComplete}
                  className="inline-flex items-center justify-center rounded-full border border-brand bg-brand px-5 py-2 text-sm font-semibold uppercase tracking-[0.32em] text-white shadow-[0_12px_30px_rgba(169,21,255,0.35)] transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {t("lesson.customize.actions.continue")}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

type SurveyRadiosProps = {
  name: string;
  title: string;
  options: SurveyQuestion[];
  value: string;
  onChange: (value: string) => void;
  attempted: boolean;
  errorLabel: string;
};

function SurveyRadios({
  name,
  title,
  options,
  value,
  onChange,
  attempted,
  errorLabel,
}: SurveyRadiosProps) {
  return (
    <section>
      <h3 className="text-lg font-semibold text-[var(--fg-default)]">{title}</h3>
      <div className="mt-4 space-y-2">
        {options.map((option) => {
          const checked = value === option.value;
          return (
            <label
              key={option.value}
              className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 transition focus-within:outline-none focus-within:ring-2 focus-within:ring-brand ${
                checked
                  ? "border-brand bg-brand/10 text-[var(--fg-default)]"
                  : "border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--fg-default)] hover:-translate-y-0.5"
              }`}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={checked}
                onChange={() => onChange(option.value)}
                className="mt-1 h-4 w-4 text-brand focus:ring-brand"
              />
              <span className="text-sm leading-relaxed">{option.label}</span>
            </label>
          );
        })}
      </div>
      {attempted && value.length === 0 && (
        <p className="mt-2 text-sm font-medium text-red-500">{errorLabel}</p>
      )}
    </section>
  );
}
