import { decks, monsters } from './config.js';

class MapInteraction {
    constructor(viewport, canvas) {
        this.viewport = viewport;
        this.canvas = canvas;

        this.scale = 0.5;
        this.panX = 0;
        this.panY = 0;

        this.isPanning = false;
        this.startX = 0;
        this.startY = 0;

        this.viewport.onwheel = this.onWheel.bind(this);
        this.viewport.onmousedown = this.onMouseDown.bind(this);
        this.viewport.onmousemove = this.onMouseMove.bind(this);
        this.viewport.onmouseup = this.onMouseUp.bind(this);
        this.viewport.onmouseleave = this.onMouseUp.bind(this); // Stop panning if mouse leaves
    }

    applyTransform() {
        this.canvas.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`;
    }

    onWheel(event) {
        event.preventDefault(); // Prevent page from scrolling

        const rect = this.viewport.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;

        const oldScale = this.scale;
        const scaleAmount = -event.deltaY * 0.001;
        this.scale = Math.min(Math.max(0.25, this.scale + scaleAmount), 2); // Clamp zoom

        // Zoom towards the mouse position
        this.panX = mouseX - (mouseX - this.panX) * (this.scale / oldScale);
        this.panY = mouseY - (mouseY - this.panY) * (this.scale / oldScale);

        this.applyTransform();
    }

    onMouseDown(event) {
        this.isPanning = true;
        this.startX = event.clientX - this.panX;
        this.startY = event.clientY - this.panY;
    }

    onMouseMove(event) {
        if (!this.isPanning) return;
        this.panX = event.clientX - this.startX;
        this.panY = event.clientY - this.startY;
        this.applyTransform();
    }

    onMouseUp() {
        this.isPanning = false;
    }

    // A function to center and zoom the map on a specific node (like the start)
    centerOn(x, y) {
        this.panX = (this.viewport.clientWidth / 2) - (x * this.scale);
        this.panY = (this.viewport.clientHeight / 2) - (y * this.scale);
        this.applyTransform();
    }
}

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
    lobbyDeckSelect: document.getElementById('lobby-deck-select'),
    lobbyDeckDetails: document.getElementById('lobby-deck-details'),

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
    partyStatsContainer: document.getElementById('party-stats-container'), // ADD THIS
};

let mapInteractionHandler = null;

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

export function updatePartyStats(players, myPlayerId, reviveCallback) {
    const container = elements.partyStatsContainer;
    container.innerHTML = '';
    const myData = players[myPlayerId];

    for (const pId in players) {
        const pData = players[pId];
        const card = document.createElement('div');
        card.className = 'party-member-card';
        card.innerHTML = `
            <h4>${pData.name}</h4>
            <p>HP: ${pData.hp} / ${pData.maxHp || 100}</p>
            <p>Gold: ${pData.gold || 0}</p>
        `;

        // --- NEW: Revive Button Logic ---
        if (pData.hp <= 0) {
            const reviveCost = 50 + ((pData.deaths || 0) * 50);
            const reviveBtn = document.createElement('button');
            reviveBtn.className = 'revive-btn';
            reviveBtn.textContent = `Revive (${reviveCost} Gold)`;

            // Players can only revive themselves and only if they have enough gold.
            if (pId !== myPlayerId || !myData || myData.gold < reviveCost) {
                reviveBtn.disabled = true;
            }

            reviveBtn.onclick = () => {
                if (reviveCallback) {
                    reviveCallback(pId);
                }
            };
            card.appendChild(reviveBtn);
        }
        // --------------------------------

        container.appendChild(card);
    }
}


export function updateBattleUI(battleData, myPlayerId, myDeckId) {
    const deckConfig = myDeckId ? decks[myDeckId] : null;
    
    // --- REVISED: Render multiple monster cards ---
    const monsterArea = document.getElementById('monster-area');
    monsterArea.innerHTML = ''; // Clear previous monsters
    battleData.monsters.forEach(monster => {
        const card = document.createElement('div');
        card.className = 'monster-card';
        if (monster.hp <= 0) {
            card.classList.add('dead');
        }
        card.innerHTML = `
            <h4>${monster.name}</h4>
            <p>HP: ${monster.hp}</p>
        `;
        monsterArea.appendChild(card);
    });
    // ---------------------------------------------
    
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

export function showGameScreen(mode, resultData, isHost) {
    showScreen(elements.gameScreen);
    elements.mapContainer.classList.add('hidden');
    elements.battleContainer.classList.add('hidden');
    elements.endOfBattleScreen.classList.add('hidden');
    elements.partyStatsContainer.style.display = 'none';

    if (mode === 'map') {
        elements.mapContainer.classList.remove('hidden');
        elements.partyStatsContainer.style.display = 'flex';
    }
    if (mode === 'battle') {
        elements.battleContainer.classList.remove('hidden');
    }
    if (mode === 'end_battle') {
        const titleEl = document.getElementById('battle-result-title');
        const textEl = document.getElementById('battle-result-text');
        const goldRewardEl = document.getElementById('gold-reward-text');
        
        // Hide all buttons by default
        elements.returnToMapBtn.style.display = 'none';
        elements.defeatContinueBtn.style.display = 'none';
        goldRewardEl.style.display = 'none';

        switch (resultData.result) {
            case 'victory':
                titleEl.textContent = 'Victory!';
                textEl.textContent = 'The monster has been vanquished.';
                goldRewardEl.textContent = `Each party member receives ${resultData.goldReward} Gold!`;
                goldRewardEl.style.display = 'block';
                if (isHost) elements.returnToMapBtn.style.display = 'block';
                break;
            case 'defeat':
                titleEl.textContent = 'Defeat!';
                textEl.textContent = 'Your party has fallen. The expedition is over.';
                if (isHost) elements.defeatContinueBtn.style.display = 'block';
                break;
            case 'event': // Generic case for Rest, Shop, etc.
                titleEl.textContent = resultData.title;
                textEl.textContent = resultData.message;
                // Only the host sees the button to prevent multiple state changes
                if (isHost) elements.returnToMapBtn.style.display = 'block';
                break;
        }
        elements.endOfBattleScreen.classList.remove('hidden');
    }
}


// --- replace the existing renderMap(...) and determineVotableNodes(...) with this code ---

export function renderMap(mapData, gameState, onNodeClick) {
    const mapContainer = document.getElementById('map-container');
    const mapNodes = elements.mapNodes;
    
    // Initialize the pan/zoom handler if it doesn't exist
    if (!mapInteractionHandler) {
        mapInteractionHandler = new MapInteraction(mapContainer, mapNodes);
    }

    mapNodes.innerHTML = ''; // Clear previous map
    const nodeElements = {};

    const logicalWidth = 25; 
    const logicalHeight = 40;
    const canvasWidth = mapNodes.clientWidth;
    const canvasHeight = mapNodes.clientHeight;
    const padding = 100;

    const scaleX = (canvasWidth - padding * 2) / logicalWidth;
    const scaleY = (canvasHeight - padding * 2) / logicalHeight;

    const transformPoint = (pos) => {
        const x = (pos.x * scaleX) + padding;
        const y = (canvasHeight - (pos.y * scaleY)) - padding;
        return { x, y };
    };

    // Draw lines for connections first
    mapData.connections.forEach(conn => {
        const fromNode = mapData.nodes[conn.from];
        const toNode = mapData.nodes[conn.to];
        if (fromNode && toNode) {
            const p1 = transformPoint(fromNode.pos);
            const p2 = transformPoint(toNode.pos);
            
            const line = document.createElement('div');
            line.className = 'node-line';
            const length = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
            const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI;
            
            line.style.width = `${length}px`;
            line.style.transform = `rotate(${angle}deg)`;
            line.style.left = `${p1.x}px`;
            line.style.top = `${p1.y}px`;
            mapNodes.appendChild(line);
        }
    });

    // Draw nodes on top of lines
    Object.values(mapData.nodes).forEach(node => {
        const screenPos = transformPoint(node.pos);
        const nodeEl = document.createElement('div');
        nodeEl.className = 'node';
        nodeEl.id = `map-node-${node.id}`;
        nodeEl.textContent = node.type;
        
        nodeEl.style.left = `${screenPos.x}px`;
        nodeEl.style.top = `${screenPos.y}px`;

        // Normalize comparisons to strings to avoid number/string mismatches from Firebase
        const nodeIdStr = String(node.id);
        if (gameState.clearedNodes?.some(c => String(c) === nodeIdStr)) nodeEl.classList.add('cleared');
        if (String(gameState.currentNodeId) === nodeIdStr) nodeEl.classList.add('current');
        
        mapNodes.appendChild(nodeEl);
        nodeElements[nodeIdStr] = nodeEl; // store by string key
    });

    // Mark the most-recently cleared node with a special class so players can see the node they just beat.
    const lastClearedNodeId = gameState.clearedNodes?.[gameState.clearedNodes.length - 1];
    if (lastClearedNodeId !== undefined) {
        const el = nodeElements[String(lastClearedNodeId)];
        if (el) el.classList.add('just-cleared');
    }

    // Votable logic (determineVotableNodes now returns string ids)
    const votableNodeIds = determineVotableNodes(mapData, gameState);
    votableNodeIds.forEach(nodeId => {
        const nodeEl = nodeElements[String(nodeId)];
        if (nodeEl) {
            nodeEl.classList.add('votable');
            nodeEl.onclick = (event) => {
                event.stopPropagation(); // Prevent click from triggering a pan
                // convert to Number for callers that expect numeric ids (singleplayer)
                const numericId = Number(nodeId);
                onNodeClick(typeof onNodeClick === 'function' ? numericId : nodeId);
            };
        }
    });
    
    elements.votingStatus.textContent = votableNodeIds.length > 0 ? "Choose your next destination." : gameState.clearedNodes?.some(c => String(c) === '1') ? "Congratulations! You defeated the boss!" : "Battle in progress...";

    // Auto-center the view on the last cleared node
    const focusNodeId = lastClearedNodeId ?? 0;
    const focusNode = mapData.nodes[focusNodeId];
    if (focusNode) {
        const focusPos = transformPoint(focusNode.pos);
        mapInteractionHandler.centerOn(focusPos.x, focusPos.y);
    }
}

function determineVotableNodes(mapData, gameState) {
    if (gameState.status !== 'map_vote') return [];

    // The clearedNodes array is now guaranteed to exist and start with [0].
    // Find the ID of the most recently cleared node (normalize to string).
    const lastClearedNodeId = String(gameState.clearedNodes[gameState.clearedNodes.length - 1]);

    // Find all connections that originate from the last cleared node.
    const connections = mapData.connections
        .filter(conn => String(conn.from) === lastClearedNodeId)
        .map(conn => String(conn.to));

    // Filter out any nodes that might have been part of an alternate path already cleared.
    const uniqueConnections = [...new Set(connections)];
    return uniqueConnections.filter(nodeId => !gameState.clearedNodes.some(c => String(c) === nodeId));
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

export function updatePlayerList(players) {
    elements.playerList.innerHTML = '';
    for (const pId in players) {
        const player = players[pId];
        // Look up the full deck name from the config
        const deckName = decks[player.deck]?.name || 'Unknown Deck';
        // Display the player's name and their chosen deck
        elements.playerList.innerHTML += `<p>${player.name} (Deck: ${deckName})</p>`;
    }
}

export function clearMapHighlights() {
    const mapNodes = document.getElementById('map-nodes');
    if (!mapNodes) return;

    // Remove highlight classes from any leftover nodes
    mapNodes.querySelectorAll('.node').forEach(n => {
        n.classList.remove('current', 'votable', 'just-cleared', 'cleared');
        // remove inline onclick handlers to avoid stale callbacks
        n.onclick = null;
    });

    // Remove connection lines
    mapNodes.querySelectorAll('.node-line').forEach(l => l.remove());

    // Clear the DOM so renderMap starts with a fresh container
    mapNodes.innerHTML = '';
}

