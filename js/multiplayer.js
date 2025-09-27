import { decks, monsters } from './config.js';
import * as ui from './ui.js';
import { generateNewMap, createDeck, shuffleDeck } from './game-logic.js';
import * as engine from './battle-engine.js';

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getDatabase, ref, set, onValue, get, child, update, remove, runTransaction, push } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";

let db, currentLobby, currentPlayerId, isHost, myName, myDeckId, lobbyData;
let lobbyRef, battleRef;
let hostTurnTimer = null;

export function init(firebaseConfig, playerName, deckId) {
    const app = initializeApp(firebaseConfig);
    db = getDatabase(app);
    myName = playerName;
    myDeckId = deckId;
    ui.elements.createLobbyBtn.onclick = createLobby;
    ui.elements.joinLobbyBtn.onclick = joinLobby;
    ui.elements.startGameBtn.onclick = () => isHost && set(ref(db, `lobbies/${currentLobby}/gameState/status`), 'map_vote');
    ui.elements.chargeBtn.onclick = chargeAttack;
    ui.elements.drawCardBtn.onclick = drawCard;
    ui.elements.attackBtn.onclick = performAttack;
    ui.elements.returnToMapBtn.onclick = () => isHost && returnToMap();
    ui.elements.deckSelect.onchange = () => {
        if (lobbyData && lobbyData.gameState.status === 'lobby') {
            const playerRef = ref(db, `lobbies/${currentLobby}/players/${currentPlayerId}/deck`);
            set(playerRef, ui.elements.deckSelect.value);
        }
    };
    ui.elements.defeatContinueBtn.onclick = () => {
        if (isHost) {
            const updates = { '/battle': null, '/map': null, '/votes': null, '/gameState/status': 'lobby' };
            Object.keys(lobbyData.players).forEach(pId => {
                updates[`/players/${pId}/hp`] = 100;
            });
            update(lobbyRef, updates);
        }
    };
}

function createLobby() {
    const lobbyCode = Math.random().toString(36).substring(2, 6).toUpperCase();
    currentLobby = lobbyCode; isHost = true;
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
            currentLobby = lobbyCode; lobbyRef = tempLobbyRef;
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
        const { gameState, battle: battleData, players } = lobbyData;
        
        if (isHost && hostTurnTimer) {
            clearInterval(hostTurnTimer); hostTurnTimer = null;
        }

        if (gameState.status === 'lobby') {
            ui.showScreen(ui.elements.multiplayerLobby);
            updatePlayerList(players);
        }
        else if (gameState.status === 'map_vote') {
            if (isHost && !lobbyData.map) set(child(lobbyRef, 'map'), generateNewMap());
            if (lobbyData.map) {
                ui.showGameScreen('map');
                ui.renderMap(lobbyData.map, gameState, castVote);
                ui.updatePartyStats(players);
                if (isHost && lobbyData.votes) {
                    if (Object.keys(lobbyData.votes).length === Object.keys(players).length) {
                        const nextNodeId = performTally(lobbyData.votes);
                        const nodeType = lobbyData.map.nodes[nextNodeId].type;
                        switch (nodeType) {
                            case 'Normal Battle':
                            case 'Elite Battle':
                            case 'Boss':
                                const newBattleState = createBattleState(nodeType, lobbyData);
                                const updates = {
                                    [`/battle`]: newBattleState,
                                    [`/gameState/status`]: 'battle',
                                    [`/gameState/currentNodeId`]: nextNodeId,
                                    [`/votes`]: null
                                };
                                update(lobbyRef, updates);
                                break;
                            case 'Rest Site':
                                handleRestSiteMultiplayer(nextNodeId);
                                break;
                            case 'Shop':
                            case 'Unknown Event':
                                handlePlaceholderNodeMultiplayer(nextNodeId, nodeType);
                                break;
                        }
                    }
                }
            }
        } else if (gameState.status === 'battle') {
            // --- THIS IS THE CRITICAL FIX ---
            // If the status is 'battle' but the battle object hasn't arrived yet,
            // do nothing and wait for the next update.
            if (!battleData || !battleData.players || !battleData.monsters) return;
            // ------------------------------------
            
            battleRef = ref(db, `lobbies/${currentLobby}/battle`);
            ui.showGameScreen('battle');
            const myDeckId = battleData.players[currentPlayerId]?.deckId;
            ui.updateBattleUI(battleData, currentPlayerId, myDeckId);
            ui.updateTimer(battleData.phaseEndTime);

            if (isHost) {
                if (battleData.monster.hp <= 0) {
                    set(child(lobbyRef, 'gameState/status'), 'victory'); return;
                }
                const livingPlayers = Object.values(battleData.players).filter(p => p.hp > 0);
                if (livingPlayers.length === 0) {
                    set(child(lobbyRef, 'gameState/status'), 'defeat'); return;
                }
                const allPlayersWaiting = livingPlayers.every(p => p.status === 'waiting');
                if (battleData.phase === 'PLAYER_TURN' && allPlayersWaiting) {
                    startEnemyTurn();
                } else if (battleData.phase === 'PLAYER_TURN') {
                    hostTurnTimer = setInterval(() => {
                        get(battleRef).then(currentSnapshot => {
                            const currentBattleData = currentSnapshot.val();
                            if (currentBattleData && Date.now() > currentBattleData.phaseEndTime) {
                                forceEndTurn(currentBattleData);
                                clearInterval(hostTurnTimer);
                                hostTurnTimer = null;
                            }
                        });
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
        const deckName = decks[player.deck]?.name || 'Unknown Deck';
        ui.elements.playerList.innerHTML += `<p>${player.name} (Deck: ${deckName})</p>`;
    }
}

function castVote(nodeId) {
    const voteRef = ref(db, `lobbies/${currentLobby}/votes/${currentPlayerId}`);
    set(voteRef, nodeId);
    ui.elements.votingStatus.textContent = `You voted for ${nodeId}. Waiting...`;
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

function createBattleState(nodeType, currentLobbyData) {
    let monsterTier, monsterKey;
    if (nodeType === 'Boss') {
        monsterTier = 'boss'; monsterKey = 'nodeGuardian';
    } else if (nodeType === 'Elite Battle') {
        monsterTier = 'elite'; const eliteKeys = Object.keys(monsters.elite);
        monsterKey = eliteKeys[Math.floor(Math.random() * eliteKeys.length)];
    } else {
        monsterTier = 'normal'; const normalKeys = Object.keys(monsters.normal);
        monsterKey = normalKeys[Math.floor(Math.random() * normalKeys.length)];
    }
    const baseMonster = monsters[monsterTier][monsterKey];
    const livingPlayers = Object.values(currentLobbyData.players).filter(p => p.hp > 0).length;
    const battleState = {
        phase: 'PLAYER_TURN', phaseEndTime: Date.now() + 25000,
        monster: { tier: monsterTier, type: monsterKey, name: baseMonster.name, hp: baseMonster.hp * livingPlayers, },
        monsters: [{ tier: monsterTier, type: monsterKey, name: baseMonster.name, hp: baseMonster.hp * livingPlayers, id: `m_${Date.now()}` }],
        log: {}, players: {}, turn: 1,
    };
    for (const pId in currentLobbyData.players) {
        const player = currentLobbyData.players[pId];
        if (player.hp > 0) {
            const deckConfig = decks[player.deck];
            battleState.players[pId] = {
                name: player.name, hp: player.hp, maxHp: 100, mana: 20,
                deck: shuffleDeck(createDeck(deckConfig)),
                deckId: player.deck,
                hand: [], sum: 0, charge: 0, status: 'needs_bet',
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

function forceEndTurn(battleData) {
    if (!isHost) return;
    Object.keys(battleData.players).forEach(pId => {
        const pData = battleData.players[pId];
        if (pData.hp > 0 && (pData.status === 'needs_bet' || pData.status === 'acting')) {
            const playerRef = ref(db, `lobbies/${currentLobby}/battle/players/${pId}`);
            runTransaction(playerRef, (currentPData) => {
                if (currentPData && (currentPData.status === 'needs_bet' || currentPData.status === 'acting')) {
                    if (currentPData.status === 'needs_bet') {
                        currentPData.charge = 0;
                        const result = engine.handleAttack(currentPData);
                        result.logMessages.forEach(logBattleMessage);
                        return result.updatedPlayer;
                    } else {
                        currentPData.status = 'waiting';
                        logBattleMessage(`${currentPData.name}'s turn ended.`);
                    }
                }
                return currentPData;
            });
        }
    });
}

function chargeAttack() {
    const chargeValue = parseInt(ui.elements.manaInput.value, 10);
    const playerBattleRef = ref(db, `lobbies/${currentLobby}/battle/players/${currentPlayerId}`);
    runTransaction(playerBattleRef, (pData) => {
        if (pData && pData.hp > 0 && pData.status === 'needs_bet') {
            const result = engine.handleCharge(pData, chargeValue);
            return result.updatedPlayer || pData;
        }
        return pData;
    });
}

function drawCard() {
    const playerRef = ref(db, `lobbies/${currentLobby}/battle/players/${currentPlayerId}`);
    runTransaction(playerRef, (pData) => {
        if (pData && pData.hp > 0 && pData.status === 'acting') {
            pData.status = 'waiting';
            const result = engine.handleDraw(pData);
            result.logMessages.forEach(logBattleMessage);
            return result.updatedPlayer;
        }
        return pData;
    });
}

function performAttack() {
    const playerRef = ref(db, `lobbies/${currentLobby}/battle/players/${currentPlayerId}`);
    runTransaction(playerRef, (pData) => {
        if (pData && pData.hp > 0 && pData.status === 'acting') {
            pData.status = 'waiting';
            const result = engine.handleAttack(pData);
            result.logMessages.forEach(logBattleMessage);
            if (result.damageDealt > 0) {
                const monsterHpRef = ref(db, `lobbies/${currentLobby}/battle/monsters/0/hp`);
                runTransaction(monsterHpRef, (hp) => (hp || 0) - result.damageDealt);
            }
            return result.updatedPlayer;
        }
        return pData;
    });
}

function startEnemyTurn() {
    get(battleRef).then(snapshot => {
        const battleData = snapshot.val();
        if (!isHost || !battleData || battleData.phase === 'ENEMY_TURN') return;
        update(battleRef, { phase: 'ENEMY_TURN', phaseEndTime: Date.now() + 3000 });
        setTimeout(() => {
            const damageUpdates = {};
            const lobbyPlayerUpdates = {};
            const livingPlayers = Object.entries(battleData.players).filter(([id, data]) => data.hp > 0);
            if (livingPlayers.length === 0) return;
            const monster = battleData.monsters[0];
            const monsterStats = monsters[monster.tier][monster.type];
            const [targetPlayerId, targetPlayerData] = livingPlayers[Math.floor(Math.random() * livingPlayers.length)];
            if (Math.random() < monsterStats.hitChance) {
                const newHp = Math.max(0, targetPlayerData.hp - monsterStats.attack);
                damageUpdates[`/players/${targetPlayerId}/hp`] = newHp;
                lobbyPlayerUpdates[`/players/${targetPlayerId}/hp`] = newHp;
                logBattleMessage(`${monster.name} hits ${targetPlayerData.name} for ${monsterStats.attack} damage!`);
                if (newHp <= 0) {
                    logBattleMessage(`${targetPlayerData.name} has been defeated!`);
                }
            } else {
                logBattleMessage(`${monster.name} attacks ${targetPlayerData.name} but MISSES!`);
            }
            if (Object.keys(lobbyPlayerUpdates).length > 0) update(lobbyRef, lobbyPlayerUpdates);
            if (Object.keys(damageUpdates).length > 0) update(battleRef, damageUpdates);
            setTimeout(() => {
                get(battleRef).then(updatedSnapshot => {
                    const updatedBattleData = updatedSnapshot.val();
                    if(!updatedBattleData) return;
                    const nextTurnUpdates = {};
                    nextTurnUpdates['phase'] = 'PLAYER_TURN';
                    nextTurnUpdates['phaseEndTime'] = Date.now() + 25000;
                    nextTurnUpdates['turn'] = (updatedBattleData.turn || 1) + 1;
                    for (const pId in updatedBattleData.players) {
                        const pData = updatedBattleData.players[pId];
                        if (pData.hp > 0) {
                            if (pData.charge === 0) {
                                nextTurnUpdates[`players/${pId}/status`] = 'needs_bet';
                            } else {
                                nextTurnUpdates[`players/${pId}/status`] = 'acting';
                            }
                        }
                    }
                    update(battleRef, nextTurnUpdates);
                });
            }, 2000);
        }, 1000);
    });
}

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
    }).then(() => { remove(battleRef); });
}