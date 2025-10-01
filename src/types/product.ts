export type ProductImage = {
  id: number;
  url: string;
  alternativeText?: string | null;
};

export type ProductBase = {
  id: number;
  documentId: string;
  ProductName: string;
  Description: string;
  Price: string;
  ButtonLabel: string;
  ButtonLink: string;
  ProductImages: ProductImage[];
  createdAt: string;
  updatedAt: string;
  publishedAt: string;
};

export type ProductLocalization = Partial<ProductBase> & {
  locale?: string | null;
  ProductImages?: ProductImage[];
};

export type Product = ProductBase & {
  locale?: string | null;
  localizations?: ProductLocalization[];
};
