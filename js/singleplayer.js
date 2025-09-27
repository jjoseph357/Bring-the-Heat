// MODIFIED: Added 'monsters' to the import from config.js
import { decks, monsters } from './config.js';
import * as ui from './ui.js';
import { generateMap, createDeck, shuffleDeck } from './game-logic.js';

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
        map: generateMap(),
        gameState: {
            status: 'map_vote',
            currentNodeId: null,
            clearedNodes: []
        },
        battle: null,
    };

    ui.showGameScreen('map');
    ui.renderMap(state.map, state.gameState, onNodeSelect);
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
        log: [], // Use a simple array for single player log
        players: {
            [state.player.id]: {
                name: state.player.name, hp: state.player.hp, maxHp: state.player.maxHp,
                money: 100, deck: shuffleDeck(createDeck(myDeckConfig)),
                hand: [], sum: 0, bet: 0,
                status: 'needs_bet',
            }
        },
        turn: 1,
    };
    
    ui.showGameScreen('battle');
    ui.setTimerVisibility(false);
    ui.updateBattleUI(state.battle, state.player.id, state.player.deckId);
    
    ui.elements.placeBetBtn.onclick = placeBet;
    ui.elements.drawCardBtn.onclick = drawCard;
    ui.elements.attackBtn.onclick = performAttack;
    ui.elements.returnToMapBtn.onclick = returnToMap;
}

function logBattleMessage(message) {
    state.battle.log.push({ message });
}

function placeBet() {
    const myData = state.battle.players[state.player.id];
    if (myData.status !== 'needs_bet') return;

    const betValue = parseInt(ui.elements.betInput.value, 10);
    if (isNaN(betValue) || betValue < 0 || betValue > myData.money) {
        alert('Invalid bet amount.');
        return;
    }
    
    myData.bet = betValue;
    myData.money -= betValue;
    myData.status = 'acting';

    ui.updateBattleUI(state.battle, state.player.id, state.player.deckId);
}

function drawCard() {
    const myData = state.battle.players[state.player.id];
    if (myData.status !== 'acting') return;

    myData.status = 'waiting';
    ui.disableActionButtons();
    
    if (myData.deck.length === 0) {
        myData.deck = shuffleDeck(createDeck(decks[state.player.deckId]));
    }
    
    const drawnCard = myData.deck.pop();
    myData.hand.push(drawnCard);
    myData.sum += drawnCard;
    
    ui.updateBattleUI(state.battle, state.player.id, state.player.deckId);

    const deckConfig = decks[state.player.deckId];
    if (myData.sum > deckConfig.jackpot) {
        alert("BUST!");
        logBattleMessage(`${myData.name} busted!`);
        setTimeout(() => {
            myData.status = 'needs_bet';
            myData.hand = [];
            myData.sum = 0;
            myData.bet = 0;
            startEnemyTurn();
        }, 1500); 
    } else {
        logBattleMessage(`${myData.name} drew a card.`);
        setTimeout(startEnemyTurn, 1000);
    }
}

function performAttack() {
    const myData = state.battle.players[state.player.id];
    if (myData.status !== 'acting') return;
    
    myData.status = 'waiting';
    ui.disableActionButtons();

    const deckConfig = decks[state.player.deckId];
    const winnings = myData.bet * deckConfig.g(myData.sum);
    const damage = Math.floor(winnings);
    
    logBattleMessage(`${myData.name} attacks for ${damage} damage!`);
    
    state.battle.monster.hp = Math.max(0, state.battle.monster.hp - damage);
    
    myData.money = Math.floor(myData.money + winnings);
    myData.status = 'needs_bet';
    myData.hand = [];
    myData.sum = 0;
    myData.bet = 0;
    
    ui.updateBattleUI(state.battle, state.player.id, state.player.deckId);

    if (state.battle.monster.hp <= 0) {
        endBattle('victory');
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
    
    if (myData.status === 'waiting') {
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