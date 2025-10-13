export interface CourseLesson {
  id: string;
  title: string;
  duration: string;
  summary: string[];
}

export interface CourseTopic {
  id: string;
  title: string;
  description: string;
  videoUrl?: string;
  keyPoints: string[];
  lessons: CourseLesson[];
}

export interface CourseModule {
  id: string;
  title: string;
  description: string;
  topics: CourseTopic[];
}

export interface CourseContent {
  id: string;
  title: string;
  tagline: string;
  description: string;
  heroVideo: string;
  estimatedLength: string;
  level: string;
  language: string;
  modules: CourseModule[];
  resources: string[];
}

export const courseContent: CourseContent = {
  id: "full-bitcoin-course",
  title: "Bitcoin Full Course",
  tagline: "Master Bitcoin from first principles",
  description:
    "A friendly, modern curriculum for anyone who wants to understand Bitcoin, learn how to use it safely, and share it with their community.",
  heroVideo: "https://www.youtube.com/embed/ODi9qkTnZkA",
  estimatedLength: "6 weeks",
  level: "Beginner friendly",
  language: "English & Spanish",
  resources: [
    "Printable discussion guides",
    "Slide decks for every topic",
    "Step-by-step wallet walkthroughs",
    "Quizzes and reflection prompts",
  ],
  modules: [
    {
      id: "module-1",
      title: "Foundations of Money",
      description:
        "Explore what money is, how it evolved, and why Bitcoin represents a breakthrough in human coordination.",
      topics: [
        {
          id: "topic-1",
          title: "What is Money?",
          description:
            "Trace the history of money from barter to digital ledgers and identify the properties that make sound money useful.",
          videoUrl: "https://www.youtube.com/watch?v=t7IP1kjLQ6g",
          keyPoints: [
            "Barter and the double coincidence of wants",
            "Sound money properties and why they matter",
            "How communities agree on a shared unit of account",
          ],
          lessons: [
            {
              id: "lesson-1",
              title: "Money as a Technology",
              duration: "12 min",
              summary: [
                "Money solves coordination problems by recording who owes what to whom.",
                "Commodities became money when they were widely accepted as a medium of exchange.",
              ],
            },
            {
              id: "lesson-2",
              title: "Emergence of Fiat Systems",
              duration: "10 min",
              summary: [
                "Governments standardized money issuance and created central banks.",
                "Counterparty risk and inflation are trade-offs of managed monetary systems.",
              ],
            },
          ],
        },
        {
          id: "topic-2",
          title: "Why Bitcoin?",
          description:
            "Understand the problems Bitcoin was designed to solve and why decentralization makes it resilient.",
          videoUrl: "https://www.youtube.com/watch?v=41JCpzvnn_0",
          keyPoints: [
            "The Bitcoin whitepaper in plain language",
            "Proof-of-work as a coordination mechanism",
            "The importance of open-source monetary rules",
          ],
          lessons: [
            {
              id: "lesson-3",
              title: "Hard Money in the Digital Age",
              duration: "14 min",
              summary: [
                "Bitcoin combines scarcity with portability and divisibility.",
                "Mining and difficulty adjustments secure the network against attackers.",
              ],
            },
            {
              id: "lesson-4",
              title: "Global Impact",
              duration: "9 min",
              summary: [
                "Communities facing inflation are adopting Bitcoin for savings.",
                "Remittances become faster and cheaper with Lightning payments.",
              ],
            },
          ],
        },
      ],
    },
    {
      id: "module-2",
      title: "Using Bitcoin Safely",
      description:
        "Learn practical wallet skills, security best practices, and how to teach others to self-custody.",
      topics: [
        {
          id: "topic-3",
          title: "Bitcoin Wallets",
          description:
            "Compare custodial, mobile, and hardware wallets and configure the right tools for your community.",
          videoUrl: "https://www.youtube.com/watch?v=pSV0HACj9eQ",
          keyPoints: [
            "Hot vs. cold storage trade-offs",
            "Seed phrases and secure backups",
            "Practicing a recovery drill",
          ],
          lessons: [
            {
              id: "lesson-5",
              title: "Wallet Types",
              duration: "11 min",
              summary: [
                "Custodial wallets are easy to start with but require trust in a third party.",
                "Hardware wallets isolate keys from internet-connected devices for better security.",
              ],
            },
            {
              id: "lesson-6",
              title: "Setting Up a Mobile Wallet",
              duration: "15 min",
              summary: [
                "Install a beginner-friendly wallet and practice sending and receiving sats.",
                "Review common pitfalls like screenshots of seed phrases and SIM-swap attacks.",
              ],
            },
          ],
        },
        {
          id: "topic-4",
          title: "Security Culture",
          description:
            "Develop a layered security plan that balances ease-of-use with robust protection for savings.",
          videoUrl: "https://www.youtube.com/watch?v=YAzFvFR7i5g",
          keyPoints: [
            "Threat modeling for families and small businesses",
            "Multisig for community custody",
            "Teaching good opsec habits",
          ],
          lessons: [
            {
              id: "lesson-7",
              title: "Threat Modeling Basics",
              duration: "8 min",
              summary: [
                "Identify what assets need protection and from whom.",
                "Create simple playbooks for traveling with Bitcoin.",
              ],
            },
            {
              id: "lesson-8",
              title: "Running a Multisig",
              duration: "13 min",
              summary: [
                "Multisignature wallets distribute trust across multiple key holders.",
                "Coordinators like Sparrow Wallet simplify multisig setup and maintenance.",
              ],
            },
          ],
        },
      ],
    },
    {
      id: "module-3",
      title: "Bitcoin in Community",
      description:
        "Share Bitcoin knowledge with others, design workshops, and track learning progress over time.",
      topics: [
        {
          id: "topic-5",
          title: "Teaching Bitcoin",
          description:
            "Design engaging meetups and classroom sessions that balance story-telling with hands-on practice.",
          videoUrl: "https://www.youtube.com/watch?v=SBQ9Kn7Z07E",
          keyPoints: [
            "Adult learning frameworks",
            "Facilitation tips for small groups",
            "Measuring understanding with reflection questions",
          ],
          lessons: [
            {
              id: "lesson-9",
              title: "Workshop Blueprint",
              duration: "10 min",
              summary: [
                "Start with learner goals and design backwards from outcomes.",
                "Use story prompts and open questions to unlock peer learning.",
              ],
            },
            {
              id: "lesson-10",
              title: "Coaching in the Moment",
              duration: "9 min",
              summary: [
                "Active listening reveals misconceptions before they spread.",
                "Celebrate progress with micro-challenges and immediate feedback.",
              ],
            },
          ],
        },
        {
          id: "topic-6",
          title: "Local Circular Economies",
          description:
            "Plan grassroots experiments that help neighbours earn, save, and spend bitcoin together.",
          videoUrl: "https://www.youtube.com/watch?v=bZ9L3va9XzQ",
          keyPoints: [
            "Lightning payment flows for small merchants",
            "Reward programs that encourage repeat participation",
            "Documenting progress for future cohorts",
          ],
          lessons: [
            {
              id: "lesson-11",
              title: "Mapping a Circular Economy",
              duration: "12 min",
              summary: [
                "Map local partners, pain points, and opportunities for bitcoin-powered commerce.",
                "Establish community agreements around pricing and volatility.",
              ],
            },
            {
              id: "lesson-12",
              title: "Measuring Success",
              duration: "7 min",
              summary: [
                "Track adoption using simple KPIs that reflect community goals.",
                "Share stories and data to invite new supporters and partners.",
              ],
            },
          ],
        },
      ],
    },
  ],
};
