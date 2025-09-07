export type ProductImage = {
  id: number;
  url: string;
  alternativeText?: string | null;
};

export type Product = {
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
