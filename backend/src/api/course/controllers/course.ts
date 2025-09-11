import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::course.course' as any, ({ strapi }) => ({
  async findOne(ctx) {
    const { id } = ctx.params;
    const user = ctx.state.user;

    const course = await strapi.entityService.findOne('api::course.course' as any, id, {
      populate: { modules: true },
    });

    let hasAccess = false;
    if (user) {
      const grant = await strapi.db
        .query('api::access-grant.access-grant')
        .findOne({ where: { user: user.id, course: id } });
      hasAccess = !!grant;
    }

    course.modules = (course.modules || [])
      .filter((module: any) => hasAccess || module.isFree)
      .map((module: any) => ({ ...module, locked: !hasAccess && !module.isFree }));

    return this.transformResponse(course);
  },
}));
