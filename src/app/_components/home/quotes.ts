export interface Quote {
  text: string;
  author: string;
  category: QuoteCategory;
}

export type QuoteCategory =
  | "productivity"
  | "mindfulness"
  | "self-compassion"
  | "focus"
  | "motivation"
  | "wisdom"
  | "energy"
  | "resilience";

export const CATEGORY_LABELS: Record<QuoteCategory, string> = {
  productivity: "Productivity",
  mindfulness: "Mindfulness",
  "self-compassion": "Self-Compassion",
  focus: "Focus & Intentionality",
  motivation: "Motivation",
  wisdom: "Wisdom",
  energy: "Energy & Renewal",
  resilience: "Resilience",
};

export const CURATED_QUOTES: Quote[] = [
  // Productivity
  {
    text: "The secret of getting ahead is getting started.",
    author: "Mark Twain",
    category: "productivity",
  },
  {
    text: "Small steps every day lead to big changes.",
    author: "Unknown",
    category: "productivity",
  },
  {
    text: "Progress, not perfection.",
    author: "Unknown",
    category: "productivity",
  },
  {
    text: "Start where you are. Use what you have. Do what you can.",
    author: "Arthur Ashe",
    category: "productivity",
  },
  {
    text: "One day or day one. You decide.",
    author: "Unknown",
    category: "productivity",
  },
  {
    text: "What you do today can improve all your tomorrows.",
    author: "Ralph Marston",
    category: "productivity",
  },
  {
    text: "The best time to plant a tree was 20 years ago. The second best time is now.",
    author: "Chinese Proverb",
    category: "productivity",
  },
  {
    text: "Don't count the days, make the days count.",
    author: "Muhammad Ali",
    category: "productivity",
  },

  // Mindfulness
  {
    text: "The present moment is the only moment available to us, and it is the door to all moments.",
    author: "Thich Nhat Hanh",
    category: "mindfulness",
  },
  {
    text: "Almost everything will work again if you unplug it for a few minutes, including you.",
    author: "Anne Lamott",
    category: "mindfulness",
  },
  {
    text: "Be where you are, not where you think you should be.",
    author: "Unknown",
    category: "mindfulness",
  },
  {
    text: "Today is a good day to have a good day.",
    author: "Unknown",
    category: "mindfulness",
  },
  {
    text: "Breathe. You're doing better than you think.",
    author: "Unknown",
    category: "mindfulness",
  },

  // Self-compassion
  {
    text: "You don't have to be perfect to be worthy.",
    author: "Unknown",
    category: "self-compassion",
  },
  {
    text: "Be gentle with yourself. You're doing the best you can.",
    author: "Unknown",
    category: "self-compassion",
  },
  {
    text: "Rest is not a reward. Rest is a requirement.",
    author: "Unknown",
    category: "self-compassion",
  },
  {
    text: "You are allowed to be both a masterpiece and a work in progress.",
    author: "Sophia Bush",
    category: "self-compassion",
  },
  {
    text: "Taking care of yourself is productive.",
    author: "Unknown",
    category: "self-compassion",
  },

  // Focus
  {
    text: "Focus on being productive instead of busy.",
    author: "Tim Ferriss",
    category: "focus",
  },
  {
    text: "The key is not to prioritize what's on your schedule, but to schedule your priorities.",
    author: "Stephen Covey",
    category: "focus",
  },
  {
    text: "Simplicity is the ultimate sophistication.",
    author: "Leonardo da Vinci",
    category: "focus",
  },
  {
    text: "Do less, but do it better.",
    author: "Unknown",
    category: "focus",
  },
  {
    text: "What would this look like if it were easy?",
    author: "Tim Ferriss",
    category: "focus",
  },
  {
    text: "Clarity comes from engagement, not thought.",
    author: "Marie Forleo",
    category: "focus",
  },

  // Motivation
  {
    text: "The way to get started is to quit talking and begin doing.",
    author: "Walt Disney",
    category: "motivation",
  },
  {
    text: "Done is better than perfect.",
    author: "Sheryl Sandberg",
    category: "motivation",
  },
  {
    text: "Action is the foundational key to all success.",
    author: "Pablo Picasso",
    category: "motivation",
  },
  {
    text: "A year from now you'll wish you had started today.",
    author: "Karen Lamb",
    category: "motivation",
  },

  // Wisdom
  {
    text: "The only limit is your mind.",
    author: "Unknown",
    category: "wisdom",
  },
  {
    text: "What we think, we become.",
    author: "Buddha",
    category: "wisdom",
  },
  {
    text: "Every expert was once a beginner.",
    author: "Helen Hayes",
    category: "wisdom",
  },
  {
    text: "The journey of a thousand miles begins with a single step.",
    author: "Lao Tzu",
    category: "wisdom",
  },
  {
    text: "It does not matter how slowly you go as long as you do not stop.",
    author: "Confucius",
    category: "wisdom",
  },

  // Energy
  {
    text: "Energy flows where attention goes.",
    author: "Tony Robbins",
    category: "energy",
  },
  {
    text: "Take care of your body. It's the only place you have to live.",
    author: "Jim Rohn",
    category: "energy",
  },
  {
    text: "The morning is full of possibility.",
    author: "Unknown",
    category: "energy",
  },
  {
    text: "Every morning brings new potential.",
    author: "Unknown",
    category: "energy",
  },

  // Resilience
  {
    text: "Live intentionally, not habitually.",
    author: "Unknown",
    category: "resilience",
  },
  {
    text: "Your daily habits shape your future self.",
    author: "Unknown",
    category: "resilience",
  },
  {
    text: "Make each day your masterpiece.",
    author: "John Wooden",
    category: "resilience",
  },
  {
    text: "Success is the sum of small efforts repeated day in and day out.",
    author: "Robert Collier",
    category: "resilience",
  },
  {
    text: "What gets measured gets managed.",
    author: "Peter Drucker",
    category: "resilience",
  },
  {
    text: "You are stronger than you think.",
    author: "Unknown",
    category: "resilience",
  },
  {
    text: "Every setback is a setup for a comeback.",
    author: "Unknown",
    category: "resilience",
  },
  {
    text: "Fall seven times, stand up eight.",
    author: "Japanese Proverb",
    category: "resilience",
  },
  {
    text: "Difficult roads often lead to beautiful destinations.",
    author: "Unknown",
    category: "resilience",
  },
];

/**
 * Get the quote of the day based on the current day of year.
 * This ensures consistent quotes throughout the day while rotating daily.
 */
export function getQuoteOfTheDay(): Quote {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - startOfYear.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  const dayOfYear = Math.floor(diff / oneDay);

  const index = dayOfYear % CURATED_QUOTES.length;
  return CURATED_QUOTES[index]!;
}

/**
 * Get quotes grouped by category
 */
export function getQuotesByCategory(): Record<QuoteCategory, Quote[]> {
  const grouped: Record<QuoteCategory, Quote[]> = {
    productivity: [],
    mindfulness: [],
    "self-compassion": [],
    focus: [],
    motivation: [],
    wisdom: [],
    energy: [],
    resilience: [],
  };

  for (const quote of CURATED_QUOTES) {
    grouped[quote.category].push(quote);
  }

  return grouped;
}
