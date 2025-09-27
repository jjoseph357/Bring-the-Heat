import { decks, monsters } from './config.js';
import * as ui from './ui.js';
import { generateMap, createDeck, shuffleDeck } from './game-logic.js';

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getDatabase, ref, set, onValue, get, child, update, remove, runTransaction, push } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";

let db, currentLobby, currentPlayerId, isHost, myName, myDeckId, lobbyData;
let lobbyRef, battleRef;
let hostTurnTimer = null; // Variable to hold the host's turn timer

export function init(firebaseConfig, playerName, deckId) {
    const app = initializeApp(firebaseConfig);
    db = getDatabase(app);
    myName = playerName;
    myDeckId = deckId;
    ui.elements.createLobbyBtn.onclick = createLobby;
    ui.elements.joinLobbyBtn.onclick = joinLobby;
    ui.elements.startGameBtn.onclick = () => isHost && set(ref(db, `lobbies/${currentLobby}/gameState/status`), 'map_vote');
    ui.elements.placeBetBtn.onclick = placeBet;
    ui.elements.drawCardBtn.onclick = drawCard;
    ui.elements.attackBtn.onclick = performAttack;
    ui.elements.returnToMapBtn.onclick = () => isHost && returnToMap();
}

function createLobby() {
    const lobbyCode = Math.random().toString(36).substring(2, 6).toUpperCase();
    currentLobby = lobbyCode;
    isHost = true;
    currentPlayerId = `player_${Date.now()}`;
    lobbyRef = ref(db, `lobbies/${currentLobby}`);
    const initialPlayer = { name: myName, deck: myDeckId, hp: 100 };
    set(lobbyRef, { host: currentPlayerId, players: { [currentPlayerId]: initialPlayer }, gameState: { status: 'lobby' } });
    ui.elements.lobbyCodeInput.value = lobbyCode;
    ui.elements.lobbyCodeInput.disabled = true;
    ui.elements.joinLobbyBtn.disabled = true;
    ui.elements.createLobbyBtn.disabled = true;
    ui.elements.startGameBtn.style.display = 'block';
    listenToLobbyChanges();
}

function joinLobby() {
    const lobbyCode = ui.elements.lobbyCodeInput.value.trim().toUpperCase();
    if (lobbyCode.length !== 4) return alert('Invalid lobby code.');
    const tempLobbyRef = ref(db, `lobbies/${lobbyCode}`);
    get(tempLobbyRef).then(snapshot => {
        const data = snapshot.val();
        if (snapshot.exists() && Object.keys(data.players).length < 4) {
            currentLobby = lobbyCode;
            lobbyRef = tempLobbyRef;
            currentPlayerId = `player_${Date.now()}`;
            const newPlayerRef = ref(db, `lobbies/${lobbyCode}/players/${currentPlayerId}`);
            set(newPlayerRef, { name: myName, deck: myDeckId, hp: 100 });
            listenToLobbyChanges();
        } else {
            alert('Lobby does not exist or is full.');
        }
    });
}

function listenToLobbyChanges() {
    onValue(lobbyRef, (snapshot) => {
        if (!snapshot.exists()) return; 
        
        lobbyData = snapshot.val();
        const gameState = lobbyData.gameState;
        const battleData = lobbyData.battle;

        updatePlayerList(lobbyData.players);

        if (isHost && hostTurnTimer) {
            clearInterval(hostTurnTimer);
            hostTurnTimer = null;
        }

        if (gameState.status === 'map_vote') {
            if (isHost && !lobbyData.map) set(child(lobbyRef, 'map'), generateMap());
            
            if (lobbyData.map) {
                ui.showGameScreen('map');
                ui.renderMap(lobbyData.map, gameState, castVote);

                // --- NEW ATOMIC UPDATE LOGIC (HOST ONLY) ---
                if (isHost && lobbyData.votes) {
                    const playerCount = Object.keys(lobbyData.players).length;
                    if (Object.keys(lobbyData.votes).length === playerCount) {
                        // 1. Tally votes to get the destination
                        const nextNodeId = performTally(lobbyData.votes);

                        // 2. Prepare the new battle state object
                        const newBattleState = createBattleState(nextNodeId, lobbyData);

                        // 3. Prepare a single, multi-path update object
                        const updates = {};
                        updates[`/battle`] = newBattleState;
                        updates[`/gameState/status`] = 'battle';
                        updates[`/gameState/currentNodeId`] = nextNodeId;
                        updates[`/votes`] = null; // This deletes the votes path

                        // 4. Execute the atomic update on the entire lobby
                        update(lobbyRef, updates);
                    }
                }
            }
        } else if (gameState.status === 'battle') {
            if (!battleData) return;
            battleRef = ref(db, `lobbies/${currentLobby}/battle`);
            ui.showGameScreen('battle');

            const myDeckId = battleData.players[currentPlayerId]?.deckId;
            ui.updateBattleUI(battleData, currentPlayerId, myDeckId);
            ui.updateTimer(battleData.phaseEndTime);

            if (isHost) {
                const allPlayersWaiting = Object.values(battleData.players)
                    .filter(p => p.hp > 0)
                    .every(p => p.status === 'waiting');

                if (battleData.phase === 'PLAYER_TURN' && allPlayersWaiting) {
                    startEnemyTurn();
                } else if (battleData.phase === 'PLAYER_TURN') {
                    hostTurnTimer = setInterval(() => {
                        if (Date.now() > battleData.phaseEndTime) {
                            forceEndTurn(battleData);
                            clearInterval(hostTurnTimer);
                            hostTurnTimer = null;
                        }
                    }, 1000);
                }
            }
        } else if (gameState.status === 'victory' || gameState.status === 'defeat') {
            ui.showGameScreen('end_battle', gameState.status, isHost);
        }
    });
}


function updatePlayerList(players) {
    ui.elements.playerList.innerHTML = '';
    for (const pId in players) {
        const player = players[pId];
        ui.elements.playerList.innerHTML += `<p>${player.name} (Deck: ${decks[player.deck].name})</p>`;
    }
}

function castVote(nodeId) {
    const voteRef = ref(db, `lobbies/${currentLobby}/votes/${currentPlayerId}`);
    set(voteRef, nodeId);
    ui.elements.votingStatus.textContent = `You voted for ${nodeId}. Waiting for other players...`;
    document.querySelectorAll('.votable').forEach(el => el.onclick = null);
}

function performTally(votes) {
    const voteCounts = {};
    Object.values(votes).forEach(nodeId => { voteCounts[nodeId] = (voteCounts[nodeId] || 0) + 1; });
    let maxVotes = 0, winners = [];
    for (const nodeId in voteCounts) {
        if (voteCounts[nodeId] > maxVotes) { maxVotes = voteCounts[nodeId]; winners = [nodeId]; } 
        else if (voteCounts[nodeId] === maxVotes) { winners.push(nodeId); }
    }
    return winners[Math.floor(Math.random() * winners.length)];
}

function createBattleState(nodeId, currentLobbyData) {
    const monsterType = nodeId === 'node-boss' ? 'boss' : Object.keys(monsters).filter(m => m !== 'boss')[Math.floor(Math.random() * 2)];
    const battleState = {
        phase: 'PLAYER_TURN',
        phaseEndTime: Date.now() + 25000,
        monster: { type: monsterType, hp: monsters[monsterType].hp },
        log: {}, players: {}, turn: 1,
    };
    for (const pId in currentLobbyData.players) {
        const player = currentLobbyData.players[pId];
        if (player.hp > 0) {
            const deckConfig = decks[player.deck];
            battleState.players[pId] = {
                name: player.name, hp: player.hp, maxHp: 100, money: 100,
                deck: shuffleDeck(createDeck(deckConfig)),
                deckId: player.deck,
                hand: [], sum: 0, bet: 0, status: 'needs_bet',
            };
        }
    }
    return battleState;
}



function logBattleMessage(message) {
    const logRef = ref(db, `lobbies/${currentLobby}/battle/log`);
    const newLogEntryRef = push(logRef);
    set(newLogEntryRef, { message, timestamp: Date.now() });
}

// This function is now standalone and correct.
function forceEndTurn(battleData) {
    if (!isHost) return;
    const updates = {};
    Object.keys(battleData.players).forEach(pId => {
        const p = battleData.players[pId];
        if (p.hp > 0 && (p.status === 'needs_bet' || p.status === 'acting')) {
            updates[`/players/${pId}/status`] = 'waiting';
        }
    });
    update(battleRef, updates);
}

// placeBet is now correct.
function placeBet() {
    const betValue = parseInt(ui.elements.betInput.value, 10);
    const playerBattleRef = ref(db, `lobbies/${currentLobby}/battle/players/${currentPlayerId}`);
    runTransaction(playerBattleRef, (pData) => {
        if (pData && pData.status === 'needs_bet') {
            if (isNaN(betValue) || betValue < 0 || betValue > pData.money) { return; }
            pData.bet = betValue;
            pData.money -= betValue;
            pData.status = 'acting';
        }
        return pData;
    });
}

// drawCard is now correct.
function drawCard() {
    const playerRef = ref(db, `lobbies/${currentLobby}/battle/players/${currentPlayerId}`);
    runTransaction(playerRef, (pData) => {
        if (pData && pData.status === 'acting') {
            pData.status = 'waiting';
            if (!pData.deck || pData.deck.length === 0) {
                pData.deck = shuffleDeck(createDeck(decks[pData.deckId]));
            }
            const drawnCard = pData.deck.pop();
            pData.hand = pData.hand ? [...pData.hand, drawnCard] : [drawnCard];
            pData.sum += drawnCard;
            logBattleMessage(`${pData.name} drew a card.`);
            const playerDeckConfig = decks[pData.deckId];
            if (pData.sum > playerDeckConfig.jackpot) {
                logBattleMessage(`${pData.name} busted!`);
                pData.hand = [];
                pData.sum = 0;
                pData.bet = 0;
            }
        }
        return pData;
    });
}

// performAttack is now correct.
function performAttack() {
    const playerRef = ref(db, `lobbies/${currentLobby}/battle/players/${currentPlayerId}`);
    runTransaction(playerRef, (pData) => {
        if (pData && pData.status === 'acting') {
            pData.status = 'waiting';
            const playerDeckConfig = decks[pData.deckId];
            const winnings = pData.bet * playerDeckConfig.g(pData.sum);
            const damage = Math.floor(winnings);
            logBattleMessage(`${pData.name} attacks for ${damage} damage!`);
            if (damage > 0) {
                const monsterHpRef = ref(db, `lobbies/${currentLobby}/battle/monster/hp`);
                runTransaction(monsterHpRef, (hp) => (hp || 0) - damage);
            }
            pData.money = Math.floor(pData.money + winnings);
            pData.hand = [];
            pData.sum = 0;
            pData.bet = 0;
        }
        return pData;
    });
}

// startEnemyTurn is now correct.
function startEnemyTurn() {
    get(battleRef).then(snapshot => {
        const battleData = snapshot.val();
        if (!isHost || !battleData || battleData.phase === 'ENEMY_TURN') return;
        update(battleRef, { phase: 'ENEMY_TURN', phaseEndTime: Date.now() + 3000 });
        setTimeout(() => {
            const damageUpdates = {};
            const lobbyPlayerUpdates = {};
            let livingPlayersCount = 0;
            const monster = monsters[battleData.monster.type];
            for (const pId in battleData.players) {
                const pData = battleData.players[pId];
                if (pData.hp > 0) {
                    if (Math.random() < monster.hitChance) {
                        const newHp = Math.max(0, pData.hp - monster.attack);
                        damageUpdates[`/players/${pId}/hp`] = newHp;
                        lobbyPlayerUpdates[`/players/${pId}/hp`] = newHp;
                        logBattleMessage(`${monster.name} hits ${pData.name} for ${monster.attack} damage!`);
                    } else {
                        logBattleMessage(`${monster.name} attacks ${pData.name} but MISSES!`);
                    }
                    if ((damageUpdates[`/players/${pId}/hp`] ?? pData.hp) > 0) {
                        livingPlayersCount++;
                    }
                }
            }
            update(lobbyRef, lobbyPlayerUpdates);
            update(battleRef, damageUpdates);
            if (livingPlayersCount === 0) {
                setTimeout(() => set(child(lobbyRef, 'gameState/status'), 'defeat'), 1000);
                return;
            }
            get(child(battleRef, 'monster/hp')).then(hpSnap => {
                if (hpSnap.val() <= 0) {
                    set(child(lobbyRef, 'gameState/status'), 'victory');
                    return;
                }
                setTimeout(() => {
                    const nextTurnUpdates = {};
                    nextTurnUpdates['phase'] = 'PLAYER_TURN';
                    nextTurnUpdates['phaseEndTime'] = Date.now() + 25000;
                    nextTurnUpdates['turn'] = (battleData.turn || 1) + 1;
                    for (const pId in battleData.players) {
                        const pData = battleData.players[pId];
                        if (pData.hp > 0) {
                            nextTurnUpdates[`players/${pId}/status`] = (pData.bet === 0) ? 'needs_bet' : 'acting';
                        }
                    }
                    update(battleRef, nextTurnUpdates);
                }, 2000);
            });
        }, 1000);
    });
}

// returnToMap is now correct.
function returnToMap() {
    if (!isHost) return;
    const gameStateRef = child(lobbyRef, 'gameState');
    runTransaction(gameStateRef, (gs) => {
        if (gs) {
            gs.status = 'map_vote';
            if (!gs.clearedNodes) gs.clearedNodes = [];
            if (!gs.clearedNodes.includes(gs.currentNodeId)) {
                gs.clearedNodes.push(gs.currentNodeId);
            }
        }
        return gs;
    }).then(() => {
        remove(battleRef);
    });
}