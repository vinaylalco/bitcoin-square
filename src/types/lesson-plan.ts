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
  youtube_video_link?: string;
  youtube_video_link_en?: string;
  youtube_video_link_es?: string;
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
  isVideoLesson?: boolean;
  videoUrl?: string;
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
  price?: number;
  stripeProductId?: string;
  stripePriceId?: string;
  isPaid?: boolean;
}
