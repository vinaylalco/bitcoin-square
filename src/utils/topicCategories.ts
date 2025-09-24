import type { CategoryId } from "./buildPersonalizedFlatPlan";

const TOPIC_CATEGORY_MAP: Record<string, CategoryId> = {
  "M1-T01": "1", // 1.1 History of Money
  "M1-T02": "1", // 1.2 Properties of Money
  "M1-T03": "1", // 1.3 Gold as Money and Its Fall
  "M1-T04": "1", // 1.4 The Bretton Woods Agreement
  "M1-T05": "1", // 1.5 Inflation: Causes and Consequences
  "M1-T06": "2", // 1.6 How the Banking System Works
  "M1-T07": "2", // 1.7 Why We Need Honest Money
  "M1-T08": "2", // 1.8 The Psychology of Money
  "M1-T09": "7", // 1.9 The “Corralito” in Argentina (2001)
  "M1-T10": "7", // 1.10 The Great Gold Confiscation (1933)
  "M1-T11": "1", // 1.11 The Tulip Bubble (1637)
  "M1-T12": "1", // 1.12 Practical Exercise: Inflation & Loss of Purchasing Power
  "M2-T01": "3", // 2.1 What is Bitcoin and Why Does it Exist?
  "M2-T02": "3", // 2.2 Satoshi Nakamoto and the Whitepaper
  "M2-T03": "2", // 2.3 Bitcoin as Honest Money
  "M2-T04": "2", // 2.4 Bitcoin vs Gold, Real Estate, and Art
  "M2-T05": "2", // 2.5 Bitcoin vs Altcoins
  "M2-T06": "3", // 2.6 What is Decentralization?
  "M2-T07": "4", // 2.7 The Bitcoin Halving: Why It Matters
  "M2-T08": "5", // 2.8 Bitcoin as a Store of Value
  "M2-T09": "5", // 2.9 Bitcoin vs ETFs
  "M2-T10": "5", // 2.10 MicroStrategy and Its Bitcoin Bet
  "M2-T11": "3", // 2.11 The Cypherpunk Philosophy
  "M2-T12": "3", // 2.12 The Cypherpunk Manifesto (1993)
  "M2-T13": "7", // 2.13 Bitcoin as Peaceful Resistance
  "M2-T14": "7", // 2.14 Global Financial Inclusion
  "M2-T15": "2", // 2.15 Bitcoin vs Failed Projects
  "M2-T16": "5", // 2.16 Bitcoin as Global Money
  "M3-T01": "8", // 3.1 Not Your Keys, Not Your Bitcoin
  "M3-T02": "6", // 3.2 What is a Wallet?
  "M3-T03": "8", // 3.3 Hardware Wallets (Jade, SeedSigner, Passport…)
  "M3-T04": "6", // 3.4 Software Wallets (Samurai, Sparrow, Electrum)
  "M3-T05": "6", // 3.5 DIY Wallets
  "M3-T06": "8", // 3.6 Multisig Wallets
  "M3-T07": "8", // 3.7 How to Store Your 12 or 24 Words
  "M3-T08": "8", // 3.8 Backup Methods
  "M3-T09": "8", // 3.9 Bitcoin Inheritance Strategies
  "M3-T10": "8", // 3.10 Bitcoin Scams
  "M3-T11": "8", // 3.11 Basic Digital Security
  "M3-T12": "8", // 3.12 Advanced Security
  "M3-T13": "8", // 3.13 Basic Privacy
  "M3-T14": "8", // 3.14 CoinJoin, UTXOs, and CoinControl
  "M3-T15": "8", // 3.15 Risks of Custodians and KYC
  "M3-T16": "6", // 3.16 Buying Bitcoin with KYC: Risks
  "M3-T17": "5", // 3.17 DCA Investment Strategy
  "M3-T18": "5", // 3.18 Why Avoid Leverage
  "M3-T19": "5", // 3.19 Stablecoins vs Bitcoin
  "M3-T20": "7", // 3.20 Bitcoin in Countries in Crisis
  "M3-T21": "8", // 3.21 What to Do if Your Country Bans Bitcoin
  "M4-T01": "4", // 4.1 What is a Node?
  "M4-T02": "4", // 4.2 How a Full Node Works
  "M4-T03": "6", // 4.3 What You Need to Run a Node
  "M4-T04": "6", // 4.4 Lightning Network Explained Simply
  "M4-T05": "6", // 4.5 Bitcoin Offline: Satellite and Radio
  "M4-T06": "4", // 4.6 Bitcoin Mining: What It Is and How It Works
  "M4-T07": "4", // 4.7 Types of Bitcoin Mining
  "M4-T08": "7", // 4.8 Renewable Energy in Mining
  "M4-T09": "4", // 4.9 Proof of Work and Network Security
  "M4-T10": "4", // 4.10 Proof of Work vs Proof of Stake
  "M4-T11": "7", // 4.11 China Bans Mining (2021)
  "M4-T12": "5", // 4.12 El Salvador Adopts Bitcoin
  "M4-T13": "5", // 4.13 What Will Happen When the 21 Million Bitcoins Are Mined?
  "M4-T14": "8", // 4.14 Possible Attacks and Bitcoin’s Defense
  "M4-T15": "7", // 4.15 Bitcoin and the Energy Transition
  "M4-T16": "5", // 4.16 Bitcoin and the Global Remote Work Economy
};

export function getTopicCategory(topicId: string): CategoryId {
  return TOPIC_CATEGORY_MAP[topicId] ?? "5";
}

export function isTopicCategoryKnown(topicId: string): boolean {
  return Object.prototype.hasOwnProperty.call(TOPIC_CATEGORY_MAP, topicId);
}

export const topicCategoryMap = TOPIC_CATEGORY_MAP;
