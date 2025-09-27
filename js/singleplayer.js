// MODIFIED: Added 'monsters' to the import from config.js
import { decks, monsters } from './config.js';
import * as ui from './ui.js';
import { generateNewMap, createDeck, shuffleDeck } from './game-logic.js'; // Import the new function
import * as engine from './battle-engine.js';

let state = {};

export function start(playerName, deckId) {
    state = {
        player: {
            id: 'p1',
            name: playerName,
            deckId: deckId,
            hp: 100,
            maxHp: 100
        },
        map: generateNewMap(),
        gameState: {
            status: 'map_vote',
            currentNodeId: null,
            clearedNodes: []
        },
        battle: null,
    };

    ui.showGameScreen('map');
    ui.renderMap(state.map, state.gameState, onNodeSelect);
    
    ui.elements.defeatContinueBtn.onclick = () => {
        // The simplest way to reset a single-player game is to reload the page.
        window.location.reload();
    };

}

function onNodeSelect(nodeId) {
    state.gameState.currentNodeId = nodeId;
    state.gameState.status = 'battle';
    initializeBattle();
}

// This function will now work correctly
function initializeBattle() {
    const myDeckConfig = decks[state.player.deckId];
    const monsterType = state.gameState.currentNodeId === 'node-boss' ? 'boss' : 'slime';
    const monsterData = monsters[monsterType];
    state.battle = {
        phase: 'PLAYER_TURN',
        monster: { ...monsterData },
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

    myData.status = 'waiting'; // Lock turn
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
    
    myData.status = 'waiting'; // Lock turn
    ui.disableActionButtons();

    const result = engine.handleAttack(myData);
    state.battle.players[state.player.id] = result.updatedPlayer;
    state.battle.monster.hp = Math.max(0, state.battle.monster.hp - result.damageDealt);
    result.logMessages.forEach(logBattleMessage);
    
    ui.updateBattleUI(state.battle, state.player.id, state.player.deckId);

    if (state.battle.monster.hp <= 0) {
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
    
    setTimeout(() => {
        const myData = state.battle.players[state.player.id];
        const monster = state.battle.monster;
        
        if (Math.random() < monster.hitChance) {
            const damage = monster.attack;
            logBattleMessage(`${monster.name} hits ${myData.name} for ${damage} damage!`);
            myData.hp = Math.max(0, myData.hp - damage);
            state.player.hp = myData.hp;
        } else {
            logBattleMessage(`${monster.name} attacks ${myData.name} but MISSES!`);
        }

        if (myData.hp <= 0) {
            endBattle('defeat');
        } else {
            startNextPlayerTurn();
        }
    }, 1500);
}

function startNextPlayerTurn() {
    const myData = state.battle.players[state.player.id];
    
    // Set status for the new turn based on the result of the last one.
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
    state.battle = null;
    if (result === 'victory') {
        state.gameState.clearedNodes.push(state.gameState.currentNodeId);
    }
    ui.showGameScreen('end_battle', result, true);
}

function returnToMap() {
    state.gameState.status = 'map_vote';
    ui.showGameScreen('map');
    ui.renderMap(state.map, state.gameState, onNodeSelect);
}
