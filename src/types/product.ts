export type Product = {
  id: number;
  attributes: {
    ProductName: string;
    Description: string;
    Price: string;
    ButtonLabel: string;
    ButtonLink: string;
    ProductImages: {
      data: Array<{
        attributes: {
          url: string;
          alternativeText?: string;
        };
      }>;
    };
    createdAt: string;
    updatedAt: string;
    publishedAt: string;
  };
};
