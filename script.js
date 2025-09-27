const firebaseConfig = {
  apiKey: "AIzaSyA74kVesCebxBsR9veng56MpxqvTBZ6618",
  authDomain: "bring-the-heat-3ea0d.firebaseapp.com",
  databaseURL: "https://bring-the-heat-3ea0d-default-rtdb.firebaseio.com",
  projectId: "bring-the-heat-3ea0d",
  storageBucket: "bring-the-heat-3ea0d.firebasestorage.app",
  messagingSenderId: "125412613431",
  appId: "1:125412613431:web:1cc0c3d807380f8aaaceb2"
};

// --- Initialize Firebase ---
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// --- Global State ---
let currentLobby = null;
let currentPlayerId = null;
let isHost = false;
let battleTimerInterval = null;

// --- DOM Elements ---
const mainMenu = document.getElementById('main-menu');
const multiplayerLobby = document.getElementById('multiplayer-lobby');
const gameScreen = document.getElementById('game-screen');
const mapContainer = document.getElementById('map-container');
const battleContainer = document.getElementById('battle-container');
const endOfBattleScreen = document.getElementById('end-of-battle-screen');
const multiplayerBtn = document.getElementById('multiplayer-btn');
const createLobbyBtn = document.getElementById('create-lobby-btn');
const joinLobbyBtn = document.getElementById('join-lobby-btn');
const startGameBtn = document.getElementById('start-game-btn');
const playerNameInput = document.getElementById('player-name-input');
const lobbyCodeInput = document.getElementById('lobby-code-input');
const deckSelect = document.getElementById('deck-select');
const deckDetails = document.getElementById('deck-details');
const playerList = document.getElementById('player-list');
const mapNodes = document.getElementById('map-nodes');
const votingStatus = document.getElementById('voting-status');
const placeBetBtn = document.getElementById('place-bet-btn');
const drawCardBtn = document.getElementById('draw-card-btn');
const attackBtn = document.getElementById('attack-btn');
const returnToMapBtn = document.getElementById('return-to-map-btn');

// --- Decks Config ---
const decks = {
    deck1: { name: "Standard Issue", jackpot: 21, g: (sum) => 0.45 + (9.0 - 0.45) * (Math.exp(3.0 * (sum / 21)) - 1) / (Math.exp(3.0) - 1), cards: [{ v: 2, c: 4 }, { v: 3, c: 4 }, { v: 4, c: 4 }, { v: 5, c: 4 }, { v: 6, c: 4 }, { v: 7, c: 4 }, { v: 8, c: 4 }, { v: 9, c: 4 }, { v: 10, c: 4 }] },
    deck2: { name: "Pyramid Scheme", jackpot: 20, g: (sum) => 0.40 + (7.0 - 0.40) * (Math.exp(2.6 * (sum / 20)) - 1) / (Math.exp(2.6) - 1), cards: [{ v: 1, c: 1 }, { v: 2, c: 2 }, { v: 3, c: 3 }, { v: 4, c: 4 }, { v: 5, c: 5 }, { v: 6, c: 6 }, { v: 7, c: 7 }, { v: 8, c: 8 }] },
    deck3: { name: "High Stakes", jackpot: 10, g: (sum) => 0.30 + (14.0 - 0.30) * (Math.exp(4.2 * (sum / 9)) - 1) / (Math.exp(4.2) - 1), cards: [{ v: 1, c: 10 }, { v: 2, c: 10 }, { v: 3, c: 10 }, { v: 10, c: 6 }] },
    deck4: { name: "Low Roller", jackpot: 21, g: (sum) => 0.55 + (4.5 - 0.55) * (Math.exp(2.0 * (sum / 21)) - 1) / (Math.exp(2.0) - 1), cards: [{ v: 1, c: 12 }, { v: 2, c: 12 }, { v: 3, c: 12 }] }
};

// --- Event Listeners ---
multiplayerBtn.addEventListener('click', () => { showScreen(multiplayerLobby); updateDeckDetails(); });
deckSelect.addEventListener('change', updateDeckDetails);
createLobbyBtn.addEventListener('click', createLobby);
joinLobbyBtn.addEventListener('click', joinLobby);
startGameBtn.addEventListener('click', () => isHost && database.ref(`lobbies/${currentLobby}/gameState/status`).set('map_vote'));
placeBetBtn.addEventListener('click', placeBet);
drawCardBtn.addEventListener('click', drawCard);
attackBtn.addEventListener('click', performAttack);
returnToMapBtn.addEventListener('click', () => isHost && returnToMap());

// --- Core Game Flow ---

function listenToLobbyChanges() {
    const lobbyRef = database.ref(`lobbies/${currentLobby}`);
    lobbyRef.on('value', snapshot => {
        const lobbyData = snapshot.val();
        if (!lobbyData) return;

        updatePlayerList(lobbyData.players);

        const status = lobbyData.gameState.status;

        if (status === 'map_vote') {
            if (isHost && !lobbyData.map) generateAndStoreMap();
            if (lobbyData.map) {
                showGameScreen('map');
                renderMap(lobbyData.map, lobbyData.gameState);
                listenForVotes(lobbyData);
            }
        } else if (status === 'battle') {
            showGameScreen('battle');
            listenToBattleChanges();
        } else if (status === 'victory' || status === 'defeat') {
            showGameScreen('end_battle', status);
        }
    });
}

// --- Battle Logic ---

function initializeBattle(nodeId, playersData) {
    if (!isHost) return;

    const battleState = {
        phase: 'BETTING',
        phaseEndTime: Date.now() + 20000, // 20 seconds for betting
        monster: { hp: 150, maxHp: 150, attack: 10 },
        players: {},
        turn: 1,
    };

    for (const pId in playersData) {
        const player = playersData[pId];
        const deckConfig = decks[player.deck];
        battleState.players[pId] = {
            name: player.name,
            hp: player.hp,
            maxHp: 100,
            money: 100,
            deck: shuffleDeck(createDeck(deckConfig)),
            hand: [],
            sum: 0,
            bet: 0,
            status: 'betting', // 'betting', 'acting', 'waiting'
        };
    }

    database.ref(`lobbies/${currentLobby}/battle`).set(battleState);
    database.ref(`lobbies/${currentLobby}/gameState/status`).set('battle');
}


function listenToBattleChanges() {
    const battleRef = database.ref(`lobbies/${currentLobby}/battle`);
    battleRef.on('value', snapshot => {
        const battleData = snapshot.val();
        if (!battleData) return;
        updateBattleUI(battleData);

        if (isHost) {
            // Host is responsible for managing phase transitions
            const allPlayersWaiting = Object.values(battleData.players).every(p => p.status === 'waiting');
            if (battleData.phase === 'ACTION' && allPlayersWaiting) {
                // All players have acted, start enemy turn
                startEnemyTurn(battleData);
            }
        }
    });
}

function updateBattleUI(battleData) {
    // Update monster UI
    document.getElementById('monster-hp').textContent = battleData.monster.hp;
    document.getElementById('phase-title').textContent = battleData.phase.replace('_', ' ');

    // Timer
    if (battleTimerInterval) clearInterval(battleTimerInterval);
    battleTimerInterval = setInterval(() => {
        const timeLeft = Math.max(0, Math.round((battleData.phaseEndTime - Date.now()) / 1000));
        document.getElementById('turn-timer').textContent = timeLeft;
        if (timeLeft <= 0) clearInterval(battleTimerInterval);
    }, 500);

    // Update all player info cards
    const playerArea = document.getElementById('player-battle-area');
    playerArea.innerHTML = '';
    for (const pId in battleData.players) {
        const pData = battleData.players[pId];
        const playerCard = document.createElement('div');
        playerCard.className = 'player-battle-info';
        if (pId === currentPlayerId) playerCard.classList.add('is-self');
        playerCard.innerHTML = `
            <h4>${pData.name}</h4>
            <p>HP: ${pData.hp} / ${pData.maxHp}</p>
            <p>Status: ${pData.status}</p>
            <p>Bet: $${pData.bet}</p>
            <p>Sum: ${pData.sum}</p>
        `;
        playerArea.appendChild(playerCard);
    }

    // Update personal UI for the current player
    const myData = battleData.players[currentPlayerId];
    if (!myData) return;

    document.getElementById('player-money').textContent = myData.money;
    document.getElementById('player-sum').textContent = myData.sum;
    const deckConfig = decks[lobbyData.players[currentPlayerId].deck];
    const multiplier = myData.sum > 0 ? deckConfig.g(myData.sum).toFixed(2) : '1.00';
    document.getElementById('player-multiplier').textContent = multiplier;

    // Update hand
    const handContainer = document.getElementById('player-hand-container');
    handContainer.innerHTML = '';
    myData.hand?.forEach(cardValue => displayCard(cardValue, handContainer));

    // Update controls based on phase and player status
    const canBet = battleData.phase === 'BETTING' && myData.status === 'betting';
    const canAct = battleData.phase === 'ACTION' && myData.status === 'acting';
    
    document.getElementById('bet-input').style.display = canBet ? 'inline-block' : 'none';
    placeBetBtn.style.display = canBet ? 'inline-block' : 'none';
    drawCardBtn.style.display = canAct ? 'inline-block' : 'none';
    attackBtn.style.display = canAct ? 'inline-block' : 'none';
}


function placeBet() {
    const betValue = parseInt(document.getElementById('bet-input').value, 10);
    const myMoney = parseInt(document.getElementById('player-money').textContent, 10);
    if (isNaN(betValue) || betValue <= 0 || betValue > myMoney) {
        alert('Invalid bet amount.');
        return;
    }

    const playerStatusRef = database.ref(`lobbies/${currentLobby}/battle/players/${currentPlayerId}`);
    playerStatusRef.update({
        bet: betValue,
        money: myMoney - betValue,
        status: 'acting'
    });

    // Host checks if all players have bet to move to the next phase
    if (isHost) {
        const battleRef = database.ref(`lobbies/${currentLobby}/battle`);
        battleRef.once('value', snapshot => {
            const players = snapshot.val().players;
            const allReady = Object.values(players).every(p => p.status === 'acting');
            if (allReady) {
                battleRef.update({
                    phase: 'ACTION',
                    phaseEndTime: Date.now() + 15000,
                });
            }
        });
    }
}

function drawCard() {
    const playerRef = database.ref(`lobbies/${currentLobby}/battle/players/${currentPlayerId}`);
    playerRef.transaction(pData => {
        if (pData) {
            if (pData.deck.length === 0) {
                // Reshuffle logic can be added here
                alert("Deck is empty!");
                return pData;
            }
            const drawnCard = pData.deck.pop();
            pData.hand = pData.hand ? [...pData.hand, drawnCard] : [drawnCard];
            pData.sum += drawnCard;

            // Check for bust
            const deckConfig = decks[lobbyData.players[currentPlayerId].deck];
            if (pData.sum > deckConfig.jackpot) {
                // BUST!
                pData.status = 'waiting'; // End turn
                pData.hand = [];
                pData.sum = 0;
                pData.bet = 0;
            }
        }
        return pData;
    });
}

function performAttack() {
    const playerRef = database.ref(`lobbies/${currentLobby}/battle/players/${currentPlayerId}`);
    playerRef.once('value', snapshot => {
        const pData = snapshot.val();
        if (pData.sum === 0) {
            alert("You can't attack with a sum of 0. Draw a card first!");
            return;
        }

        const deckConfig = decks[lobbyData.players[currentPlayerId].deck];
        let damage = 0;
        let winnings = 0;
        if (pData.sum === deckConfig.jackpot) {
            // Jackpot win
            winnings = pData.bet * deckConfig.g(pData.sum);
        } else {
            // Normal win
            winnings = pData.bet * deckConfig.g(pData.sum);
        }
        damage = Math.floor(winnings);

        // Deal damage to monster
        database.ref(`lobbies/${currentLobby}/battle/monster/hp`).transaction(hp => (hp - damage));
        
        // Update player state to waiting
        playerRef.update({
            status: 'waiting',
            hand: [],
            sum: 0,
            money: pData.money + winnings,
            bet: 0,
        });

        // Check for victory
        if(isHost) {
            database.ref(`lobbies/${currentLobby}/battle/monster/hp`).once('value', hpSnap => {
                if (hpSnap.val() <= 0) {
                    database.ref(`lobbies/${currentLobby}/gameState`).update({ status: 'victory' });
                }
            });
        }
    });
}


function startEnemyTurn(battleData) {
    if (!isHost) return;

    const updates = {};
    const enemyAttack = battleData.monster.attack;
    let livingPlayers = 0;
    
    // Calculate damage
    for (const pId in battleData.players) {
        const pData = battleData.players[pId];
        if (pData.hp > 0) {
            const newHp = Math.max(0, pData.hp - enemyAttack);
            updates[`/battle/players/${pId}/hp`] = newHp;
            updates[`/players/${pId}/hp`] = newHp; // Persist HP outside of battle
            if (newHp > 0) livingPlayers++;
        }
    }
    
    updates['/battle/phase'] = 'ENEMY_TURN';
    updates['/battle/phaseEndTime'] = Date.now() + 3000;
    database.ref(`lobbies/${currentLobby}`).update(updates);

    // Check for defeat
    if (livingPlayers === 0) {
        setTimeout(() => database.ref(`lobbies/${currentLobby}/gameState/status`).set('defeat'), 2000);
        return;
    }

    // Schedule next turn
    setTimeout(() => {
        const nextTurnUpdates = {
            '/battle/phase': 'BETTING',
            '/battle/phaseEndTime': Date.now() + 20000,
            '/battle/turn': battleData.turn + 1,
        };
        for (const pId in battleData.players) {
            if (battleData.players[pId].hp > 0) {
                 nextTurnUpdates[`/battle/players/${pId}/status`] = 'betting';
            }
        }
        database.ref(`lobbies/${currentLobby}`).update(nextTurnUpdates);
    }, 3000); // Wait for enemy attack animation/text
}

function returnToMap() {
    if (!isHost) return;
    const lobbyRef = database.ref(`lobbies/${currentLobby}`);
    lobbyRef.once('value', snapshot => {
        const gs = snapshot.val().gameState;
        const updates = {
            'gameState/status': 'map_vote',
            'gameState/currentNodeId': gs.currentNodeId,
            'gameState/clearedNodes': [...(gs.clearedNodes || []), gs.currentNodeId]
        };
        lobbyRef.update(updates);
        lobbyRef.child('battle').remove(); // Clean up battle data
    });
}


// --- Utility & UI Functions ---

function showScreen(screenElement) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    screenElement.classList.add('active');
}

function showGameScreen(mode, result) {
    showScreen(gameScreen);
    mapContainer.classList.add('hidden');
    battleContainer.classList.add('hidden');
    endOfBattleScreen.classList.add('hidden');

    if (mode === 'map') mapContainer.classList.remove('hidden');
    if (mode === 'battle') battleContainer.classList.remove('hidden');
    if (mode === 'end_battle') {
        document.getElementById('battle-result-title').textContent = result === 'victory' ? 'Victory!' : 'Defeat!';
        document.getElementById('battle-result-text').textContent = result === 'victory' ? 'The monster has been vanquished.' : 'Your party has fallen.';
        returnToMapBtn.style.display = isHost ? 'block' : 'none';
        endOfBattleScreen.classList.remove('hidden');
    }
}

function displayCard(value, container) {
    const cardEl = document.createElement('div');
    cardEl.className = 'card';
    cardEl.textContent = value;
    cardEl.dataset.value = value;
    container.appendChild(cardEl);
}

function createDeck(deckConfig) {
    const deck = [];
    deckConfig.cards.forEach(cardInfo => {
        for (let i = 0; i < cardInfo.c; i++) {
            deck.push(cardInfo.v);
        }
    });
    return deck;
}

function shuffleDeck(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

// --- Placeholder for original lobby/map functions ---
// (No changes were made to these functions from the previous version)
function updateDeckDetails() { /* ... */ }
function validatePlayerName() { /* ... */ }
function createLobby() { /* ... */ }
function joinLobby() { /* ... */ }
function updatePlayerList(players) { /* ... */ }
function generateAndStoreMap() { /* ... */ }
function renderMap(mapData, gameState) { /* ... */ }
function determineVotableNodes(mapData, gameState) { /* ... */ }
function castVote(nodeId) { /* ... */ }
function listenForVotes(lobbyData) { /* ... */ }
function tallyVotes(votes) { /* ... */ }
function generateLobbyCode() { return Math.random().toString(36).substring(2, 6).toUpperCase(); }


// --- Functions from previous version (to be included) ---
// Note: You need to copy the functions from the previous response here.
// For brevity, they are listed by name.
// Make sure to define 'lobbyData' where it's used if it's not globally available.
let lobbyData = {}; // Temp definition
function updateDeckDetails() {
    const selectedDeck = decks[deckSelect.value];
    let cardList = selectedDeck.cards.map(card => `<li>Value ${card.v}: ${card.c} cards</li>`).join('');
    deckDetails.innerHTML = `
        <p><strong>Jackpot:</strong> ${selectedDeck.jackpot}</p>
        <ul>${cardList}</ul>
    `;
}

function validatePlayerName() {
    const playerName = playerNameInput.value.trim();
    if (!playerName) {
        alert('Please enter a name.');
        return null;
    }
    return playerName;
}

function createLobby() {
    const playerName = validatePlayerName();
    if (!playerName) return;

    const lobbyCode = generateLobbyCode();
    currentLobby = lobbyCode;
    isHost = true;
    currentPlayerId = `player_${Date.now()}`;

    const lobbyRef = database.ref(`lobbies/${currentLobby}`);
    lobbyRef.set({
        host: currentPlayerId,
        players: {
            [currentPlayerId]: { name: playerName, deck: deckSelect.value, hp: 100 }
        },
        gameState: { status: 'lobby' }
    });
    
    lobbyData = { players: { [currentPlayerId]: { name: playerName, deck: deckSelect.value, hp: 100 } } }; // init lobbyData

    lobbyCodeInput.value = lobbyCode;
    lobbyCodeInput.disabled = true;
    joinLobbyBtn.disabled = true;
    createLobbyBtn.disabled = true;
    startGameBtn.style.display = 'block';

    listenToLobbyChanges();
}

function joinLobby() {
    const playerName = validatePlayerName();
    if (!playerName) return;

    const lobbyCode = lobbyCodeInput.value.trim().toUpperCase();
    if (lobbyCode.length === 4) {
        const lobbyRef = database.ref(`lobbies/${lobbyCode}`);
        lobbyRef.once('value', snapshot => {
            const data = snapshot.val();
            if (snapshot.exists() && Object.keys(data.players).length < 4) {
                currentLobby = lobbyCode;
                currentPlayerId = `player_${Date.now()}`;
                
                lobbyRef.child(`players/${currentPlayerId}`).set({ name: playerName, deck: deckSelect.value, hp: 100 });
                lobbyData = data; // update lobbyData
                listenToLobbyChanges();
            } else {
                alert('Lobby does not exist or is full.');
            }
        });
    } else {
        alert('Please enter a valid 4-character lobby code.');
    }
}

function updatePlayerList(players) {
    playerList.innerHTML = '<h3>Players:</h3>';
    for (const pId in players) {
        const player = players[pId];
        playerList.innerHTML += `<p>${player.name} (Deck: ${decks[player.deck].name})</p>`;
    }
}

function generateAndStoreMap() {
    const map = { nodes: {}, connections: [] };
    const levels = 5; let nodeCounter = 0; const nodesPerLevel = [1, 2, 3, 2, 1]; let levelParents = [];
    for (let i = 0; i < levels; i++) {
        let currentLevelNodes = [];
        for (let j = 0; j < nodesPerLevel[i]; j++) {
            const nodeId = `node-${nodeCounter}`;
            map.nodes[nodeId] = { id: nodeId, level: i, cleared: false };
            currentLevelNodes.push(nodeId);
            if (i > 0) {
                const parentNode = levelParents[j % levelParents.length];
                map.connections.push({ from: parentNode, to: nodeId });
            }
            nodeCounter++;
        }
        levelParents = currentLevelNodes;
    }
    const bossId = 'node-boss';
    map.nodes[bossId] = { id: bossId, level: levels, cleared: false };
    levelParents.forEach(parentId => map.connections.push({ from: parentId, to: bossId }));
    const initialGameState = { status: 'map_vote', currentNodeId: null, clearedNodes: [] };
    database.ref(`lobbies/${currentLobby}`).update({ map, gameState: initialGameState });
}

function renderMap(mapData, gameState) {
    mapNodes.innerHTML = ''; const nodeElements = {};
    Object.values(mapData.nodes).forEach(node => {
        const nodeEl = document.createElement('div');
        nodeEl.className = 'node'; nodeEl.id = node.id;
        nodeEl.textContent = node.id.includes('boss') ? 'BOSS' : `Area ${node.level + 1}`;
        const x = (Object.keys(mapData.nodes).filter(id => mapData.nodes[id].level === node.level).indexOf(node.id) + 1) * (100 / (Object.keys(mapData.nodes).filter(id => mapData.nodes[id].level === node.level).length + 1));
        const y = (node.level + 1) * (100 / (Math.max(...Object.values(mapData.nodes).map(n => n.level)) + 2));
        nodeEl.style.left = `${x}%`; nodeEl.style.top = `${y}%`;
        if (gameState.clearedNodes?.includes(node.id)) nodeEl.classList.add('cleared');
        if (gameState.currentNodeId === node.id) nodeEl.classList.add('current');
        mapNodes.appendChild(nodeEl); nodeElements[node.id] = nodeEl;
    });
    const votableNodeIds = determineVotableNodes(mapData, gameState);
    votableNodeIds.forEach(nodeId => {
        const nodeEl = nodeElements[nodeId];
        nodeEl.classList.add('votable');
        nodeEl.onclick = () => castVote(nodeId);
    });
    votingStatus.textContent = votableNodeIds.length > 0 ? "Vote for your next destination!" : gameState.clearedNodes?.includes('node-boss') ? "Congratulations! You defeated the boss!" : "Waiting for host to resolve battle...";
}

function determineVotableNodes(mapData, gameState) {
    if (gameState.status !== 'map_vote') return [];
    if (!gameState.currentNodeId && !gameState.clearedNodes?.length) {
        return Object.keys(mapData.nodes).filter(id => mapData.nodes[id].level === 0);
    }
    return mapData.connections.filter(conn => conn.from === gameState.currentNodeId).map(conn => conn.to).filter(nodeId => !gameState.clearedNodes?.includes(nodeId));
}

function castVote(nodeId) {
    database.ref(`lobbies/${currentLobby}/votes/${currentPlayerId}`).set(nodeId);
    votingStatus.textContent = `You voted for ${nodeId}. Waiting for others...`;
    document.querySelectorAll('.votable').forEach(el => el.onclick = null);
}

function listenForVotes(lobbyData) {
     const votesRef = database.ref(`lobbies/${currentLobby}/votes`);
     votesRef.on('value', snapshot => {
        if (!isHost) return;
        const votes = snapshot.val();
        const playerCount = Object.keys(lobbyData.players).length;
        if (votes && Object.keys(votes).length === playerCount) {
            tallyVotes(votes, lobbyData.players);
            votesRef.off(); votesRef.remove();
        }
     });
}

function tallyVotes(votes, players) {
    const voteCounts = {};
    Object.values(votes).forEach(nodeId => { voteCounts[nodeId] = (voteCounts[nodeId] || 0) + 1; });
    let maxVotes = 0; let winners = [];
    for (const nodeId in voteCounts) {
        if (voteCounts[nodeId] > maxVotes) {
            maxVotes = voteCounts[nodeId]; winners = [nodeId];
        } else if (voteCounts[nodeId] === maxVotes) {
            winners.push(nodeId);
        }
    }
    const nextNode = winners[Math.floor(Math.random() * winners.length)];
    database.ref(`lobbies/${currentLobby}/gameState`).update({ currentNodeId: nextNode });
    initializeBattle(nextNode, players);
}