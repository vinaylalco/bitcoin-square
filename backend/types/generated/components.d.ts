import type { Schema, Struct } from '@strapi/strapi';

export interface HomePageComponentHomePageSection
  extends Struct.ComponentSchema {
  collectionName: 'components_home_page_component_home_page_sections';
  info: {
    displayName: 'HomePageSection';
  };
  attributes: {
    buttonlabel: Schema.Attribute.String;
    buttonlink: Schema.Attribute.String;
    heading: Schema.Attribute.String;
    image: Schema.Attribute.Media<'images' | 'files' | 'videos' | 'audios'>;
    subtitle: Schema.Attribute.String;
  };
}

declare module '@strapi/strapi' {
  export module Public {
    export interface ComponentSchemas {
      'home-page-component.home-page-section': HomePageComponentHomePageSection;
    }
  }
}
