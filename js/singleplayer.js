import { decks, monsters } from './config.js';
import * as ui from './ui.js';
import { generateNewMap, createDeck, shuffleDeck } from './game-logic.js';
import * as engine from './battle-engine.js';

let state = {};

export function start(playerName, deckId) {
    state = {
        player: { 
            id: 'p1', name: playerName, deckId: deckId, hp: 100, maxHp: 100,
            gold: 0, deaths: 0 // Initialize new stats
        },
        map: generateNewMap(),
        gameState: { status: 'map_vote', currentNodeId: null, clearedNodes: [0] },
        battle: null,
    };
    ui.showGameScreen('map');
    ui.renderMap(state.map, state.gameState, onNodeSelect);
    // Pass the revivePlayer function as a callback
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
            // --- THIS IS THE FIX ---
            // Pass the nodeType to the initializeBattle function
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

// --- THIS IS THE OTHER PART OF THE FIX ---
// This function now correctly accepts the nodeType as an argument
function initializeBattle(nodeType) {
    const myDeckConfig = decks[state.player.deckId];
    
    state.battle = {
        phase: 'PLAYER_TURN',
        monsters: generateEnemyGroup(nodeType),
        log: [],
        players: {
            [state.player.id]: {
                name: state.player.name, hp: state.player.hp, maxHp: state.player.maxHp,
                mana: 20, deck: shuffleDeck(createDeck(myDeckConfig)),
                deckId: state.player.deckId,
                hand: [], sum: 0, charge: 0,
                status: 'needs_bet',
            }
        },
        turn: 1,
    };
    
    ui.showGameScreen('battle');
    ui.setTimerVisibility(false);
    ui.updateBattleUI(state.battle, state.player.id, state.player.deckId);
    
    ui.elements.chargeBtn.onclick = chargeAttack;
    ui.elements.drawCardBtn.onclick = drawCard;
    ui.elements.attackBtn.onclick = performAttack;
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
    state.battle.log.push({ message });
}

function chargeAttack() {
    const myData = state.battle.players[state.player.id];
    if (myData.status !== 'needs_bet') return;

    const chargeValue = parseInt(ui.elements.manaInput.value, 10);
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
    if (myData.status !== 'acting') return;

    myData.status = 'waiting';
    ui.disableActionButtons();
    
    const result = engine.handleDraw(myData);
    state.battle.players[state.player.id] = result.updatedPlayer;
    result.logMessages.forEach(logBattleMessage);

    ui.updateBattleUI(state.battle, state.player.id, state.player.deckId);

    if (state.battle.players[state.player.id].hp <= 0) {
        setTimeout(() => endBattle('defeat'), 1500);
    } else {
        setTimeout(startEnemyTurn, 1000);
    }
}

function performAttack() {
    const myData = state.battle.players[state.player.id];
    if (myData.status !== 'acting') return;
    
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
    result.logMessages.forEach(logBattleMessage);
    
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
        myData.status = 'needs_bet';
    } else {
        myData.status = 'acting';
    }

    state.battle.phase = 'PLAYER_TURN';
    state.battle.turn++;
    ui.updateBattleUI(state.battle, state.player.id, state.player.deckId);
}

function endBattle(result) {
    let goldReward = 0;
    if (result === 'victory') {
        const monsterType = state.battle.monsters[0].tier;
        const monsterKey = state.battle.monsters[0].type;
        const goldDropRange = monsters[monsterType][monsterKey].goldDrop;
        goldReward = Math.floor(Math.random() * (goldDropRange[1] - goldDropRange[0] + 1)) + goldDropRange[0];
        
        // Add gold to the player if they are alive
        if (state.player.hp > 0) {
            state.player.gold += goldReward;
        }
    }

    state.battle = null;
    if (result === 'victory') {
        state.gameState.clearedNodes.push(state.gameState.currentNodeId);
    }
    // Pass the result and reward info to the UI
    ui.showGameScreen('end_battle', { result, goldReward }, true);
}

function revivePlayer(playerId) {
    if (playerId !== state.player.id) return;
    
    const myData = state.player;
    // --- THIS IS THE MODIFIED LINE ---
    const reviveCost = 50 + (myData.deaths * 50);
    // ---------------------------------

    if (myData.gold >= reviveCost) {
        myData.gold -= reviveCost;
        myData.hp = myData.maxHp;
        myData.deaths += 1;
        ui.updatePartyStats({ [state.player.id]: state.player }, state.player.id, revivePlayer);
    } else {
        alert("Not enough gold to revive!");
    }
}


function handleRestSite() {
    // --- THIS IS THE FIX: Use state.player, not state.battle.players ---
    const myData = state.player;
    const oldHp = myData.hp;

    const result = engine.handleRest(myData);
    state.player = result.updatedPlayer; // Save the updated player state

    const healedAmount = state.player.hp - oldHp;
    const healPercent = Math.round((healedAmount / myData.maxHp) * 100);

    alert(
        `You rest at the campfire.\n` +
        `Healed for ${healedAmount} HP (${healPercent}%).\n` +
        `Your HP is now ${state.player.hp} / ${state.player.maxHp}.`
    );

    returnToMap();
}


function handlePlaceholderNode(nodeType) {
    alert(`You have arrived at an ${nodeType}. This feature will be implemented soon!`);
    returnToMap();
}

function returnToMap() {
    state.gameState.clearedNodes.push(state.gameState.currentNodeId);
    state.battle = null;
    state.gameState.status = 'map_vote';
    ui.showGameScreen('map');
    ui.renderMap(state.map, state.gameState, onNodeSelect);
    ui.updatePartyStats({ [state.player.id]: state.player }, state.player.id, revivePlayer);
}
