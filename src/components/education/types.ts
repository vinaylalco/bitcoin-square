export type QuizType = "multiple_choice" | "reflection" | "scenario";

export type Quiz = {
  question: string;
  type: QuizType;
  options: string[];        // empty array allowed for reflection
  correct_answer: string;
  style_note?: string;
};

export type LessonFromJson = {
  id: string;               // e.g. "1-1"
  title: string;
  duration_min: number;
  content: string;
  objectives: string[];
  quiz: Quiz;
};

export type TopicFile = {
  topics: {
    name: string;           // topic name
    cards: LessonFromJson[]; // 3 cards per topic
  }[];
};

// Flattened item Card UI consumes (adds topicName to each lesson)
export type LessonCardData = LessonFromJson & {
  topicName: string;
};
