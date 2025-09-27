import { decks } from './config.js';
import * as ui from './ui.js';
import { generateMap, createDeck, shuffleDeck } from './game-logic.js';

// Import Firebase 9 modular functions
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getDatabase, ref, set, onValue, get, child, update, remove, runTransaction } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";

let db, currentLobby, currentPlayerId, isHost, myName, myDeckId, lobbyData;
let lobbyRef, battleRef; // Keep references handy

export function init(firebaseConfig, playerName, deckId) {
    const app = initializeApp(firebaseConfig); // Initialize Firebase App
    db = getDatabase(app); // Get a reference to the database service
    
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
    
    set(lobbyRef, {
        host: currentPlayerId,
        players: { [currentPlayerId]: initialPlayer },
        gameState: { status: 'lobby' }
    });

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
        
        updatePlayerList(lobbyData.players);

        const status = lobbyData.gameState.status;

        if (status === 'map_vote') {
            if (isHost && !lobbyData.map) set(child(lobbyRef, 'map'), generateMap());
            
            if (lobbyData.map) {
                ui.showGameScreen('map');
                ui.renderMap(lobbyData.map, lobbyData.gameState, castVote);
                listenForVotes();
            }
        } else if (status === 'battle') {
            battleRef = ref(db, `lobbies/${currentLobby}/battle`);
            ui.showGameScreen('battle');
            listenToBattleChanges();
        } else if (status === 'victory' || status === 'defeat') {
            ui.showGameScreen('end_battle', status, isHost);
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

function listenForVotes() {
     const votesRef = ref(db, `lobbies/${currentLobby}/votes`);
     onValue(votesRef, (snapshot) => {
        if (!isHost || !snapshot.exists()) return;

        const votes = snapshot.val();
        const playerCount = Object.keys(lobbyData.players).length;

        if (votes && Object.keys(votes).length === playerCount) {
            tallyVotes(votes);
            remove(votesRef); // Clean up votes
        }
     });
}

function tallyVotes(votes) {
    const voteCounts = {};
    Object.values(votes).forEach(nodeId => { voteCounts[nodeId] = (voteCounts[nodeId] || 0) + 1; });
    let maxVotes = 0, winners = [];
    for (const nodeId in voteCounts) {
        if (voteCounts[nodeId] > maxVotes) { maxVotes = voteCounts[nodeId]; winners = [nodeId]; } 
        else if (voteCounts[nodeId] === maxVotes) { winners.push(nodeId); }
    }
    const nextNode = winners[Math.floor(Math.random() * winners.length)];
    
    update(child(lobbyRef, 'gameState'), { currentNodeId: nextNode });
    initializeBattle(nextNode);
}

// MODIFIED: Adds deckId to the battle state to prevent error
function initializeBattle(nodeId) {
    if (!isHost) return;
    battleRef = ref(db, `lobbies/${currentLobby}/battle`);
    const battleState = {
        phase: 'PLAYER_TURN',
        phaseEndTime: Date.now() + 25000,
        monster: { hp: 150, maxHp: 150, attack: 10 },
        players: {},
        turn: 1,
    };
    for (const pId in lobbyData.players) {
        const player = lobbyData.players[pId];
        if (player.hp > 0) {
            const deckConfig = decks[player.deck];
            battleState.players[pId] = {
                name: player.name, hp: player.hp, maxHp: 100, money: 100,
                deck: shuffleDeck(createDeck(deckConfig)),
                deckId: player.deck,
                hand: [], sum: 0, bet: 0, status: 'needs_bet', // Correct initial state
            };
        }
    }
    set(battleRef, battleState);
    set(child(lobbyRef, 'gameState/status'), 'battle');
}


// MODIFIED: listenToBattleChanges now only checks for timer expiration
function listenToBattleChanges() {
    onValue(battleRef, (snapshot) => {
        const battleData = snapshot.val();
        if (!battleData) return;

        const myDeckId = battleData.players[currentPlayerId]?.deckId;
        ui.updateBattleUI(battleData, currentPlayerId, myDeckId);
        ui.updateTimer(battleData.phaseEndTime);

        if (isHost) {
            // Check if all active players are done with their turn
            const allPlayersWaiting = Object.values(battleData.players)
                .filter(p => p.hp > 0) // Only consider living players
                .every(p => p.status === 'waiting');

            if (battleData.phase === 'PLAYER_TURN' && allPlayersWaiting) {
                startEnemyTurn(); // All actions are done, start enemy turn
            } else {
                managePhaseTransitions(battleData); // Otherwise, check the timer
            }
        }
    });
}


// MODIFIED: Timeout logic updated for the new turn flow
function managePhaseTransitions(battleData) {
    const timeNow = Date.now();
    if (timeNow < battleData.phaseEndTime) return;

    if (battleData.phase === 'PLAYER_TURN') {
        const updates = {};
        let needsEnemyTurn = false;
        Object.keys(battleData.players).forEach(pId => {
            const p = battleData.players[pId];
            if (p.status === 'needs_bet') {
                // Timed out before betting. Stay in 'needs_bet' state for next turn.
            } else if (p.status === 'acting') {
                // Timed out while able to act. Force an attack with current sum.
                const playerDeckConfig = decks[p.deckId];
                const winnings = p.bet * playerDeckConfig.g(p.sum);
                const damage = Math.floor(winnings);
                
                if (damage > 0) {
                    const monsterHpRef = ref(db, `lobbies/${currentLobby}/battle/monster/hp`);
                    runTransaction(monsterHpRef, (hp) => (hp || 0) - damage);
                }

                updates[`/players/${pId}/money`] = Math.floor(p.money + winnings);
                updates[`/players/${pId}/status`] = 'needs_bet'; // Attacked, so must bet next turn.
                updates[`/players/${pId}/hand`] = [];
                updates[`/players/${pId}/sum`] = 0;
                updates[`/players/${pId}/bet`] = 0;
                needsEnemyTurn = true;
            }
        });

        update(battleRef, updates);

        // Only start enemy turn if an action was forced.
        if (needsEnemyTurn) {
             startEnemyTurn(battleData);
        } else {
            // If no action was forced, just reset the timer for the next turn
            const nextTurnUpdates = {
                phase: 'PLAYER_TURN',
                phaseEndTime: Date.now() + 25000,
                turn: (battleData.turn || 1) + 1,
            };
            update(battleRef, nextTurnUpdates);
        }
    }
}


// MODIFIED: Just changes status, does not end turn.
function placeBet() {
    const betValue = parseInt(ui.elements.betInput.value, 10);
    const playerBattleRef = ref(db, `lobbies/${currentLobby}/battle/players/${currentPlayerId}`);
    runTransaction(playerBattleRef, (pData) => {
        if (pData && pData.status === 'needs_bet') {
            if (isNaN(betValue) || betValue < 0 || betValue > pData.money) { return; }
            pData.bet = betValue;
            pData.money -= betValue;
            pData.status = 'acting'; // Ready to Draw or Attack.
        }
        return pData;
    });
}

// MODIFIED: Sets status for the NEXT turn.
function drawCard() {
    const playerRef = ref(db, `lobbies/${currentLobby}/battle/players/${currentPlayerId}`);
    runTransaction(playerRef, (pData) => {
        if (pData && pData.status === 'acting') {
            // --- FIX: Immediately lock the player's state ---
            pData.status = 'waiting';
            // -----------------------------------------------

            if (!pData.deck || pData.deck.length === 0) {
                pData.deck = shuffleDeck(createDeck(decks[pData.deckId]));
            }
            const drawnCard = pData.deck.pop();
            pData.hand = pData.hand ? [...pData.hand, drawnCard] : [drawnCard];
            pData.sum += drawnCard;

            const playerDeckConfig = decks[pData.deckId];
            if (pData.sum > playerDeckConfig.jackpot) {
                // Busted. Status will be reset to 'needs_bet' by the enemy turn function.
                pData.hand = [];
                pData.sum = 0;
                pData.bet = 0;
            }
        }
        return pData;
    });
    // REMOVED: .then(() => ...) The listener now handles the turn change.
}

// MODIFIED: Sets status for the NEXT turn.
function performAttack() {
    const playerRef = ref(db, `lobbies/${currentLobby}/battle/players/${currentPlayerId}`);
    runTransaction(playerRef, (pData) => {
        if (pData && pData.status === 'acting') {
            // --- FIX: Immediately lock the player's state ---
            pData.status = 'waiting';
            // -----------------------------------------------

            const playerDeckConfig = decks[pData.deckId];
            const winnings = pData.bet * playerDeckConfig.g(pData.sum);
            const damage = Math.floor(winnings);

            if (damage > 0) {
                const monsterHpRef = ref(db, `lobbies/${currentLobby}/battle/monster/hp`);
                runTransaction(monsterHpRef, (hp) => (hp || 0) - damage);
            }
            
            pData.money = Math.floor(pData.money + winnings);
            // Attacked. Status will be reset to 'needs_bet' by the enemy turn function.
            pData.hand = [];
            pData.sum = 0;
            pData.bet = 0;
        }
        return pData;
    });
    // REMOVED: .then(() => ...) The listener now handles the turn change.
}


// MODIFIED: startEnemyTurn now doesn't reset player status.
function startEnemyTurn() {
    get(battleRef).then(snapshot => {
        const battleData = snapshot.val();
        if (!isHost || !battleData || battleData.phase === 'ENEMY_TURN') return;

        update(battleRef, { phase: 'ENEMY_TURN', phaseEndTime: Date.now() + 3000 });

        setTimeout(() => {
            const damageUpdates = {};
            const lobbyPlayerUpdates = {};
            let livingPlayersCount = 0;
            const enemyAttack = battleData.monster.attack;

            for (const pId in battleData.players) {
                const pData = battleData.players[pId];
                if (pData.hp > 0) {
                    const newHp = Math.max(0, pData.hp - enemyAttack);
                    damageUpdates[`/players/${pId}/hp`] = newHp;
                    lobbyPlayerUpdates[`/players/${pId}/hp`] = newHp;
                    if (newHp > 0) livingPlayersCount++;
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

                    // --- LOGIC TO RESET PLAYER STATUS FOR NEXT TURN ---
                    for (const pId in battleData.players) {
                        const pData = battleData.players[pId];
                        if (pData.hp > 0) {
                            // If bet is 0, they must have attacked or busted. Force a new bet.
                            // Otherwise, they drew successfully, so they can keep acting.
                            nextTurnUpdates[`players/${pId}/status`] = (pData.bet === 0) ? 'needs_bet' : 'acting';
                        }
                    }
                    // --------------------------------------------------

                    update(battleRef, nextTurnUpdates);
                }, 2000);
            });
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
    }).then(() => {
        remove(battleRef);
    });
}