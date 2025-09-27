import { decks, monsters } from './config.js';

// Centralized DOM element references
export const elements = {
    // Screens
    mainMenu: document.getElementById('main-menu'),
    multiplayerLobby: document.getElementById('multiplayer-lobby'),
    gameScreen: document.getElementById('game-screen'),
    mapContainer: document.getElementById('map-container'),
    battleContainer: document.getElementById('battle-container'),
    endOfBattleScreen: document.getElementById('end-of-battle-screen'),

    // Main Menu & Lobby
    singlePlayerBtn: document.getElementById('single-player-btn'),
    multiplayerBtn: document.getElementById('multiplayer-btn'),
    createLobbyBtn: document.getElementById('create-lobby-btn'),
    joinLobbyBtn: document.getElementById('join-lobby-btn'),
    startGameBtn: document.getElementById('start-game-btn'),
    backToMainMenuBtn: document.getElementById('back-to-main-menu-btn'),
    playerNameInput: document.getElementById('player-name-input'),
    lobbyCodeInput: document.getElementById('lobby-code-input'),
    deckSelect: document.getElementById('deck-select'),
    deckDetails: document.getElementById('deck-details'),
    playerList: document.getElementById('player-list'),

    // Map
    mapNodes: document.getElementById('map-nodes'),
    votingStatus: document.getElementById('voting-status'),

    // Battle
    monsterHp: document.getElementById('monster-hp'),
    monsterName: document.getElementById('monster-name'),
    phaseTitle: document.getElementById('phase-title'),
    turnTimer: document.getElementById('turn-timer'),
    timerContainer: document.getElementById('timer-container'),
    playerBattleArea: document.getElementById('player-battle-area'),
    playerMana: document.getElementById('player-mana'),
    playerJackpot: document.getElementById('player-jackpot'),
    playerSum: document.getElementById('player-sum'),
    playerMultiplier: document.getElementById('player-multiplier'),
    playerHandContainer: document.getElementById('player-hand-container'),
    manaInput: document.getElementById('mana-input'),
    chargeBtn: document.getElementById('charge-btn'),
    drawCardBtn: document.getElementById('draw-card-btn'),
    attackBtn: document.getElementById('attack-btn'),
    returnToMapBtn: document.getElementById('return-to-map-btn'),
    defeatContinueBtn: document.getElementById('defeat-continue-btn'),
    gameLog: document.getElementById('game-log'),
};

export function showScreen(screenElement) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    screenElement.classList.add('active');
}

export function updateDeckDetails() {
    const selectedDeck = decks[elements.deckSelect.value];
    let cardList = selectedDeck.cards.map(card => `<li>Value ${card.v}: ${card.c} cards</li>`).join('');
    elements.deckDetails.innerHTML = `
        <p><strong>Jackpot:</strong> ${selectedDeck.jackpot}</p>
        <ul>${cardList}</ul>
    `;
}

export function disableActionButtons() {
    elements.drawCardBtn.disabled = true;
    elements.attackBtn.disabled = true;
}

export function updateBattleUI(battleData, myPlayerId, myDeckId) {
    const deckConfig = myDeckId ? decks[myDeckId] : null;
    elements.monsterName.textContent = battleData.monster.name || "A Monster";
    elements.monsterHp.textContent = battleData.monster.hp;
    
    elements.phaseTitle.textContent = battleData.phase.replace('_', ' ');
    elements.playerJackpot.textContent = deckConfig?.jackpot || 'N/A';

    const playerArea = elements.playerBattleArea;
    playerArea.innerHTML = '';
    for (const pId in battleData.players) {
        const pData = battleData.players[pId];
        const playerCard = document.createElement('div');
        playerCard.className = 'player-battle-info';
        if (pId === myPlayerId) playerCard.classList.add('is-self');
        
        if (pData.hp <= 0) {
            playerCard.classList.add('dead');
            pData.status = 'dead';
        }

        playerCard.innerHTML = `
            <h4>${pData.name}</h4>
            <p>HP: ${pData.hp} / ${pData.maxHp}</p>
            <p>Status: ${pData.status || 'N/A'}</p>
            <p>Charge: ${pData.charge || 0}</p>
            <p>Sum: ${pData.sum || 0}</p>
        `;
        playerArea.appendChild(playerCard);
    }

    const myData = battleData.players[myPlayerId];
    if (!myData || myData.hp <= 0) {
        elements.manaInput.style.display = 'none';
        elements.chargeBtn.style.display = 'none';
        elements.drawCardBtn.style.display = 'none';
        elements.attackBtn.style.display = 'none';
        elements.playerMana.textContent = "0";
        elements.playerSum.textContent = "0";
        elements.playerMultiplier.textContent = "0.00";
        elements.playerHandContainer.innerHTML = '';
        return;
    };

    elements.playerMana.textContent = Math.floor(myData.mana);
    elements.playerSum.textContent = myData.sum;
    const multiplier = myData.sum > 0 && deckConfig ? deckConfig.g(myData.sum).toFixed(2) : '0.00';
    elements.playerMultiplier.textContent = multiplier;

    const handContainer = elements.playerHandContainer;
    handContainer.innerHTML = '';
    myData.hand?.forEach(cardValue => displayCard(cardValue, handContainer));

    const canBet = battleData.phase === 'PLAYER_TURN' && myData.status === 'needs_bet';
    const canAct = battleData.phase === 'PLAYER_TURN' && myData.status === 'acting';
    
    elements.manaInput.style.display = canBet ? 'inline-block' : 'none';
    elements.chargeBtn.style.display = canBet ? 'inline-block' : 'none';
    elements.drawCardBtn.style.display = canAct ? 'inline-block' : 'none';
    elements.attackBtn.style.display = canAct ? 'inline-block' : 'none';
    elements.drawCardBtn.disabled = !canAct;
    elements.attackBtn.disabled = !canAct;

    elements.gameLog.innerHTML = '';
    if (battleData.log) {
        const messages = Object.values(battleData.log).slice(-5);
        messages.forEach(logEntry => {
            const p = document.createElement('p');
            p.textContent = logEntry.message;
            elements.gameLog.appendChild(p);
        });
        elements.gameLog.scrollTop = elements.gameLog.scrollHeight;
    }
}


function displayCard(value, container) {
    const cardEl = document.createElement('div');
    cardEl.className = 'card';
    cardEl.textContent = value;
    cardEl.dataset.value = value;
    container.appendChild(cardEl);
}

export function showGameScreen(mode, result, isHost) {
    showScreen(elements.gameScreen);
    elements.mapContainer.classList.add('hidden');
    elements.battleContainer.classList.add('hidden');
    elements.endOfBattleScreen.classList.add('hidden');

    if (mode === 'map') elements.mapContainer.classList.remove('hidden');
    if (mode === 'battle') elements.battleContainer.classList.remove('hidden');
    if (mode === 'end_battle') {
        const titleEl = document.getElementById('battle-result-title');
        const textEl = document.getElementById('battle-result-text');
        
        if (result === 'victory') {
            titleEl.textContent = 'Victory!';
            textEl.textContent = 'The monster has been vanquished.';
            elements.returnToMapBtn.style.display = isHost ? 'block' : 'none';
            elements.defeatContinueBtn.style.display = 'none';
        } else { // defeat
            titleEl.textContent = 'Defeat!';
            textEl.textContent = 'Your party has fallen. The expedition is over.';
            elements.returnToMapBtn.style.display = 'none';
            elements.defeatContinueBtn.style.display = isHost ? 'block' : 'none';
        }
        elements.endOfBattleScreen.classList.remove('hidden');
    }
}

export function renderMap(mapData, gameState, onNodeClick) {
    elements.mapNodes.innerHTML = '';
    const nodeElements = {};

    Object.values(mapData.nodes).forEach(node => {
        const nodeEl = document.createElement('div');
        nodeEl.className = 'node';
        nodeEl.id = node.id;
        nodeEl.textContent = node.id.includes('boss') ? 'BOSS' : `Area ${node.level + 1}`;
        
        const levelNodes = Object.values(mapData.nodes).filter(n => n.level === node.level);
        const nodeIndex = levelNodes.findIndex(n => n.id === node.id);
        const x = (nodeIndex + 1) * (100 / (levelNodes.length + 1));
        const y = (node.level + 1) * (100 / (Math.max(...Object.values(mapData.nodes).map(n => n.level)) + 2));
        nodeEl.style.left = `${x}%`;
        nodeEl.style.top = `${y}%`;

        if (gameState.clearedNodes?.includes(node.id)) nodeEl.classList.add('cleared');
        if (gameState.currentNodeId === node.id) nodeEl.classList.add('current');
        
        elements.mapNodes.appendChild(nodeEl);
        nodeElements[node.id] = nodeEl;
    });

    const votableNodeIds = determineVotableNodes(mapData, gameState);
    votableNodeIds.forEach(nodeId => {
        const nodeEl = nodeElements[nodeId];
        nodeEl.classList.add('votable');
        nodeEl.onclick = () => onNodeClick(nodeId);
    });

    elements.votingStatus.textContent = votableNodeIds.length > 0 ? "Choose your next destination." : gameState.clearedNodes?.includes('node-boss') ? "Congratulations! You defeated the boss!" : "Battle in progress...";
}

function determineVotableNodes(mapData, gameState) {
    if (gameState.status !== 'map_vote') return [];
    if (!gameState.currentNodeId && !(gameState.clearedNodes?.length > 0)) {
        return Object.keys(mapData.nodes).filter(id => mapData.nodes[id].level === 0);
    }
    return mapData.connections
        .filter(conn => conn.from === gameState.currentNodeId)
        .map(conn => conn.to)
        .filter(nodeId => !gameState.clearedNodes?.includes(nodeId));
}

export function setTimerVisibility(visible) {
    elements.timerContainer.style.display = visible ? 'block' : 'none';
}

let battleTimerInterval = null;
export function updateTimer(endTime) {
    if (battleTimerInterval) clearInterval(battleTimerInterval);
    battleTimerInterval = setInterval(() => {
        const timeLeft = Math.max(0, Math.round((endTime - Date.now()) / 1000));
        elements.turnTimer.textContent = timeLeft;
        if (timeLeft <= 0) clearInterval(battleTimerInterval);
    }, 500);
}