// singleplayer.js (updated)
import { decks, monsters, playerCharacters, backgrounds } from './config.js'; // Add playerCharacters and backgrounds
import * as ui from './ui.js';
import { generateNewMap, createDeck, shuffleDeck } from './game-logic.js';
import * as engine from './battle-engine.js';

let state = {};

// Pool for the mini card-selection (when player chooses "Choose a card to add to your deck")
// NOTE: use internal id "draw2" for the draw-2 card so engine logic is consistent
const cardChoicePool = [
    "draw2",
    "1","2","3","4","5","6","7","8","9","10","11",
    "-1","-2","-3"
];

function getRandomCardChoices(count = 3) {
    const shuffled = [...cardChoicePool].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
}

export const rewardPool = [
    "draw2",
    "1","2","3","4","5","6","7","8","9","10","11",
    "-1","-2","-3",
    "+2 mana","+5 gold","+1 hp"
];

// Elite rewards (items with permanent effects)
export const eliteRewardPool = [
    "Increase gold earned by 20% (unique)",
    "Heal +2 hp after each location (stackable)",
    "Reduce revive cost by 20% (unique)",
    "Increase starting mana by 10 (stackable)",
    "Gain +200 gold"
];

// Boss rewards - NEW
const bossRewardPool = [
    "Can buy 1 mana for 1 gold",
    "Earn 10% interest after each location",
    "10% of gold is added to damage",
    "Each 2 drawn permanently adds 1 damage"
];

// Battle debuffs - NEW
const battleDebuffs = [
    "Drawing the number 3 does not add to sum",
    "Target sum is doubled",
    "Draw double the cards each draw"
];

export const shopItems = [
    { name: "Remove 1 card from your deck", cost: 50 },
    { name: "Heal 20 HP", cost: 30 },
    { name: "Increase starting mana by 10", cost: 100 },
    { name: "Gain +200 gold", cost: 150 },
    { name: "Draw 2 card", cost: 80 },
    { name: "+1 permanent damage", cost: 120 }
];


function getRandomRewards(count = 3) {
    const shuffled = [...rewardPool].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
}

function getRandomEliteRewards(count = 3) {
    const shuffled = [...eliteRewardPool].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
}

function getRandomBossRewards(count = 3) {
    const shuffled = [...bossRewardPool].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
}

export function start(playerName, deckId) {
    state = {
        player: { 
            id: 'p1', name: playerName, deckId, hp: 100, maxHp: 100,
            asset: playerCharacters[Math.floor(Math.random() * playerCharacters.length)], // Assign random asset
            gold: 0, deaths: 0, extraCards: [], items: [],
            removedCards: [], // Track cards removed from the base deck
            permanentDamage: 0, // Track permanent damage bonus
            consumables: { doubleGold: 0, halfHpEnemies: 0, bonusMana: 0, startWith10: 0 } // initialize
        },
        map: generateNewMap(),
        gameState: { status: 'map_vote', currentNodeId: null, clearedNodes: [0] },
        battle: null,
        loopCount: 0, // Tracks number of boss defeats for scaling
    };
    ui.showGameScreen('map');
    ui.renderMap(state.map, state.gameState, onNodeSelect);
    ui.updatePartyStats({ [state.player.id]: state.player }, state.player.id, revivePlayer);
    ui.renderItems(state.player.items);
    ui.elements.defeatContinueBtn.onclick = () => { window.location.reload(); };
}

function onNodeSelect(nodeId) {
    state.gameState.currentNodeId = nodeId;
    const nodeType = state.map.nodes[nodeId].type;

    switch (nodeType) {
        case 'Normal Battle':
        case 'Elite Battle':
        case 'Boss':
            initializeBattle(nodeType);
            break;
        case 'Rest Site':
            handleRestSite();
            break;
        case 'Shop':
            handleShopNode();
            break;
        case 'Unknown Event':
            handleUnknownEvent();
            break;
    }
}

function initializeBattle(nodeType) {
    const myDeckConfig = decks[state.player.deckId];
    let baseDeck = createDeck(myDeckConfig, state.player.removedCards) || [];
    if (Array.isArray(state.player.extraCards) && state.player.extraCards.length > 0) {
        baseDeck = baseDeck.concat(state.player.extraCards);
    }
    const fullShuffledDeck = shuffleDeck(baseDeck);

    // Apply random debuff for Elite and Boss battles
    let activeDebuff = null;
    if (nodeType === 'Elite Battle' || nodeType === 'Boss') {
        activeDebuff = battleDebuffs[Math.floor(Math.random() * battleDebuffs.length)];
    }

    // Calculate starting mana with items and consumables
    let startingMana = 20;
    startingMana += 10 * ((state.player.items || []).filter(i => i === "Increase starting mana by 10 (stackable)").length);
    startingMana += 5 * ((state.player.items || []).filter(i => i === "Increase starting mana by 5 (event)").length);
    startingMana -= 5 * ((state.player.items || []).filter(i => i === "Decrease starting mana by 5").length);
    
    // Ensure consumables exist and are numbers
    state.player.consumables = state.player.consumables || { doubleGold:0, halfHpEnemies:0, bonusMana:0, startWith10:0 };
    state.player.consumables.bonusMana = state.player.consumables.bonusMana || 0;
    state.player.consumables.startWith10 = state.player.consumables.startWith10 || 0;
    state.player.consumables.halfHpEnemies = state.player.consumables.halfHpEnemies || 0;
    state.player.consumables.doubleGold = state.player.consumables.doubleGold || 0;

    // Apply bonus mana consumable (counts are how many encounters left)
    if (state.player.consumables.bonusMana > 0) {
        startingMana += 10;
        state.player.consumables.bonusMana = Math.max(0, state.player.consumables.bonusMana - 1);
    }

    // Initialize hand
    let startingHand = [];
    if (state.player.consumables.startWith10 > 0) {
        startingHand.push("10");
        state.player.consumables.startWith10 = Math.max(0, state.player.consumables.startWith10 - 1);
    }

    state.battle = {
        phase: 'PLAYER_TURN',
        monsters: generateEnemyGroup(nodeType),
        background: backgrounds[Math.floor(Math.random() * backgrounds.length)], // Add random background
        log: {},
        players: {
            [state.player.id]: {
                name: state.player.name,
                hp: state.player.hp,
                maxHp: state.player.maxHp,
                asset: state.player.asset, // Pass player asset
                mana: startingMana,
                deck: fullShuffledDeck,
                deckId: state.player.deckId,
                hand: startingHand,
                sum: engine.computeHandSum(startingHand, activeDebuff),
                charge: 0,
                status: 'needs_mana',
                gold: state.player.gold || 0,
                extraCards: [...(state.player.extraCards || [])],
                items: [...(state.player.items || [])],
                permanentDamage: state.player.permanentDamage || 0
            }
        },
        turn: 1,
        activeDebuff: activeDebuff
    };

    // Apply half HP consumable to enemies (one-time)
    if (state.player.consumables.halfHpEnemies > 0) {
        state.battle.monsters.forEach(monster => {
            monster.hp = Math.floor(monster.hp / 2);
        });
        logBattleMessage("Your consumable weakens the enemies! They start with half HP!");
        state.player.consumables.halfHpEnemies = Math.max(0, state.player.consumables.halfHpEnemies - 1);
    }

    if (activeDebuff) {
        logBattleMessage(`⚠️ Battle Debuff Active: ${activeDebuff}`);
    }

    ui.showGameScreen('battle');
    ui.setTimerVisibility(false);
    ui.updateBattleUI(state.battle, state.player.id, state.player.deckId);
    ui.renderItems(state.player.items);

    ui.elements.chargeBtn.onclick = chargeAttack;
    ui.elements.drawCardBtn.onclick = drawCard;
    ui.elements.attackBtn.onclick = performAttack;
    ui.elements.returnToMapBtn.onclick = returnToMap;
}

function generateEnemyGroup(nodeType) {
    let group = [];
    const now = Date.now();
    let tier;
    let enemyKeys;

    if (nodeType === 'Normal Battle') {
        tier = 'normal';
        enemyKeys = Object.keys(monsters.normal);
    } else if (nodeType === 'Elite Battle') {
        tier = 'elite';
        enemyKeys = Object.keys(monsters.elite);
    } else if (nodeType === 'Boss') {
        tier = 'boss';
        enemyKeys = ['nodeGuardian'];
    }

    const enemyType = enemyKeys[Math.floor(Math.random() * enemyKeys.length)];
    const baseStats = { ...monsters[tier][enemyType] };

    // Apply difficulty scaling
    const loopCount = state.loopCount || 0;
    if (loopCount > 0) {
        baseStats.hp = Math.floor(baseStats.hp * Math.pow(1.5, loopCount));
        baseStats.attack = Math.floor(baseStats.attack * Math.pow(1.25, loopCount));
    }

    group.push({ ...baseStats, maxHp: baseStats.hp, id: `m_${now}`, tier: tier, type: enemyType });
    return group;
}

function logBattleMessage(message) {
    if (!state.battle) return;
    state.battle.log = state.battle.log || {};
    const key = `m_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    state.battle.log[key] = { message, timestamp: Date.now() };
}

function chargeAttack() {
    const myData = state.battle.players[state.player.id];
    if (!myData || myData.status !== 'needs_mana') return;

    const chargeValue = parseInt(ui.elements.manaInput.value, 10) || 0;
    
    // Check for "Can buy 1 mana for 1 gold" item (this purchases mana for combat only)
    if (myData.items && myData.items.includes("Can buy 1 mana for 1 gold")) {
        const goldAvailable = myData.gold || 0;
        const manaNeeded = Math.max(0, chargeValue - (myData.mana || 0));
        
        // Only buy as much mana as needed for this charge; do not permanently increase starting mana
        if (manaNeeded > 0 && goldAvailable >= manaNeeded) {
            myData.gold -= manaNeeded;
            myData.mana = (myData.mana || 0) + manaNeeded;
            logBattleMessage(`${myData.name} converts ${manaNeeded} gold to mana for this combat!`);
            state.player.gold = myData.gold;
        }
    }
    
    const result = engine.handleCharge(myData, chargeValue, state.battle.activeDebuff);

    if (result.error) {
        alert(result.error);
        return;
    }

    state.battle.players[state.player.id] = result.updatedPlayer;
    ui.updateBattleUI(state.battle, state.player.id, state.player.deckId);
}

function drawCard() {
    let myData = state.battle.players[state.player.id];
    if (!myData || myData.status !== 'acting') return;

    myData.status = 'waiting';
    ui.disableActionButtons();

    // If debuff is "Draw double the cards each draw", each draw action performs the draw sequence twice
    const drawRounds = (state.battle.activeDebuff === "Draw double the cards each draw") ? 2 : 1;
    
    for (let r = 0; r < drawRounds; r++) {
        // Each round we call handleDraw once (that function already handles draw2 card behavior)
        const result = engine.handleDraw(myData, state.battle.activeDebuff);
        state.battle.players[state.player.id] = result.updatedPlayer;
        myData = result.updatedPlayer;
        (result.logMessages || []).forEach(logBattleMessage);
        
        // Track 2s drawn for permanent damage bonus (boss reward)
        if (myData.items && myData.items.includes("Each 2 drawn permanently adds 1 damage")) {
            const hand = myData.hand || [];
            if (hand.length > 0) {
                const lastCard = hand[hand.length - 1];
                if (lastCard === "2" || lastCard === 2) {
                    myData.permanentDamage = (myData.permanentDamage || 0) + 1;
                    state.player.permanentDamage = myData.permanentDamage;
                    logBattleMessage(`${myData.name} gains +1 permanent damage from drawing a 2!`);
                }
            }
        }
    }

    ui.updateBattleUI(state.battle, state.player.id, state.player.deckId);

    // sync master player state
    state.player.hp = state.battle.players[state.player.id].hp;
    state.player.gold = state.battle.players[state.player.id].gold || state.player.gold;

    if (state.battle.players[state.player.id].hp <= 0) {
        setTimeout(() => endBattle('defeat'), 1500);
    } else {
        setTimeout(startEnemyTurn, 1000);
    }
}

function performAttack() {
    const myData = state.battle.players[state.player.id];
    if (!myData || myData.status !== 'acting') return;

    myData.status = 'waiting';
    ui.disableActionButtons();

    const livingMonsters = state.battle.monsters.filter(m => m.hp > 0);
    if (livingMonsters.length === 0) {
        endBattle('victory');
        return;
    }
    const target = livingMonsters[Math.floor(Math.random() * livingMonsters.length)];

    const result = engine.handleAttack(myData, state.battle.activeDebuff);
    state.battle.players[state.player.id] = result.updatedPlayer;
    
    let totalDamage = result.damageDealt;
    

    // Add permanent damage bonus
    totalDamage += myData.permanentDamage || 0;
    
    // Add gold-based damage (10% of gold) if item present
    if (myData.items && myData.items.includes("10% of gold is added to damage")) {
        const goldBonus = Math.floor((myData.gold || 0) * 0.1);
        totalDamage += goldBonus;
        if (goldBonus > 0) {
            logBattleMessage(`${myData.name}'s wealth adds ${goldBonus} bonus damage!`);
        }
    }
    if (totalDamage > 0) {
        ui.triggerAttackAnimation(state.player.id, true); // Trigger animation
    }
    target.hp = Math.max(0, target.hp - totalDamage);
    (result.logMessages || []).forEach(logBattleMessage);

    // sync player-level persistent fields
    state.player.hp = state.battle.players[state.player.id].hp;
    state.player.gold = state.battle.players[state.player.id].gold || state.player.gold;

    ui.updateBattleUI(state.battle, state.player.id, state.player.deckId);

    const allMonstersDead = state.battle.monsters.every(m => m.hp <= 0);
    if (allMonstersDead) {
        endBattle('victory');
    } else if (state.battle.players[state.player.id].hp <= 0) {
        endBattle('defeat');
    } else {
        setTimeout(startEnemyTurn, 1000);
    }
}

function startEnemyTurn() {
    state.battle.phase = 'ENEMY_TURN';
    ui.updateBattleUI(state.battle, state.player.id, state.player.deckId);

    const livingMonsters = state.battle.monsters.filter(m => m.hp > 0);
    let currentMonsterIndex = 0;

    function nextMonsterAttack() {
        if (currentMonsterIndex >= livingMonsters.length) {
            startNextPlayerTurn();
            return;
        }

        const monster = livingMonsters[currentMonsterIndex];
        const myData = state.battle.players[state.player.id];

        if (Math.random() < monster.hitChance) {
            ui.triggerAttackAnimation(monster.id, false); // Trigger animation

            const damage = monster.attack;
            logBattleMessage(`${monster.name} hits ${myData.name} for ${damage} damage! (${monster.hitChance}% chance)`);
            myData.hp = Math.max(0, myData.hp - damage);
            state.player.hp = myData.hp;
        } else {
            ui.triggerAttackAnimation(monster.id, false); // Trigger animation

            logBattleMessage(`${monster.name} attacks ${myData.name} but MISSES!`);
        }

        ui.updateBattleUI(state.battle, state.player.id, state.player.deckId);

        if (myData.hp <= 0) {
            endBattle('defeat');
            return;
        }

        currentMonsterIndex++;
        setTimeout(nextMonsterAttack, 1000);
    }

    setTimeout(nextMonsterAttack, 500);
}

function startNextPlayerTurn() {
    const myData = state.battle.players[state.player.id];

    // FIX: Add a check for 0 mana when the player must invest again.
    if (myData.mana <= 0 && myData.charge === 0) {
        myData.hp = 0;
        myData.status = 'defeated';
        logBattleMessage(`${myData.name} has no mana left and is defeated!`);
        ui.updateBattleUI(state.battle, state.player.id, state.player.deckId);
        setTimeout(() => endBattle('defeat'), 1500);
        return; // Stop the turn here
    }

    if (myData.charge === 0) {
        myData.status = 'needs_mana';
    } else {
        myData.status = 'acting';
    }

    state.battle.phase = 'PLAYER_TURN';
    state.battle.turn++;
    ui.updateBattleUI(state.battle, state.player.id, state.player.deckId);
}


function clearDebuffUI() {
    // This function is now more robust.
    const debuffEl = document.getElementById("active-debuff-display");
    if (debuffEl) {
        debuffEl.remove();
    }
}


function endBattle(result) {
    let goldReward = 0;
    let extraRewards = [];
    let rewardMessage = ''; // Variable to hold the message

    clearDebuffUI();
    if(state.battle) state.battle.activeDebuff = null;

    if (result === 'victory') {
        const monster = state.battle.monsters[0];
        const monsterType = monster.tier;
        const monsterKey = monster.type;
        const goldDropRange = monsters[monsterType]?.[monsterKey]?.goldDrop || [50, 100];
        goldReward = Math.floor(Math.random() * (goldDropRange[1] - goldDropRange[0] + 1)) + goldDropRange[0];
        
        // Apply gold multiplier from items
        if ((state.player.items || []).includes("Increase gold earned by 20% (unique)")) {
            goldReward = Math.floor(goldReward * 1.2);
        }
        
        // Apply double gold consumable
        state.player.consumables = state.player.consumables || {};
        if (state.player.consumables.doubleGold > 0) {
            goldReward *= 2;
            state.player.consumables.doubleGold = Math.max(0, state.player.consumables.doubleGold - 1);
            logBattleMessage("Double gold bonus applied!");
        }

        if (state.player.hp > 0) {
            state.player.gold = (state.player.gold || 0) + goldReward;
        }

        if (monsterType === 'normal') {
            extraRewards = getRandomRewards(3);
            rewardMessage = "Choose a card to add to your deck as a reward!";
        } else if (monsterType === 'elite') {
            extraRewards = getRandomEliteRewards(3);
            rewardMessage = "Choose a powerful item as your reward!";
        } else if (monsterType === 'boss') {
            extraRewards = getRandomBossRewards(3);
            rewardMessage = "Choose a legendary blessing as your reward!";
        }


        state.battle = null;
        ui.showGameScreen('end_battle', { result, goldReward, extraRewards }, true);

        if (extraRewards.length > 0) {
            ui.showRewardChoices(extraRewards, (sel) => {
                if (monsterType === 'elite') {
                    applyEliteReward(sel);
                } else if (monsterType === 'boss') {
                    applyBossReward(sel);
                } else {
                    applyReward(sel);
                }
            });
        } else {
            ui.elements.returnToMapBtn.onclick = returnToMap;
        }
        return;
    }
    
    state.battle = null;
    ui.showGameScreen('end_battle', { result, goldReward, extraRewards, rewardMessage }, true);
    ui.elements.returnToMapBtn.onclick = returnToMap;
}

function applyReward(reward) {
    const player = state.player;

    if (reward === "draw2") {
        player.extraCards.push("draw2");
    }
    else if (/^-?\d+$/.test(String(reward).trim())) {
        player.extraCards.push(reward);
    }
    else if (reward === "+2 mana" || reward === "+1 hp" || reward === "+5 gold") {
        player.extraCards.push(reward);
    } else {
        player.extraCards = player.extraCards || [];
        player.extraCards.push(String(reward));
    }
    ui.updatePartyStats({ [state.player.id]: state.player }, state.player.id, revivePlayer);
    ui.renderItems(state.player.items);
    if (ui.hideRewardChoices) ui.hideRewardChoices();
    returnToMap();
}

function applyEliteReward(reward) {
    const player = state.player;
    player.items = player.items || [];

    if (reward === "Increase gold earned by 20% (unique)" && !player.items.includes(reward)) {
        player.items.push(reward);
    } else if (reward === "Heal +2 hp after each location (stackable)") {
        player.items.push(reward);
    } else if (reward === "Reduce revive cost by 20% (unique)" && !player.items.includes(reward)) {
        player.items.push(reward);
    } else if (reward === "Increase starting mana by 10 (stackable)") {
        player.items.push(reward);
    } else if (reward === "Gain +200 gold") {
        player.gold += 200;
    }

    ui.updatePartyStats({ [state.player.id]: state.player }, state.player.id, revivePlayer);
    ui.renderItems(state.player.items);
    if (ui.hideRewardChoices) ui.hideRewardChoices();
    returnToMap();
}

function applyBossReward(reward) {
    const player = state.player;
    player.items = player.items || [];

    if (!player.items.includes(reward)) {
        player.items.push(reward);
    }

    ui.updatePartyStats({ [state.player.id]: state.player }, state.player.id, revivePlayer);
    ui.renderItems(state.player.items);

    if (ui.hideRewardChoices) ui.hideRewardChoices();
    
    // Increment loop count and generate a new map
    state.loopCount = (state.loopCount || 0) + 1;
    state.map = generateNewMap();
    state.gameState.clearedNodes = [0];
    state.gameState.currentNodeId = null;
    
    returnToMap();
}

function revivePlayer(playerId) {
    if (playerId !== state.player.id) return;

    const myData = state.player;
    let reviveCost = 50 + ((myData.deaths || 0) * 50);
    if ((myData.items || []).includes("Reduce revive cost by 20% (unique)")) {
        reviveCost = Math.floor(reviveCost * 0.8);
    }
    if ((myData.gold || 0) >= reviveCost) {
        myData.gold -= reviveCost;
        myData.hp = myData.maxHp;
        myData.deaths = (myData.deaths || 0) + 1;
        ui.updatePartyStats({ [state.player.id]: state.player }, state.player.id, revivePlayer);
    } else {
        alert("Not enough gold to revive!");
    }
}

function handleRestSite() {
    const myData = state.player;
    const oldHp = myData.hp;

    const result = engine.handleRest(myData);
    state.player = result.updatedPlayer;

    const healedAmount = state.player.hp - oldHp;
    const healPercent = Math.round((healedAmount / myData.maxHp) * 100);
    let message = `You rest at the campfire, recovering ${healedAmount} HP (${healPercent}%).\nYour HP is now ${state.player.hp} / ${state.player.maxHp}.`;
    
    ui.showGameScreen('end_battle', { result: 'event', title: 'Rest Site', message: message }, true);
    ui.elements.returnToMapBtn.onclick = returnToMap;
}

function handleShopNode() {
    // Ensure consumables exist
    state.player.consumables = state.player.consumables || { doubleGold: 0, halfHpEnemies: 0, bonusMana: 0, startWith10: 0 };
    
    const shopItemsMasterList = [
        { name: "Gain +10 HP", cost: 30, action: "heal10" },
        { name: "Earn double gold for 3 encounters", cost: 60, action: "doubleGold" },
        { name: "Enemies start with half HP next encounter", cost: 30, action: "halfHp" },
        { name: "Start next 3 encounters with +10 mana", cost: 30, action: "bonusMana" },
        { name: "Start next 3 encounters with a 10 drawn", cost: 30, action: "startWith10" },
        { name: "Add a card to your deck", cost: 30, action: "addCard" },
        { name: "Remove 1 card from your deck", cost: 50, action: "removeCard" }
    ];

    // Get 5 random items for this visit
    const shopInventory = [...shopItemsMasterList].sort(() => 0.5 - Math.random()).slice(0, 5);
    
    let shopHTML = `<div style="background: #40444b; padding: 20px; border-radius: 10px;">`;
    shopHTML += `<h3>Welcome to the Shop!</h3>`;
    shopHTML += `<p>Your Gold: <strong>${state.player.gold}</strong></p>`;
    shopHTML += `<div style="display: grid; gap: 10px; margin-top: 20px;">`;
    
    shopInventory.forEach(item => {
        const canAfford = state.player.gold >= item.cost;
        const disabled = !canAfford || (item.action === "removeCard" && state.player.purchasedRemoval);
        
        shopHTML += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: #23272a; border-radius: 5px;">
                <span>${item.name}</span>
                <button 
                    onclick="window.handleShopPurchase('${item.action}', ${item.cost})"
                    ${disabled ? 'disabled' : ''}
                    style="background: ${canAfford && !disabled ? '#7289da' : '#555'}; color: white; border: none; padding: 5px 15px; border-radius: 5px; cursor: ${canAfford && !disabled ? 'pointer' : 'not-allowed'};">
                    ${item.cost} Gold
                </button>
            </div>
        `;
    });
    
    shopHTML += `</div></div>`;
    
    // Store shop purchase handler globally
    window.handleShopPurchase = (action, cost) => {
        if (state.player.gold < cost) return;
        
        state.player.gold -= cost;
        
        switch(action) {
            case "heal10":
                state.player.hp = Math.min(state.player.maxHp, state.player.hp + 10);
                alert("Healed 10 HP!");
                break;
            case "doubleGold":
                state.player.consumables.doubleGold = (state.player.consumables.doubleGold || 0) + 3;
                alert("You'll earn double gold for the next 3 encounters!");
                break;
            case "halfHp":
                state.player.consumables.halfHpEnemies = (state.player.consumables.halfHpEnemies || 0) + 1;
                alert("Enemies will start with half HP in the next encounter!");
                break;
            case "bonusMana":
                state.player.consumables.bonusMana = (state.player.consumables.bonusMana || 0) + 3;
                alert("You'll start with +10 mana for the next 3 encounters!");
                break;
            case "startWith10":
                state.player.consumables.startWith10 = (state.player.consumables.startWith10 || 0) + 3;
                alert("You'll start with a 10 card drawn for the next 3 encounters!");
                break;
            case "addCard": {
                const choices = getRandomCardChoices(3);
                ui.showCardSelection(choices, (picked) => {
                    // Use internal id mapping: if picked is 'draw2' keep it as-is
                    state.player.extraCards.push(picked);
                    alert(`Added ${picked} card to your deck!`);
                    handleShopNode(); // refresh
                });
                return; // don't re-render right away, the callback will
            }
            case "removeCard":
                if (state.player.purchasedRemoval) {
                    alert("You can only remove one card per shop!");
                    state.player.gold += cost; // Refund
                    return;
                }
                // Show card removal UI
                showCardRemovalUI();
                state.player.purchasedRemoval = true;
                break;
        }
        
        // Refresh the shop display
        handleShopNode();
    };
    
    ui.showGameScreen('end_battle', { result: 'event', title: 'Shop', message: shopHTML }, true);
    // returnToMap only when leaving shop; keep the return button active for shop
    ui.elements.returnToMapBtn.onclick = () => {
        delete state.player.purchasedRemoval; // Reset for next shop
        returnToMap();
    };
}

function showCardRemovalUI() {
    const allCards = [];
    const deckConfig = decks[state.player.deckId];
    
    // Add base deck cards, accounting for already removed cards
    const baseDeck = createDeck(deckConfig, state.player.removedCards);
    allCards.push(...baseDeck.map(String));
    
    // Add extra cards
    (state.player.extraCards || []).forEach(card => {
        allCards.push(String(card));
    });
    
    if (allCards.length === 0) {
        alert("No cards to remove!");
        return;
    }
    
    const cardToRemove = prompt("Which card would you like to remove? Your deck contains:\n" + 
        allCards.join(", ") + "\n\nEnter the card value to remove:");
    
    if (cardToRemove) {
        // Try to remove from extraCards first
        const extraCardIndex = state.player.extraCards.indexOf(cardToRemove);
        if (extraCardIndex > -1) {
            state.player.extraCards.splice(extraCardIndex, 1);
            alert(`Removed ${cardToRemove} from your deck!`);
        } else {
            // If not in extraCards, add to removedCards list for base deck
            const baseCardExists = deckConfig.cards.some(c => String(c.v) === cardToRemove);
            if (baseCardExists) {
                state.player.removedCards.push(cardToRemove);
                alert(`Removed ${cardToRemove} from your deck!`);
            } else {
                alert("Card not found in your deck.");
            }
        }
    }
}

function handleUnknownEvent() {
    // 50% chance for blessing or curse
    const isBlessing = Math.random() < 0.5;
    const eventType = isBlessing ? "Blessing" : "Curse";
    
    const blessings = [
        "Gain 20 HP",
        "Gain 20 Max HP", 
        "Gain 25% gold",
        "Increase starting mana by 5",
        "Remove a card from your deck"
    ];
    
    const curses = [
        "Lose 20 HP",
        "Lose 20 Max HP",
        "Lose 25% of your gold",
        "Decrease starting mana by 5",
        "Get 3 random cards"
    ];
    
    const options = isBlessing ? blessings : curses;
    const chosenOptions = [];
    const optionsCopy = [...options];
    
    // Pick 3 random options
    for (let i = 0; i < 3 && optionsCopy.length > 0; i++) {
        const idx = Math.floor(Math.random() * optionsCopy.length);
        chosenOptions.push(optionsCopy[idx]);
        optionsCopy.splice(idx, 1);
    }
    
    const message = `You encountered an Unknown Event: ${eventType}!\n\nChoose one:`;
    
    // Force a choice: show the event content and hide the return button so player cannot skip.
    ui.showGameScreen('end_battle', { result: 'event', title: 'Unknown Event', message: message }, true);
    // hide continue button to force choice
    if (ui.elements.returnToMapBtn) ui.elements.returnToMapBtn.style.display = 'none';
    ui.showRewardChoices(chosenOptions, (choice) => {
        // after player chooses, restore the return button and apply effect
        if (ui.elements.returnToMapBtn) ui.elements.returnToMapBtn.style.display = 'inline-block';
        applyEventChoice(choice);
    });
}

function applyEventChoice(choice) {
    const player = state.player;
    let resultMessage = "";
    
    switch(choice) {
        // Blessings
        case "Gain 20 HP":
            player.hp = Math.min(player.maxHp, player.hp + 20);
            resultMessage = "You gained 20 HP!";
            break;
        case "Gain 20 Max HP":
            player.maxHp += 20;
            player.hp += 20;
            resultMessage = "You gained 20 Max HP!";
            break;
        case "Gain 25% gold":
            const goldGain = Math.floor(player.gold * 0.25);
            player.gold += goldGain;
            resultMessage = `You gained ${goldGain} gold!`;
            break;
        case "Increase starting mana by 5":
            player.items = player.items || [];
            player.items.push("Increase starting mana by 5 (event)");
            resultMessage = "Your starting mana increased by 5!";
            break;
        case "Remove a card from your deck":
            showCardRemovalUI();
            resultMessage = "You have the opportunity to remove a card.";
            break;
            
        // Curses
        case "Lose 20 HP":
            player.hp = Math.max(1, player.hp - 20);
            resultMessage = "You lost 20 HP!";
            break;
        case "Lose 20 Max HP":
            player.maxHp = Math.max(20, player.maxHp - 20);
            player.hp = Math.min(player.hp, player.maxHp);
            resultMessage = "You lost 20 Max HP!";
            break;
        case "Lose 25% of your gold":
            const goldLoss = Math.floor(player.gold * 0.25);
            player.gold = Math.max(0, player.gold - goldLoss);
            resultMessage = `You lost ${goldLoss} gold!`;
            break;
        case "Decrease starting mana by 5":
            player.items = player.items || [];
            player.items.push("Decrease starting mana by 5");
            resultMessage = "Your starting mana decreased by 5!";
            break;
        case "Get 3 random cards":
            player.extraCards = player.extraCards || [];
            const randomCards = ["1","2","3","4","5","6","7","8","9","10","-1","-2"];
            for (let i = 0; i < 3; i++) {
                const card = randomCards[Math.floor(Math.random() * randomCards.length)];
                player.extraCards.push(card);
            }
            resultMessage = "3 random cards added to your deck!";
            break;
    }
    
    if (ui.hideRewardChoices) ui.hideRewardChoices();
    alert(resultMessage);
    returnToMap();
}

function returnToMap() {
    // Persist player's current hp/gold back to overall player object FIRST
    if (state.battle && state.battle.players && state.battle.players[state.player.id]) {
        state.player.hp = state.battle.players[state.player.id].hp;
        state.player.gold = state.battle.players[state.player.id].gold || state.player.gold;
        state.player.extraCards = state.player.extraCards || (state.battle.players[state.player.id].extraCards || []);
        state.player.permanentDamage = state.battle.players[state.player.id].permanentDamage || 0;
    }
    
    // Mark node as cleared
    if (state.gameState.currentNodeId && !state.gameState.clearedNodes.includes(state.gameState.currentNodeId)) {
        state.gameState.clearedNodes.push(state.gameState.currentNodeId);
        
        // Apply healing and interest ONLY when a node is newly cleared
        // Heal +2 hp after each location effect
        const healStacks = (state.player.items || []).filter(i => i === "Heal +2 hp after each location (stackable)").length;
        if (healStacks > 0) {
            const healAmount = 2 * healStacks;
            state.player.hp = Math.min(state.player.maxHp, state.player.hp + healAmount);
            console.log(`Applied ${healAmount} healing from items. HP is now ${state.player.hp}/${state.player.maxHp}`);
        }
        
        // Apply interest
        if ((state.player.items || []).includes("Earn 10% interest after each location")) {
            const interest = Math.floor((state.player.gold || 0) * 0.1);
            state.player.gold += interest;
            console.log(`Earned ${interest} gold in interest. Gold is now ${state.player.gold}`);
        }
    }

    state.battle = null;
    state.gameState.status = 'map_vote';
    ui.showGameScreen('map');
    ui.renderMap(state.map, state.gameState, onNodeSelect);
    ui.updatePartyStats({ [state.player.id]: state.player }, state.player.id, revivePlayer);
    ui.renderItems(state.player.items);

    // Hide any reward/card selection UI that might still be visible
    if (ui.hideRewardChoices) ui.hideRewardChoices();
    if (ui.hideCardSelection) ui.hideCardSelection();
}
