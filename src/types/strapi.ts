export type StrapiImage = {
  data: {
    id: number;
    attributes: {
      url: string;
      alternativeText?: string;
    };
  } | null;
};

export type CTA = {
  label: string;
  href: string;
};

export type HomeSection = {
  id: number;
  title?: string;
  body?: string;
  image?: StrapiImage;
  cta?: CTA;
  shape?: 'round' | 'square' | 'blob';
};

export type Language = {
  id: number;
  attributes: {
    code: string;
    name: string;
  };
};

export type Lesson = {
  id: number;
  attributes: {
    slug: string;
    title: string;
    summary?: string;
    content?: string;
    level?: string;
    language?: {
      data: Language | null;
    };
  };
};

export type Home = {
  heroTitle: string;
  heroSubtitle?: string;
  sections: HomeSection[];
  featuredLessons?: {
    data: Lesson[];
  };
};