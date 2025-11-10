export default {
  routes: [
    {
      method: "GET",
      path: "/lessonplans/count",
      handler: "lessonplan.count",
      config: {
        auth: {
          scope: ["api::lessonplan.lessonplan.find"],
        },
      },
    },
  ],
};
