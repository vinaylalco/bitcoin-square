export type CategoryId = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8";

export type Topic = {
  id: string;
  title: string;
  categoryId: CategoryId;
  originalOrder?: number;
  durationMins?: number;
  url?: string;
  tags?: string[];
  moduleId?: string;
  moduleTitle?: string;
};

export type SurveyAnswers = {
  q1: CategoryId[];
  q2: string;
  q3: string;
  q4: string;
  q5: string;
};

export type CategoryScore = { id: CategoryId; label: string; score: number };

export type FlatPlan = {
  topics: Topic[];
  categoryScores: CategoryScore[];
  primaryCategory: CategoryId;
  secondaryCategories: CategoryId[];
};

const CATEGORY_LABELS: Record<CategoryId, string> = {
  "1": "Monetary History & Fiat Dynamics",
  "2": '"Honest Money" vs. Today’s System',
  "3": "Bitcoin’s Origins & Ethos",
  "4": "Core Technology & Network Mechanics",
  "5": "Economic Roles & Adoption",
  "6": "Payments, Access & Financial Sovereignty",
  "7": "Human Rights & Social Impact (incl. energy)",
  "8": "Security, Self-Custody & Personal Risk Management",
};

const CATEGORY_IDS: CategoryId[] = ["1", "2", "3", "4", "5", "6", "7", "8"];

const QUESTION_WEIGHTS = {
  q1: 2,
  q2: 1,
  q3: 1,
  q4: 1,
  q5: 1,
} as const satisfies Record<keyof SurveyAnswers, number>;

const CATEGORY_ID_PATTERN = /[1-8]/g;

const parseCategoryIds = (answer: string): CategoryId[] => {
  if (!answer) return [];

  const matches = answer.match(CATEGORY_ID_PATTERN);
  if (!matches) return [];

  const seen = new Set<CategoryId>();
  const results: CategoryId[] = [];

  for (const match of matches) {
    const id = match as CategoryId;
    if (!seen.has(id)) {
      seen.add(id);
      results.push(id);
    }
  }

  return results;
};

const getCategoryOriginalOrderIndex = (
  categoryId: CategoryId,
  topics: Topic[],
): number => {
  let minOrder: number | undefined;

  topics.forEach((topic, index) => {
    if (topic.categoryId !== categoryId) return;

    const order = topic.originalOrder ?? index;
    if (minOrder === undefined || order < minOrder) {
      minOrder = order;
    }
  });

  return minOrder ?? Number.POSITIVE_INFINITY;
};

const normalizeTopicsForSorting = (topics: Topic[]) =>
  topics.map((topic, index) => ({
    topic,
    index,
    order: topic.originalOrder ?? index,
  }));

export const buildPersonalizedFlatPlan = (
  answers: SurveyAnswers,
  topics: Topic[],
): FlatPlan => {
  const scores: Record<CategoryId, number> = {
    "1": 0,
    "2": 0,
    "3": 0,
    "4": 0,
    "5": 0,
    "6": 0,
    "7": 0,
    "8": 0,
  };

  const q1Positions = new Map<CategoryId, number>();

  answers.q1.forEach((categoryId, index) => {
    if (!CATEGORY_IDS.includes(categoryId)) {
      return;
    }

    scores[categoryId] += QUESTION_WEIGHTS.q1;
    q1Positions.set(categoryId, index);
  });

  const applyAnswerScore = (answer: string, weight: number) => {
    const categoryIds = parseCategoryIds(answer);
    if (categoryIds.length === 0) return;

    const share = weight / categoryIds.length;
    categoryIds.forEach((categoryId) => {
      scores[categoryId] += share;
    });
  };

  applyAnswerScore(answers.q2, QUESTION_WEIGHTS.q2);
  applyAnswerScore(answers.q3, QUESTION_WEIGHTS.q3);
  applyAnswerScore(answers.q4, QUESTION_WEIGHTS.q4);
  applyAnswerScore(answers.q5, QUESTION_WEIGHTS.q5);

  const categoryOriginalOrders = new Map<CategoryId, number>();
  CATEGORY_IDS.forEach((categoryId) => {
    categoryOriginalOrders.set(
      categoryId,
      getCategoryOriginalOrderIndex(categoryId, topics),
    );
  });

  const sortedCategoryIds = [...CATEGORY_IDS].sort((a, b) => {
    const scoreDiff = scores[b] - scores[a];
    if (scoreDiff !== 0) return scoreDiff > 0 ? 1 : -1;

    const aQ1 = q1Positions.get(a);
    const bQ1 = q1Positions.get(b);

    if (aQ1 !== undefined && bQ1 !== undefined && aQ1 !== bQ1) {
      return aQ1 - bQ1;
    }

    const aOriginal = categoryOriginalOrders.get(a) ?? Number.POSITIVE_INFINITY;
    const bOriginal = categoryOriginalOrders.get(b) ?? Number.POSITIVE_INFINITY;

    if (aOriginal !== bOriginal) {
      return aOriginal - bOriginal;
    }

    return Number(a) - Number(b);
  });

  const categoryScores: CategoryScore[] = sortedCategoryIds.map((id) => ({
    id,
    label: CATEGORY_LABELS[id],
    score: Number(scores[id].toFixed(2)),
  }));

  const categoryRankMap = new Map<CategoryId, number>();
  sortedCategoryIds.forEach((categoryId, index) => {
    categoryRankMap.set(categoryId, index);
  });

  const sortedTopics = normalizeTopicsForSorting(topics)
    .slice()
    .sort((a, b) => {
      const rankA = categoryRankMap.get(a.topic.categoryId) ?? Number.MAX_SAFE_INTEGER;
      const rankB = categoryRankMap.get(b.topic.categoryId) ?? Number.MAX_SAFE_INTEGER;

      if (rankA !== rankB) return rankA - rankB;

      if (a.order !== b.order) return a.order - b.order;

      return a.index - b.index;
    })
    .map(({ topic }) => topic);

  const [primaryCategory, ...otherCategories] = sortedCategoryIds;

  return {
    topics: sortedTopics,
    categoryScores,
    primaryCategory,
    secondaryCategories: otherCategories,
  };
};

export default buildPersonalizedFlatPlan;
