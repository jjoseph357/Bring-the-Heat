import { decks, monsters } from './config.js';
import * as ui from './ui.js';
import { generateNewMap, createDeck, shuffleDeck } from './game-logic.js';
import * as engine from './battle-engine.js';

let state = {};

// Pool for the mini card-selection (when player chooses "Choose a card to add to your deck")
const cardChoicePool = [
    "card that draws two cards",
    "1","2","3","4","5","6","7","8","9","10","11",
    "-1","-2","-3"
];

function getRandomCardChoices(count = 3) {
    const shuffled = [...cardChoicePool].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
}

// Reward pool shown after normal battle victory
export const rewardPool = [
    "card that draws two cards",
    "1","2","3","4","5","6","7","8","9","10","11",
    "-1","-2","-3",
    "+2 mana","+5 gold","+1 hp"
];


function getRandomRewards(count = 3) {
    const shuffled = [...rewardPool].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
}

export function start(playerName, deckId) {
    state = {
        player: { 
            id: 'p1', name: playerName, deckId: deckId, hp: 100, maxHp: 100,
            gold: 0, deaths: 0, extraCards: [] // ensure extraCards exists
        },
        map: generateNewMap(),
        gameState: { status: 'map_vote', currentNodeId: null, clearedNodes: [0] },
        battle: null,
    };
    ui.showGameScreen('map');
    ui.renderMap(state.map, state.gameState, onNodeSelect);
    ui.updatePartyStats({ [state.player.id]: state.player }, state.player.id, revivePlayer);
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
        case 'Unknown Event':
            handlePlaceholderNode(nodeType);
            break;
    }
}

function initializeBattle(nodeType) {
    const myDeckConfig = decks[state.player.deckId];

    // Build the deck for the battle. Include any extraCards from rewards.
    let baseDeck = createDeck(myDeckConfig) || [];
    // Merge extraCards (they may be strings like "5" or "+2 mana" etc.)
    if (Array.isArray(state.player.extraCards) && state.player.extraCards.length > 0) {
        baseDeck = baseDeck.concat(state.player.extraCards);
    }
    const fullShuffledDeck = shuffleDeck(baseDeck);

    state.battle = {
        phase: 'PLAYER_TURN',
        monsters: generateEnemyGroup(nodeType),
        log: {}, // use object to mimic multiplayer log shape if desired
        players: {
            [state.player.id]: {
                name: state.player.name,
                hp: state.player.hp,
                maxHp: state.player.maxHp,
                mana: 2000, // change back
                deck: fullShuffledDeck,
                deckId: state.player.deckId,
                hand: [],
                sum: 0,
                charge: 0,
                status: 'needs_mana',
                gold: state.player.gold || 0,
                // keep extraCards on player object for persistence across runs
                extraCards: Array.isArray(state.player.extraCards) ? [...state.player.extraCards] : []
            }
        },
        turn: 1,
    };

    ui.showGameScreen('battle');
    ui.setTimerVisibility(false);
    ui.updateBattleUI(state.battle, state.player.id, state.player.deckId);

    // Wire local controls
    ui.elements.chargeBtn.onclick = chargeAttack;
    ui.elements.drawCardBtn.onclick = drawCard;
    ui.elements.attackBtn.onclick = performAttack;
    // returnToMap is wired when the end-screen appears; still safe to set here
    ui.elements.returnToMapBtn.onclick = returnToMap;
}

function generateEnemyGroup(nodeType) {
    let group = [];
    const now = Date.now();
    if (nodeType === 'Normal Battle') {
        const enemyKeys = Object.keys(monsters.normal);
        const enemyType = enemyKeys[Math.floor(Math.random() * enemyKeys.length)];
        group.push({ ...monsters.normal[enemyType], id: `m_${now}`, tier: 'normal', type: enemyType });
    } else if (nodeType === 'Elite Battle') {
        const enemyKeys = Object.keys(monsters.elite);
        const enemyType = enemyKeys[Math.floor(Math.random() * enemyKeys.length)];
        group.push({ ...monsters.elite[enemyType], id: `m_${now}`, tier: 'elite', type: enemyType });
    } else if (nodeType === 'Boss') {
        group.push({ ...monsters.boss.nodeGuardian, id: `m_${now}`, tier: 'boss', type: 'nodeGuardian' });
    }
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
    const result = engine.handleCharge(myData, chargeValue);

    if (result.error) {
        alert(result.error);
        return;
    }

    state.battle.players[state.player.id] = result.updatedPlayer;
    ui.updateBattleUI(state.battle, state.player.id, state.player.deckId);
}

function drawCard() {
    const myData = state.battle.players[state.player.id];
    if (!myData || myData.status !== 'acting') return;

    myData.status = 'waiting';
    ui.disableActionButtons();

    const result = engine.handleDraw(myData);
    state.battle.players[state.player.id] = result.updatedPlayer;
    (result.logMessages || []).forEach(logBattleMessage);

    ui.updateBattleUI(state.battle, state.player.id, state.player.deckId);

    // sync master player state so persistent state (hp/gold) is updated
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

    const result = engine.handleAttack(myData);
    state.battle.players[state.player.id] = result.updatedPlayer;
    target.hp = Math.max(0, target.hp - result.damageDealt);
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
            const damage = monster.attack;
            logBattleMessage(`${monster.name} hits ${myData.name} for ${damage} damage!`);
            myData.hp = Math.max(0, myData.hp - damage);
            state.player.hp = myData.hp;
        } else {
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

    if (myData.charge === 0) {
        myData.status = 'needs_mana';
    } else {
        myData.status = 'acting';
    }

    state.battle.phase = 'PLAYER_TURN';
    state.battle.turn++;
    ui.updateBattleUI(state.battle, state.player.id, state.player.deckId);
}

function endBattle(result) {
    let goldReward = 0;
    let extraRewards = [];

    if (result === 'victory') {
        const monster = state.battle.monsters[0];
        const monsterType = monster.tier;
        const monsterKey = monster.type;
        const goldDropRange = monsters[monsterType][monsterKey].goldDrop;
        goldReward = Math.floor(Math.random() * (goldDropRange[1] - goldDropRange[0] + 1)) + goldDropRange[0];

        // award gold to player if alive
        if (state.player.hp > 0) {
            state.player.gold = (state.player.gold || 0) + goldReward;
        }

        // Only normal battles produce reward choices (per your spec)
        if (monsterType === 'normal') {
            extraRewards = getRandomRewards(3);
        }

        // Mark node cleared once (avoid duplicates later by checking in returnToMap)
        if (!state.gameState.clearedNodes.includes(state.gameState.currentNodeId)) {
            state.gameState.clearedNodes.push(state.gameState.currentNodeId);
        }

        // Clear battle (but keep player persistent fields such as extraCards)
        state.battle = null;

        // Show end screen with rewards (if any)
        ui.showGameScreen('end_battle', { result, goldReward, extraRewards }, true);

        // If there are reward choices, show them and wire applyReward
        if (extraRewards.length > 0) {
            ui.showRewardChoices(extraRewards, (sel) => {
                // applyReward will hide reward UI and perform the chosen effect
                applyReward(sel);
            });
        } else {
            // allow immediate return to map
            ui.elements.returnToMapBtn.onclick = returnToMap;
        }
        return;
    }

    // Non-victory (defeat or other)
    state.battle = null;
    ui.showGameScreen('end_battle', { result, goldReward }, true);
    ui.elements.returnToMapBtn.onclick = returnToMap;
}

function applyReward(reward) {
    const player = state.player;

    if (reward === "card that draws two cards") {
        player.extraCards = player.extraCards || [];
        player.extraCards.push("draw2");
        alert("You added 'Draw 2 Cards' to your deck!");
    }
    else if (/^-?\d+$/.test(String(reward).trim())) {
        player.extraCards = player.extraCards || [];
        player.extraCards.push(reward);
        alert(`You added card '${reward}' to your deck!`);
    }
    else if (reward === "+2 mana" || reward === "+1 hp" || reward === "+5 gold") {
        player.extraCards = player.extraCards || [];
        player.extraCards.push(reward);
        alert(`You added '${reward}' card to your deck!`);
    } else {
        // fallback (shouldn't happen)
        player.extraCards = player.extraCards || [];
        player.extraCards.push(String(reward));
        alert(`You added '${reward}' to your deck!`);
    }

    if (ui.hideRewardChoices) ui.hideRewardChoices();
    returnToMap();
}


function revivePlayer(playerId) {
    if (playerId !== state.player.id) return;

    const myData = state.player;
    const reviveCost = 50 + ((myData.deaths || 0) * 50);

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
    const message = `You rest at the campfire, recovering ${healedAmount} HP (${healPercent}%).\nYour HP is now ${state.player.hp} / ${state.player.maxHp}.`;

    ui.showGameScreen('end_battle', { result: 'event', title: 'Rest Site', message: message }, true);
    ui.elements.returnToMapBtn.onclick = returnToMap;
}

function handlePlaceholderNode(nodeType) {
    const message = `You have arrived at an ${nodeType}. This feature will be implemented soon!`;
    ui.showGameScreen('end_battle', { result: 'event', title: nodeType, message: message }, true);
    ui.elements.returnToMapBtn.onclick = returnToMap;
}

function returnToMap() {
    // Prevent duplicate cleared node entries
    if (!state.gameState.clearedNodes.includes(state.gameState.currentNodeId)) {
        state.gameState.clearedNodes.push(state.gameState.currentNodeId);
    }
    // Persist player's current hp/gold back to overall player object
    if (state.battle && state.battle.players && state.battle.players[state.player.id]) {
        state.player.hp = state.battle.players[state.player.id].hp;
        state.player.gold = state.battle.players[state.player.id].gold || state.player.gold;
        // also persist extraCards if battle object kept a copy
        state.player.extraCards = state.player.extraCards || (state.battle.players[state.player.id].extraCards || []);
    }

    state.battle = null;
    state.gameState.status = 'map_vote';
    ui.showGameScreen('map');
    ui.renderMap(state.map, state.gameState, onNodeSelect);
    ui.updatePartyStats({ [state.player.id]: state.player }, state.player.id, revivePlayer);

    // Hide any reward/card selection UI that might still be visible
    ui.hideRewardChoices();
    ui.hideCardSelection();
}

