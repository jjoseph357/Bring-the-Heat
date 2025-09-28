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
    deck1: { name: "Standard Issue", jackpot: 21, g: (sum, jackpot) =>0.1 + (10.0 - 0.1) * Math.pow(sum / jackpot, 5.913), cards: [{ v: 2, c: 4 }, { v: 3, c: 4 }, { v: 4, c: 4 }, { v: 5, c: 4 }, { v: 6, c: 4 }, { v: 7, c: 4 }, { v: 8, c: 4 }, { v: 9, c: 4 }, { v: 10, c: 4 }] },
    deck2: { name: "Pyramid Scheme", jackpot: 20, g: (sum, jackpot) => 0.1 + (10.0 - 0.1) * Math.pow(sum / jackpot, 5.913), cards: [{ v: 1, c: 1 }, { v: 2, c: 2 }, { v: 3, c: 3 }, { v: 4, c: 4 }, { v: 5, c: 5 }, { v: 6, c: 6 }, { v: 7, c: 7 }, { v: 8, c: 8 }] },
    deck3: { name: "High Stakes", jackpot: 10, g: (sum, jackpot) => 0.1 + (10.0 - 0.1) * Math.pow(sum / jackpot, 5.913), cards: [{ v: 1, c: 10 }, { v: 2, c: 10 }, { v: 3, c: 10 }, { v: 10, c: 6 }] },
    deck4: { name: "Low Roller", jackpot: 21, g: (sum, jackpot) => 0.1 + (10.0 - 0.1) * Math.pow(sum / jackpot, 5.913), cards: [{ v: 1, c: 12 }, { v: 2, c: 12 }, { v: 3, c: 12 }] }
};

export const monsters = {
    // Tier for Normal Battles
    normal: {
        fireBat: { name: "Fire Bat", hp: 40, attack: 5, hitChance: 0.25, goldDrop: [5, 12], asset: 'assets/enemies/Infernos_Gambit_-_Fire_Bat.png' },
        fireGolem: { name: "Fire Golem", hp: 60, attack: 8, hitChance: 0.25, goldDrop: [10, 18], asset: 'assets/enemies/Infernos_Gambit_-_Tall_Fire_Golem.png' },
        fireHound: { name: "Fire Hound", hp: 50, attack: 10, hitChance: 0.20, goldDrop: [8, 15], asset: 'assets/enemies/Infernos_Gambit_-_Fire_Hound.png' },
        fireSpirit: { name: "Fire Spirit", hp: 35, attack: 10, hitChance: 0.20, goldDrop: [12, 20], asset: 'assets/enemies/Infernos_Gambit_-_Fire_Spirit.png' },
        fireZombie: { name: "Fire Zombie", hp: 70, attack: 8, hitChance: 0.20, goldDrop: [10, 22], asset: 'assets/enemies/Infernos_Gambit_-_FIre_Zombie.png' },
        lavaGolem: { name: "Lava Golem", hp: 80, attack: 6, hitChance: 0.20, goldDrop: [15, 25], asset: 'assets/enemies/Infernos_Gambit_-_Lava_Golem.png' },
        fireArcher: { name: "Fire Archer", hp: 45, attack: 10, hitChance: 0.25, goldDrop: [14, 24], asset: 'assets/enemies/Infernos_Gambit_-_Fire_Archer.png'}
    },
    // Tier for Elite Battles
    elite: {
        fireBowser: { name: "Fire Bowser", hp: 160, attack: 15, hitChance: 0.35, goldDrop: [50, 80], asset: 'assets/enemies/Infernos_Gambit_-_Fire_Bowser.png' },
        flyingKnight: { name: "Flying Fire Knight", hp: 120, attack: 20, hitChance: 0.3, goldDrop: [60, 90], asset: 'assets/enemies/Infernos_Gambit_-_Flying_Fire_Knight.png' },
        tallGolem: { name: "Tall Fire Golem", hp: 200, attack: 20, hitChance: 0.2, goldDrop: [70, 100], asset: 'assets/enemies/Infernos_Gambit_-_Tall_Fire_Golem.png' }
    },
    // Tier for the Final Boss
    boss: {
        fireBoss: { name: "The Inferno Lord", hp: 400, attack: 20, hitChance: 0.25, goldDrop: [250, 300], asset: 'assets/enemies/Infernos_Gambit_-_Fire_Boss.png' }
    }
};

export const playerCharacters = [
    'assets/players/Archer.png',
    'assets/players/Archer_1.png',
    'assets/players/Mage.png',
    'assets/players/Tank.png'
];

export const backgrounds = [
    'assets/bg/Infernos_Gambit_-_Lava_Bridge.png',
    'assets/bg/Infernos_Gambit_-_Lava_Bridge_2.png'
];
