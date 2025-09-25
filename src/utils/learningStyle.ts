import type { LessonCard } from "../types/lesson-plan";

export type LearningStyle = "visual" | "verbal" | "active" | "reflective";

export type LearningResourceType = "video" | "text" | "quiz" | "reflective";

export const LEARNING_STYLE_QUESTION_IDS = [
  "ls1",
  "ls2",
  "ls3",
  "ls4",
  "ls5",
  "ls6",
  "ls7",
  "ls8",
  "ls9",
  "ls10",
] as const;

export type LearningStyleQuestionId =
  (typeof LEARNING_STYLE_QUESTION_IDS)[number];

export type LearningStyleQuestionOption = {
  value: LearningStyle;
  labelKey: string;
};

export type LearningStyleQuestionConfig = {
  id: LearningStyleQuestionId;
  promptKey: string;
  options: LearningStyleQuestionOption[];
};

export type LearningStyleAnswers = Record<
  LearningStyleQuestionId,
  LearningStyle | ""
>;

export type LearningStyleScores = Record<LearningStyle, number>;

export type LearningStyleProfile = {
  primary: LearningStyle;
  secondary?: LearningStyle;
  scores: LearningStyleScores;
};

const FALLBACK_STYLE_ORDER: LearningStyle[] = [
  "visual",
  "verbal",
  "active",
  "reflective",
];

export const LEARNING_STYLE_QUESTION_CONFIG: LearningStyleQuestionConfig[] = [
  {
    id: "ls1",
    promptKey: "lesson.customize.learningStyle.questions.ls1.prompt",
    options: [
      {
        value: "visual",
        labelKey: "lesson.customize.learningStyle.questions.ls1.visual",
      },
      {
        value: "verbal",
        labelKey: "lesson.customize.learningStyle.questions.ls1.verbal",
      },
    ],
  },
  {
    id: "ls2",
    promptKey: "lesson.customize.learningStyle.questions.ls2.prompt",
    options: [
      {
        value: "active",
        labelKey: "lesson.customize.learningStyle.questions.ls2.active",
      },
      {
        value: "reflective",
        labelKey: "lesson.customize.learningStyle.questions.ls2.reflective",
      },
    ],
  },
  {
    id: "ls3",
    promptKey: "lesson.customize.learningStyle.questions.ls3.prompt",
    options: [
      {
        value: "visual",
        labelKey: "lesson.customize.learningStyle.questions.ls3.visual",
      },
      {
        value: "verbal",
        labelKey: "lesson.customize.learningStyle.questions.ls3.verbal",
      },
    ],
  },
  {
    id: "ls4",
    promptKey: "lesson.customize.learningStyle.questions.ls4.prompt",
    options: [
      {
        value: "active",
        labelKey: "lesson.customize.learningStyle.questions.ls4.active",
      },
      {
        value: "reflective",
        labelKey: "lesson.customize.learningStyle.questions.ls4.reflective",
      },
    ],
  },
  {
    id: "ls5",
    promptKey: "lesson.customize.learningStyle.questions.ls5.prompt",
    options: [
      {
        value: "visual",
        labelKey: "lesson.customize.learningStyle.questions.ls5.visual",
      },
      {
        value: "verbal",
        labelKey: "lesson.customize.learningStyle.questions.ls5.verbal",
      },
    ],
  },
  {
    id: "ls6",
    promptKey: "lesson.customize.learningStyle.questions.ls6.prompt",
    options: [
      {
        value: "active",
        labelKey: "lesson.customize.learningStyle.questions.ls6.active",
      },
      {
        value: "reflective",
        labelKey: "lesson.customize.learningStyle.questions.ls6.reflective",
      },
    ],
  },
  {
    id: "ls7",
    promptKey: "lesson.customize.learningStyle.questions.ls7.prompt",
    options: [
      {
        value: "visual",
        labelKey: "lesson.customize.learningStyle.questions.ls7.visual",
      },
      {
        value: "verbal",
        labelKey: "lesson.customize.learningStyle.questions.ls7.verbal",
      },
    ],
  },
  {
    id: "ls8",
    promptKey: "lesson.customize.learningStyle.questions.ls8.prompt",
    options: [
      {
        value: "active",
        labelKey: "lesson.customize.learningStyle.questions.ls8.active",
      },
      {
        value: "reflective",
        labelKey: "lesson.customize.learningStyle.questions.ls8.reflective",
      },
    ],
  },
  {
    id: "ls9",
    promptKey: "lesson.customize.learningStyle.questions.ls9.prompt",
    options: [
      {
        value: "visual",
        labelKey: "lesson.customize.learningStyle.questions.ls9.visual",
      },
      {
        value: "verbal",
        labelKey: "lesson.customize.learningStyle.questions.ls9.verbal",
      },
    ],
  },
  {
    id: "ls10",
    promptKey: "lesson.customize.learningStyle.questions.ls10.prompt",
    options: [
      {
        value: "active",
        labelKey: "lesson.customize.learningStyle.questions.ls10.active",
      },
      {
        value: "reflective",
        labelKey: "lesson.customize.learningStyle.questions.ls10.reflective",
      },
    ],
  },
];

export const STYLE_RESOURCE_PRIORITIES: Record<
  LearningStyle,
  LearningResourceType[]
> = {
  visual: ["video", "text", "quiz", "reflective"],
  verbal: ["text", "video", "quiz", "reflective"],
  active: ["quiz", "video", "text", "reflective"],
  reflective: ["reflective", "text", "video", "quiz"],
};

export const buildEmptyLearningStyleAnswers = (): LearningStyleAnswers =>
  Object.fromEntries(
    LEARNING_STYLE_QUESTION_IDS.map((id) => [id, ""] as const),
  ) as LearningStyleAnswers;

export const calculateLearningStyleProfile = (
  answers: LearningStyleAnswers,
): LearningStyleProfile => {
  const scores: LearningStyleScores = {
    visual: 0,
    verbal: 0,
    active: 0,
    reflective: 0,
  };

  LEARNING_STYLE_QUESTION_IDS.forEach((id) => {
    const value = answers[id];
    if (!value) return;
    scores[value] += 1;
  });

  const sorted = FALLBACK_STYLE_ORDER.map(
    (style) => [style, scores[style]] as [LearningStyle, number],
  ).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return (
      FALLBACK_STYLE_ORDER.indexOf(a[0]) - FALLBACK_STYLE_ORDER.indexOf(b[0])
    );
  });

  const [primaryStyle, primaryScore] = sorted[0];
  const [, secondaryScore] = sorted[1];
  const secondaryCandidate = sorted[1][0];

  const secondary =
    secondaryScore > 0 && primaryScore - secondaryScore <= 1
      ? secondaryCandidate
      : undefined;

  return {
    primary: primaryStyle,
    secondary,
    scores: { ...scores },
  };
};

export const buildResourcePriority = (
  profile: LearningStyleProfile,
): LearningResourceType[] => {
  const sequences: LearningResourceType[][] = [
    STYLE_RESOURCE_PRIORITIES[profile.primary],
  ];

  if (profile.secondary) {
    sequences.push(STYLE_RESOURCE_PRIORITIES[profile.secondary]);
  }

  sequences.push(["video", "text", "quiz", "reflective"]);

  const seen = new Set<LearningResourceType>();
  const merged: LearningResourceType[] = [];

  sequences.forEach((sequence) => {
    sequence.forEach((type) => {
      if (seen.has(type)) return;
      seen.add(type);
      merged.push(type);
    });
  });

  return merged;
};

export const getCardResourceTypes = (
  card: LessonCard,
): LearningResourceType[] => {
  const resources: LearningResourceType[] = [];

  if (card.isVideoLesson || card.youtube || card.videoUrl) {
    resources.push("video");
  }

  if (card.content && card.content.length > 0) {
    resources.push("text");
  }

  if (card.quiz && card.quiz.question) {
    resources.push("quiz");
  }

  if (card.learningTags?.includes("reflective")) {
    resources.push("reflective");
  }

  return resources;
};

export const getCardLearningPriority = (
  card: LessonCard,
  priorities: LearningResourceType[],
) => {
  const resources = getCardResourceTypes(card);
  let bestIndex = priorities.length;

  resources.forEach((resource) => {
    const index = priorities.indexOf(resource);
    if (index !== -1 && index < bestIndex) {
      bestIndex = index;
    }
  });

  return bestIndex;
};

