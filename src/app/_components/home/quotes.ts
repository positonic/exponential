export interface Quote {
  text: string;
  author: string;
}

export const CURATED_QUOTES: Quote[] = [
  // Gentle productivity
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { text: "Small steps every day lead to big changes.", author: "Unknown" },
  { text: "Progress, not perfection.", author: "Unknown" },
  { text: "Start where you are. Use what you have. Do what you can.", author: "Arthur Ashe" },
  { text: "One day or day one. You decide.", author: "Unknown" },
  { text: "What you do today can improve all your tomorrows.", author: "Ralph Marston" },
  { text: "The best time to plant a tree was 20 years ago. The second best time is now.", author: "Chinese Proverb" },
  { text: "Don't count the days, make the days count.", author: "Muhammad Ali" },

  // Mindfulness & presence
  { text: "The present moment is the only moment available to us, and it is the door to all moments.", author: "Thich Nhat Hanh" },
  { text: "Almost everything will work again if you unplug it for a few minutes, including you.", author: "Anne Lamott" },
  { text: "Be where you are, not where you think you should be.", author: "Unknown" },
  { text: "Today is a good day to have a good day.", author: "Unknown" },
  { text: "Breathe. You're doing better than you think.", author: "Unknown" },

  // Self-compassion
  { text: "You don't have to be perfect to be worthy.", author: "Unknown" },
  { text: "Be gentle with yourself. You're doing the best you can.", author: "Unknown" },
  { text: "Rest is not a reward. Rest is a requirement.", author: "Unknown" },
  { text: "You are allowed to be both a masterpiece and a work in progress.", author: "Sophia Bush" },
  { text: "Taking care of yourself is productive.", author: "Unknown" },

  // Focus & intentionality
  { text: "Focus on being productive instead of busy.", author: "Tim Ferriss" },
  { text: "The key is not to prioritize what's on your schedule, but to schedule your priorities.", author: "Stephen Covey" },
  { text: "Simplicity is the ultimate sophistication.", author: "Leonardo da Vinci" },
  { text: "Do less, but do it better.", author: "Unknown" },
  { text: "What would this look like if it were easy?", author: "Tim Ferriss" },
  { text: "Clarity comes from engagement, not thought.", author: "Marie Forleo" },

  // Motivation & momentum
  { text: "The way to get started is to quit talking and begin doing.", author: "Walt Disney" },
  { text: "You don't have to see the whole staircase, just take the first step.", author: "Martin Luther King Jr." },
  { text: "Done is better than perfect.", author: "Sheryl Sandberg" },
  { text: "Action is the foundational key to all success.", author: "Pablo Picasso" },
  { text: "A year from now you'll wish you had started today.", author: "Karen Lamb" },

  // Wisdom & perspective
  { text: "The only limit is your mind.", author: "Unknown" },
  { text: "What we think, we become.", author: "Buddha" },
  { text: "Every expert was once a beginner.", author: "Helen Hayes" },
  { text: "The journey of a thousand miles begins with a single step.", author: "Lao Tzu" },
  { text: "It does not matter how slowly you go as long as you do not stop.", author: "Confucius" },

  // Energy & renewal
  { text: "Energy flows where attention goes.", author: "Tony Robbins" },
  { text: "Take care of your body. It's the only place you have to live.", author: "Jim Rohn" },
  { text: "The morning is full of possibility.", author: "Unknown" },
  { text: "Every morning brings new potential.", author: "Unknown" },

  // Intention & purpose
  { text: "Live intentionally, not habitually.", author: "Unknown" },
  { text: "Your daily habits shape your future self.", author: "Unknown" },
  { text: "Make each day your masterpiece.", author: "John Wooden" },
  { text: "Success is the sum of small efforts repeated day in and day out.", author: "Robert Collier" },
  { text: "What gets measured gets managed.", author: "Peter Drucker" },

  // Resilience
  { text: "You are stronger than you think.", author: "Unknown" },
  { text: "Every setback is a setup for a comeback.", author: "Unknown" },
  { text: "Fall seven times, stand up eight.", author: "Japanese Proverb" },
  { text: "Difficult roads often lead to beautiful destinations.", author: "Unknown" },
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
