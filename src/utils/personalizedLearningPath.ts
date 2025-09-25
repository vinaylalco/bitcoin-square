import type { LessonCard } from "../types/lesson-plan";
import type { FlatPlan, Topic as PlanTopic } from "./buildPersonalizedFlatPlan";
import {
  buildResourcePriority,
  getCardLearningPriority,
  getCardResourceTypes,
  type LearningResourceType,
  type LearningStyleProfile,
} from "./learningStyle";

export type PersonalizedResourceStep = {
  type: LearningResourceType;
  id: string;
  cardId: string;
  topicId: string;
  topicTitle?: string;
};

export type PersonalizedModulePath = {
  module: string;
  title: string;
  path: PersonalizedResourceStep[];
};

const reorderTopicCardsByLearningStyle = (
  cards: LessonCard[],
  profile: LearningStyleProfile,
): LessonCard[] => {
  const priorities = buildResourcePriority(profile);

  return cards
    .map((card, index) => ({
      card,
      index,
      priority: getCardLearningPriority(card, priorities),
    }))
    .sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return a.index - b.index;
    })
    .map(({ card }) => card);
};

const createResourceSteps = (
  cards: LessonCard[],
  topicId: string,
  topicTitle: string | undefined,
  priorities: LearningResourceType[],
): PersonalizedResourceStep[] => {
  const fallbackPriority = priorities.length;

  return cards
    .flatMap((card, cardIndex) => {
      const resourceTypes = getCardResourceTypes(card);
      return resourceTypes.map((type, resourceIndex) => {
        const priorityIndex = priorities.indexOf(type);
        const priority =
          priorityIndex === -1 ? fallbackPriority : priorityIndex;

        const id =
          type === "video"
            ? card.id
            : `${card.id}-${type}${resourceIndex > 0 ? `-${resourceIndex}` : ""}`;

        return {
          step: {
            type,
            id,
            cardId: card.id,
            topicId,
            topicTitle,
          } satisfies PersonalizedResourceStep,
          priority,
          sequence: cardIndex * 10 + resourceIndex,
        };
      });
    })
    .sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return a.sequence - b.sequence;
    })
    .map(({ step }) => step);
};

type BuildPathParams = {
  plan: FlatPlan;
  allTopics: PlanTopic[];
  cardsByTopic: Map<string, LessonCard[]>;
  defaultCards: LessonCard[];
};

export const buildPersonalizedLessonPath = ({
  plan,
  allTopics,
  cardsByTopic,
  defaultCards,
}: BuildPathParams): {
  orderedCards: LessonCard[];
  modulePaths: PersonalizedModulePath[];
} => {
  const topicLookup = new Map<string, PlanTopic>();
  allTopics.forEach((topic) => {
    topicLookup.set(topic.id, topic);
  });

  const modulePaths = new Map<string, PersonalizedModulePath>();
  const orderedCards: LessonCard[] = [];
  const seenTopics = new Set<string>();
  const resourcePriorities = buildResourcePriority(plan.learningProfile);

  const registerTopic = (topicId: string) => {
    if (seenTopics.has(topicId)) return;
    seenTopics.add(topicId);

    const topicMeta = topicLookup.get(topicId);
    const topicCards = cardsByTopic.get(topicId);
    if (!topicMeta || !topicCards || topicCards.length === 0) {
      return;
    }

    const sortedCards = reorderTopicCardsByLearningStyle(
      topicCards,
      plan.learningProfile,
    );

    orderedCards.push(...sortedCards);

    const steps = createResourceSteps(
      sortedCards,
      topicId,
      topicMeta.title,
      resourcePriorities,
    );

    const moduleId = topicMeta.moduleId ?? "module";
    const moduleTitle = topicMeta.moduleTitle ?? moduleId;
    const moduleEntry = modulePaths.get(moduleId) ?? {
      module: moduleId,
      title: moduleTitle,
      path: [],
    };

    moduleEntry.path.push(...steps);
    modulePaths.set(moduleId, moduleEntry);
  };

  plan.topics.forEach((topic) => {
    registerTopic(topic.id);
  });

  allTopics.forEach((topic) => {
    registerTopic(topic.id);
  });

  if (orderedCards.length === 0) {
    return { orderedCards: defaultCards, modulePaths: [] };
  }

  return {
    orderedCards,
    modulePaths: Array.from(modulePaths.values()),
  };
};

