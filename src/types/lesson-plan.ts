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
  style_note?: string;
}

export interface Topic {
  name: string;
  cards: Card[];
}

export interface LessonPlan {
  title?: string;
  topics: Topic[];
  locale?: string;
}
