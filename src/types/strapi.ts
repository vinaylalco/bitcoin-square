export interface StrapiImage {
  url: string;
  alternativeText?: string;
  width?: number;
  height?: number;
}

export interface Language {
  id: number;
  attributes: {
    name: string;
    code: string;
    description?: string;
    icon?: { data: { attributes: StrapiImage } } | null;
  };
}

export interface Lesson {
  id: number;
  attributes: {
    title: string;
    slug: string;
    summary?: string;
    content?: string;
    level?: 'beginner' | 'intermediate' | 'advanced';
    duration?: number;
    language?: { data: Language };
    coverImage?: { data: { attributes: StrapiImage } } | null;
    tags?: string[];
  };
}

export interface Home {
  id: number;
  attributes: {
    heroTitle: string;
    heroSubtitle?: string;
    featuredLessons?: { data: Lesson[] };
  };
}
