import { decks } from './config.js';
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

// MODIFIED: Timer logic removed
function initializeBattle() {
    const myDeckConfig = decks[state.player.deckId];
    state.battle = {
        phase: 'PLAYER_TURN',
        monster: { hp: 150, maxHp: 150, attack: 10 },
        players: {
            [state.player.id]: {
                name: state.player.name, hp: state.player.hp, maxHp: state.player.maxHp,
                money: 100, deck: shuffleDeck(createDeck(myDeckConfig)),
                hand: [], sum: 0, bet: 0,
                status: 'needs_bet', // Player must bet to start.
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

// MODIFIED: This action no longer ends the turn.
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
    myData.status = 'acting'; // Now the player can Draw or Attack.

    // Update the UI; the turn continues.
    ui.updateBattleUI(state.battle, state.player.id, state.player.deckId);
}

// MODIFIED: Ends the turn. On success, status remains 'acting' for the next turn.
// MODIFIED: drawCard now disables controls immediately.
function drawCard() {
    const myData = state.battle.players[state.player.id];
    if (myData.status !== 'acting') return; // Guard clause

    // --- FIX: Immediately lock the player's turn ---
    myData.status = 'waiting';
    ui.disableActionButtons();
    // ---------------------------------------------

    if (myData.deck.length === 0) {
        myData.deck = shuffleDeck(createDeck(decks[state.player.deckId]));
    }
    
    const drawnCard = myData.deck.pop();
    myData.hand.push(drawnCard);
    myData.sum += drawnCard;
    
    // Update UI to show the card, but buttons will remain disabled
    ui.updateBattleUI(state.battle, state.player.id, state.player.deckId);

    const deckConfig = decks[state.player.deckId];
    if (myData.sum > deckConfig.jackpot) {
        alert("BUST!");
        setTimeout(() => {
            myData.status = 'needs_bet'; // Busted, must bet next turn.
            myData.hand = [];
            myData.sum = 0;
            myData.bet = 0;
            startEnemyTurn();
        }, 1500); 
    } else {
        // Successful draw, status for next turn remains 'acting'.
        setTimeout(startEnemyTurn, 1000);
    }
}

// MODIFIED: Ends the turn and forces a new bet on the next turn.
function performAttack() {
    const myData = state.battle.players[state.player.id];
    if (myData.status !== 'acting') return; // Guard clause

    // --- FIX: Immediately lock the player's turn ---
    myData.status = 'waiting';
    ui.disableActionButtons();
    // ---------------------------------------------
    
    const deckConfig = decks[state.player.deckId];
    const winnings = myData.bet * deckConfig.g(myData.sum);
    const damage = Math.floor(winnings);
    
    state.battle.monster.hp = Math.max(0, state.battle.monster.hp - damage);
    
    myData.money = Math.floor(myData.money + winnings);
    myData.status = 'needs_bet'; // Attacked, so must bet next turn.
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
        myData.hp = Math.max(0, myData.hp - state.battle.monster.attack);
        state.player.hp = myData.hp;

        if (myData.hp <= 0) {
            endBattle('defeat');
        } else {
            startNextPlayerTurn();
        }
    }, 1500);
}

// MODIFIED: On the next turn, we check the status that was set by the previous action.
function startNextPlayerTurn() {
    const myData = state.battle.players[state.player.id];

    // If the last action was a successful draw, the status will still be 'acting'.
    // If it was a bust or attack, it will be 'needs_bet'.
    if (myData.status === 'waiting') {
        myData.status = 'acting';
    }

    state.battle.phase = 'PLAYER_TURN';
    state.battle.turn++;
    ui.updateBattleUI(state.battle, state.player.id, state.player.deckId);
}

// NEW FUNCTION: To handle the start of a new betting round
function startNextBettingPhase() {
    const myData = state.battle.players[state.player.id];
    myData.status = 'betting';
    myData.bet = 0; // Clear old bet
    
    state.battle.phase = 'BETTING';
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