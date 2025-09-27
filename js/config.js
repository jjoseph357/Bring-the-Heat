// Paste your Firebase configuration here
export const firebaseConfig = {
  apiKey: "AIzaSyA74kVesCebxBsR9veng56MpxqvTBZ6618",
  authDomain: "bring-the-heat-3ea0d.firebaseapp.com",
  databaseURL: "https://bring-the-heat-3ea0d-default-rtdb.firebaseio.com",
  projectId: "bring-the-heat-3ea0d",
  storageBucket: "bring-the-heat-3ea0d.firebasestorage.app",
  messagingSenderId: "125412613431",
  appId: "1:125412613431:web:1cc0c3d807380f8aaaceb2"
};

export const decks = {
    deck1: { name: "Standard Issue", jackpot: 21, g: (sum) => 0.45 + (9.0 - 0.45) * (Math.exp(3.0 * (sum / 21)) - 1) / (Math.exp(3.0) - 1), cards: [{ v: 2, c: 4 }, { v: 3, c: 4 }, { v: 4, c: 4 }, { v: 5, c: 4 }, { v: 6, c: 4 }, { v: 7, c: 4 }, { v: 8, c: 4 }, { v: 9, c: 4 }, { v: 10, c: 4 }] },
    deck2: { name: "Pyramid Scheme", jackpot: 20, g: (sum) => 0.40 + (7.0 - 0.40) * (Math.exp(2.6 * (sum / 20)) - 1) / (Math.exp(2.6) - 1), cards: [{ v: 1, c: 1 }, { v: 2, c: 2 }, { v: 3, c: 3 }, { v: 4, c: 4 }, { v: 5, c: 5 }, { v: 6, c: 6 }, { v: 7, c: 7 }, { v: 8, c: 8 }] },
    deck3: { name: "High Stakes", jackpot: 10, g: (sum) => 0.30 + (14.0 - 0.30) * (Math.exp(4.2 * (sum / 9)) - 1) / (Math.exp(4.2) - 1), cards: [{ v: 1, c: 10 }, { v: 2, c: 10 }, { v: 3, c: 10 }, { v: 10, c: 6 }] },
    deck4: { name: "Low Roller", jackpot: 21, g: (sum) => 0.55 + (4.5 - 0.55) * (Math.exp(2.0 * (sum / 21)) - 1) / (Math.exp(2.0) - 1), cards: [{ v: 1, c: 12 }, { v: 2, c: 12 }, { v: 3, c: 12 }] }
};

export const monsters = {
    slime: {
        name: "Vicious Slime",
        hp: 150,
        attack: 10,
        hitChance: 0.80, // 80% chance to hit
    },
    goblin: {
        name: "Cave Goblin",
        hp: 120,
        attack: 15,
        hitChance: 0.70, // 70% chance to hit
    },
    boss: {
        name: "The Node Guardian",
        hp: 300,
        attack: 20,
        hitChance: 0.90, // 90% chance to hit
    }
};