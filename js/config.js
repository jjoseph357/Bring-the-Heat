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
    deck1: { name: "Standard Issue", jackpot: 21, g: (sum) => 0.1 + (9.0 - 0.1) * Math.pow(sum / 21, 9), cards: [{ v: 2, c: 4 }, { v: 3, c: 4 }, { v: 4, c: 4 }, { v: 5, c: 4 }, { v: 6, c: 4 }, { v: 7, c: 4 }, { v: 8, c: 4 }, { v: 9, c: 4 }, { v: 10, c: 4 }] },
    deck2: { name: "Pyramid Scheme", jackpot: 20, g: (sum) => 0.1 + (7.0 - 0.1) * Math.pow(sum / 20, 7), cards: [{ v: 1, c: 1 }, { v: 2, c: 2 }, { v: 3, c: 3 }, { v: 4, c: 4 }, { v: 5, c: 5 }, { v: 6, c: 6 }, { v: 7, c: 7 }, { v: 8, c: 8 }] },
    deck3: { name: "High Stakes", jackpot: 10, g: (sum) => 0.1 + (14.0 - 0.1) * Math.pow(sum / 10, 9.5), cards: [{ v: 1, c: 10 }, { v: 2, c: 10 }, { v: 3, c: 10 }, { v: 10, c: 6 }] },
    deck4: { name: "Low Roller", jackpot: 21, g: (sum) => 0.1 + (4.5 - 0.1) * Math.pow(sum / 21, 6), cards: [{ v: 1, c: 12 }, { v: 2, c: 12 }, { v: 3, c: 12 }] }
};

export const monsters = {
    // Tier for Normal Battles
    normal: {
        slime: { name: "Vicious Slime", hp: 150, attack: 5, hitChance: 0.30, goldDrop: [7, 15] },
        goblin: { name: "Cave Goblin", hp: 120, attack: 10, hitChance: 0.40, goldDrop: [10, 20] }
    },
    // Tier for Elite Battles
    elite: {
        stoneGolem: { name: "Stone Golem", hp: 250, attack: 15, hitChance: 0.60, goldDrop: [40, 60] },
        arcaneSprite: { name: "Arcane Sprite", hp: 100, attack: 25, hitChance: 0.50, goldDrop: [50, 75] }
    },
    // Tier for the Final Boss
    boss: {
        nodeGuardian: { name: "The Node Guardian", hp: 300, attack: 15, hitChance: 0.50, goldDrop: [200, 250] }
    }
};
