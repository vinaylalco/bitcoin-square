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

export type Home = {
  hero?: {
    title: string;
    subtitle?: string;
  };
  sections: HomeSection[];
};