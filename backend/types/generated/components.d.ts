import type { Schema, Struct } from '@strapi/strapi';

export interface SharedCtaLink extends Struct.ComponentSchema {
  collectionName: 'components_shared_cta_links';
  info: {
    displayName: 'CTALink';
  };
  attributes: {};
}

export interface SharedCtaSection extends Struct.ComponentSchema {
  collectionName: 'components_shared_cta_sections';
  info: {
    displayName: 'CTASection';
  };
  attributes: {
    ButtonLabel: Schema.Attribute.String;
    ButtonUrl: Schema.Attribute.String;
    H2: Schema.Attribute.String;
    SectionImage: Schema.Attribute.Media<
      'images' | 'files' | 'videos' | 'audios'
    >;
    SectionSubHeading: Schema.Attribute.String;
  };
}

declare module '@strapi/strapi' {
  export module Public {
    export interface ComponentSchemas {
      'shared.cta-link': SharedCtaLink;
      'shared.cta-section': SharedCtaSection;
    }
  }
}
