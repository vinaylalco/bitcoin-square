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
  /**
   * Whether this card is locked behind a purchase.
   * Cards without this flag are assumed to be free.
   */
  locked?: boolean;
}

export interface Topic {
  name: string;
  cards: Card[];
}

export interface LessonPlan {
  id?: string | number;
  title?: string;
  slug?: string;
  description?: string;
  coverImage?: string;
  topics: Topic[];
  locale?: string;
  /** Indicates if the current user has purchased this course */
  purchased?: boolean;
}