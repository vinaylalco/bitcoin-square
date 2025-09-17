export interface Quiz {
  question: string;
  type: string;
  options?: string[];
  correct_answer?: string;
  style_note?: string;
}

export interface Card {
  id: string;
  title: string;
  duration_min?: number;
  content?: string;
  objectives?: string[];
  quiz?: Quiz;
  youtube?: string;
  style_note?: string;
}

export interface LessonSummaryItem {
  cardId: string;
  title: string;
  topicName: string;
}

export interface LessonCard extends Card {
  topicId: string;
  topicName: string;
  moduleId: string;
  moduleName: string;
  sourceCardId?: string;
  isLastInTopic?: boolean;
  isLastInModule?: boolean;
  isReview?: boolean;
  isSummary?: boolean;
  summaryItems?: LessonSummaryItem[];
}

export interface Topic {
  id: string;
  name: string;
  cards: Card[];
}

export interface Module {
  id: string;
  name: string;
  topics: Topic[];
}

export interface LessonPlan {
  id?: string | number;
  title?: string;
  slug?: string;
  description?: string;
  coverImage?: string;
  modules: Module[];
  locale?: string;
}