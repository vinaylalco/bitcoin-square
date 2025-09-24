import { describe, expect, it } from "vitest";

import {
  buildPersonalizedFlatPlan,
  type CategoryId,
  type SurveyAnswers,
  type Topic,
} from "../src/utils/buildPersonalizedFlatPlan";

describe("buildPersonalizedFlatPlan", () => {
  const createTopic = (
    id: string,
    title: string,
    categoryId: CategoryId,
    originalOrder: number,
  ): Topic => ({ id, title, categoryId, originalOrder });

  it("ranks categories and flattens topics according to the provided example", () => {
    const topics: Topic[] = [
      createTopic("t1", "Topic 1", "1", 1),
      createTopic("t2", "Topic 2", "2", 2),
      createTopic("t3", "Topic 3", "3", 3),
      createTopic("t4", "Topic 4", "4", 4),
      createTopic("t5", "Topic 5", "5", 5),
      createTopic("t6", "Topic 6", "6", 6),
      createTopic("t7", "Topic 7", "7", 7),
      createTopic("t8", "Topic 8", "8", 8),
    ];

    const answers: SurveyAnswers = {
      q1: ["8", "4", "5"],
      q2: "5/6",
      q3: "4",
      q4: "8",
      q5: "8",
    };

    const plan = buildPersonalizedFlatPlan(answers, topics);

    expect(plan.primaryCategory).toBe("8");
    expect(plan.secondaryCategories.slice(0, 3)).toEqual(["4", "5", "6"]);

    const categoryScoreById = Object.fromEntries(
      plan.categoryScores.map(({ id, score }) => [id, score]),
    );

    expect(categoryScoreById["8"]).toBe(4);
    expect(categoryScoreById["4"]).toBe(3);
    expect(categoryScoreById["5"]).toBe(2.5);
    expect(categoryScoreById["6"]).toBe(0.5);

    expect(plan.topics.map((topic) => topic.id)).toEqual([
      "t8",
      "t4",
      "t5",
      "t6",
      "t1",
      "t2",
      "t3",
      "t7",
    ]);
  });

  it("splits combined answers evenly and keeps topic order stable within categories", () => {
    const topics: Topic[] = [
      createTopic("t1", "Topic 1", "1", 5),
      createTopic("t2", "Topic 2", "2", 2),
      createTopic("t3", "Topic 3", "1", 1),
      createTopic("t4", "Topic 4", "2", 4),
      createTopic("t5", "Topic 5", "3", 3),
    ];

    const answers: SurveyAnswers = {
      q1: ["1", "2", "3"],
      q2: "1/2",
      q3: "1",
      q4: "2",
      q5: "3",
    };

    const plan = buildPersonalizedFlatPlan(answers, topics);

    const categoryScoreById = Object.fromEntries(
      plan.categoryScores.map(({ id, score }) => [id, score]),
    );

    expect(categoryScoreById["1"]).toBe(3.5);
    expect(categoryScoreById["2"]).toBe(3.5);

    expect(plan.primaryCategory).toBe("1");
    expect(plan.secondaryCategories[0]).toBe("2");

    expect(plan.topics.map((topic) => topic.id)).toEqual([
      "t3",
      "t1",
      "t2",
      "t4",
      "t5",
    ]);
  });
});
