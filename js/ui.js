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

        // Defensive: guard event attachment if viewport missing
        if (this.viewport) {
            this.viewport.onwheel = this.onWheel.bind(this);
            this.viewport.onmousedown = this.onMouseDown.bind(this);
            this.viewport.onmousemove = this.onMouseMove.bind(this);
            this.viewport.onmouseup = this.onMouseUp.bind(this);
            this.viewport.onmouseleave = this.onMouseUp.bind(this); // Stop panning if mouse leaves
        }
    }

    applyTransform() {
        if (!this.canvas) return;
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
        if (!this.viewport) return;
        // center the given x,y (screen coords) in the viewport
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
    mapNodes: document.getElementById('map-nodes'),
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
    votingStatus: document.getElementById('voting-status'),

    // Battle
    monsterArea: document.getElementById('monster-area'),
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
    partyStatsContainer: document.getElementById('party-stats-container'),
    itemsContainer: document.getElementById('itemsContainer'),

    // Reward and card selection panels (must exist in index.html)
    rewardChoices: document.getElementById('rewardChoices'),
    cardSelection: document.getElementById('cardSelection'),
};

let mapInteractionHandler = null;

export function showScreen(screenElement) {
    if (!screenElement) return;
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    screenElement.classList.add('active');
}

export function updateDeckDetails() {
    if (!elements.deckSelect || !elements.deckDetails) return;
    const selectedDeck = decks[elements.deckSelect.value];
    if (!selectedDeck) {
        elements.deckDetails.innerHTML = '';
        return;
    }
    let cardList = selectedDeck.cards.map(card => `<li>Value ${card.v}: ${card.c} cards</li>`).join('');
    elements.deckDetails.innerHTML = `
        <p><strong>Jackpot:</strong> ${selectedDeck.jackpot}</p>
        <ul>${cardList}</ul>
    `;
}

export function disableActionButtons() {
    if (!elements.drawCardBtn || !elements.attackBtn) return;
    elements.drawCardBtn.disabled = true;
    elements.attackBtn.disabled = true;
}

export function updatePartyStats(players, myPlayerId, reviveCallback) {
    const container = elements.partyStatsContainer;
    if (!container) return;
    container.innerHTML = '';
    const myData = players ? players[myPlayerId] : null;

    for (const pId in players) {
        const pData = players[pId];
        const card = document.createElement('div');
        card.className = 'party-member-card';
        card.innerHTML = `
            <h4>${pData.name}</h4>
            <p>HP: ${pData.hp} / ${pData.maxHp || 100}</p>
            <p>Gold: ${pData.gold || 0}</p>
        `;

        // Revive button logic
        if (pData.hp <= 0) {
            let reviveCost = 50 + ((pData.deaths || 0) * 50);
            // Check for revive cost reduction item
            if ((pData.items || []).includes("Reduce revive cost by 20% (unique)")) {
                reviveCost = Math.floor(reviveCost * 0.8);
            }
            
            const reviveBtn = document.createElement('button');
            reviveBtn.className = 'revive-btn';
            reviveBtn.textContent = `Revive (${reviveCost} Gold)`;

            // Players can only revive themselves and only if they have enough gold.
            if (pId !== myPlayerId || !myData || (myData.gold || 0) < reviveCost) {
                reviveBtn.disabled = true;
            }

            reviveBtn.onclick = () => {
                if (reviveCallback) {
                    reviveCallback(pId);
                }
            };
            card.appendChild(reviveBtn);
        }

        container.appendChild(card);
    }
}

export function updateBattleUI(battleData, myPlayerId, myDeckId) {
    if (!battleData || !elements.playerBattleArea) return;
    const deckConfig = myDeckId ? decks[myDeckId] : null;

    // Display debuff prominently
    let debuffDisplay = document.getElementById('active-debuff-display');
    if (battleData.activeDebuff) {
        if (!debuffDisplay) {
            debuffDisplay = document.createElement('div');
            debuffDisplay.id = 'active-debuff-display';
            debuffDisplay.style.cssText = 'background: #992d22; color: white; padding: 10px; border-radius: 5px; margin: 10px 0; text-align: center; font-weight: bold;';
            const battleContainer = document.getElementById('battle-container');
            if (battleContainer) {
                battleContainer.insertBefore(debuffDisplay, battleContainer.firstChild);
            }
        }
        debuffDisplay.textContent = `⚠️ DEBUFF: ${battleData.activeDebuff}`;
    } else if (debuffDisplay) {
        debuffDisplay.remove();
    }

    // Update jackpot display
    let jackpotText = deckConfig?.jackpot || 'N/A';
    if (deckConfig) {
        if (battleData.activeDebuff === "Target sum is doubled") {
            jackpotText = `${deckConfig.jackpot * 2} (Doubled!)`;
        } else if (battleData.activeDebuff === "Draw double the cards each draw") {
            jackpotText = `${Math.floor(deckConfig.jackpot * 1.5)} (+50%)`;
        }
    }
    elements.playerJackpot && (elements.playerJackpot.textContent = jackpotText);


    // Render monsters
    const monsterArea = elements.monsterArea;
    if (monsterArea) {
        monsterArea.innerHTML = ''; // Clear previous monsters
        (battleData.monsters || []).forEach(monster => {
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
    }

    elements.phaseTitle && (elements.phaseTitle.textContent = (battleData.phase || '').replace('_', ' '));

    // Player area
    const playerArea = elements.playerBattleArea;
    playerArea.innerHTML = '';
    for (const pId in (battleData.players || {})) {
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
            <p>Gold: ${pData.gold || 0}</p>
            ${pData.permanentDamage ? `<p>Bonus Dmg: +${pData.permanentDamage}</p>` : ''}
        `;
        playerArea.appendChild(playerCard);
    }

    // Local player controls + info
    const myData = battleData.players ? battleData.players[myPlayerId] : null;
    if (!myData || myData.hp <= 0) {
        // Hide action controls for dead or missing player
        if (elements.manaInput) elements.manaInput.style.display = 'none';
        if (elements.chargeBtn) elements.chargeBtn.style.display = 'none';
        if (elements.drawCardBtn) elements.drawCardBtn.style.display = 'none';
        if (elements.attackBtn) elements.attackBtn.style.display = 'none';
        if (elements.playerMana) elements.playerMana.textContent = "0";
        if (elements.playerSum) elements.playerSum.textContent = "0";
        if (elements.playerMultiplier) elements.playerMultiplier.textContent = "0.00";
        if (elements.playerHandContainer) elements.playerHandContainer.innerHTML = '';
        return;
    }

    if (elements.playerMana) elements.playerMana.textContent = Math.floor(myData.mana || 0);
    if (elements.playerSum) elements.playerSum.textContent = (myData.sum != null ? myData.sum : 0);
    
    // Correctly calculate multiplier for display
    let displayJackpot = deckConfig ? deckConfig.jackpot : 21;
    if (battleData.activeDebuff === "Target sum is doubled") {
        displayJackpot *= 2;
    } else if (battleData.activeDebuff === "Draw double the cards each draw") {
        displayJackpot = Math.floor(displayJackpot * 1.5);
    }
    const multiplier = (myData.sum > 0 && deckConfig) ? deckConfig.g(myData.sum, displayJackpot).toFixed(2) : '0.00';
    if (elements.playerMultiplier) elements.playerMultiplier.textContent = multiplier;


    // Render hand
    const handContainer = elements.playerHandContainer;
    if (handContainer) {
        handContainer.innerHTML = '';
        (myData.hand || []).forEach(cardValue => displayCard(cardValue, handContainer));
    }

    // Action visibility
    const canBet = battleData.phase === 'PLAYER_TURN' && myData.status === 'needs_mana';
    const canAct = battleData.phase === 'PLAYER_TURN' && myData.status === 'acting';

    if (elements.manaInput) elements.manaInput.style.display = canBet ? 'inline-block' : 'none';
    if (elements.chargeBtn) elements.chargeBtn.style.display = canBet ? 'inline-block' : 'none';
    if (elements.drawCardBtn) elements.drawCardBtn.style.display = canAct ? 'inline-block' : 'none';
    if (elements.attackBtn) elements.attackBtn.style.display = canAct ? 'inline-block' : 'none';
    if (elements.drawCardBtn) elements.drawCardBtn.disabled = !canAct;
    if (elements.attackBtn) elements.attackBtn.disabled = !canAct;

    // Game log (last few messages)
    if (elements.gameLog) {
        elements.gameLog.innerHTML = '';
        if (battleData.log) {
            const messages = Object.values(battleData.log).slice(-6);
            messages.forEach(logEntry => {
                const p = document.createElement('p');
                p.textContent = logEntry.message;
                elements.gameLog.appendChild(p);
            });
            elements.gameLog.scrollTop = elements.gameLog.scrollHeight;
        }
    }
}

function displayCard(value, container) {
    const cardEl = document.createElement('div');
    cardEl.className = 'card';
    cardEl.textContent = value;
    cardEl.dataset.value = value;

    // If this is a short numeric card (e.g. "1", "11", "-1"), make it large.
    if (/^-?\d+$/.test(String(value).trim()) && String(value).trim().length <= 2) {
        cardEl.classList.add('numeric');
    }

    container.appendChild(cardEl);
}


export function showGameScreen(mode, resultData = {}, isHost = false) {
    showScreen(elements.gameScreen);
    elements.mapContainer.classList.add('hidden');
    elements.battleContainer.classList.add('hidden');
    elements.endOfBattleScreen.classList.add('hidden');
    if (elements.partyStatsContainer) elements.partyStatsContainer.style.display = 'none';
    if (elements.rewardChoices) elements.rewardChoices.style.display = 'none';

    if (mode === 'map') {
        elements.mapContainer.classList.remove('hidden');
        if (elements.partyStatsContainer) elements.partyStatsContainer.style.display = 'flex';
    }
    if (mode === 'battle') {
        elements.battleContainer.classList.remove('hidden');
    }
    if (mode === 'end_battle') {
        const titleEl = document.getElementById('battle-result-title');
        const textEl = document.getElementById('result-text'); // Use the new ID
        const goldRewardEl = document.getElementById('gold-reward-text');
        
        textEl.innerHTML = ''; // Clear previous content
        if (elements.returnToMapBtn) elements.returnToMapBtn.style.display = 'none';
        if (elements.defeatContinueBtn) elements.defeatContinueBtn.style.display = 'none';
        if (goldRewardEl) goldRewardEl.style.display = 'none';

        switch (resultData.result) {
            case 'victory':
                if (titleEl) titleEl.textContent = 'Victory!';
                if (textEl) textEl.textContent = 'The monster has been vanquished.';
                if (goldRewardEl) {
                    goldRewardEl.textContent = `Each party member receives ${resultData.goldReward} Gold!`;
                    goldRewardEl.style.display = 'block';
                }
                if (isHost && elements.returnToMapBtn) elements.returnToMapBtn.style.display = 'block';
                break;

            case 'defeat':
                if (titleEl) titleEl.textContent = 'Defeat!';
                if (textEl) textEl.textContent = 'Your party has fallen. The expedition is over.';
                if (isHost && elements.defeatContinueBtn) elements.defeatContinueBtn.style.display = 'block';
                break;

            case 'event':
                if (titleEl) titleEl.textContent = resultData.title || 'Event';
                if (textEl) textEl.innerHTML = resultData.message || '';
                if (isHost && elements.returnToMapBtn) elements.returnToMapBtn.style.display = 'block';
                break;

            case 'event_result': // For multiplayer events
                if (titleEl) titleEl.textContent = resultData.title || 'Event';
                // Display all log messages from the event
                if (textEl && resultData.log) {
                    Object.values(resultData.log).forEach(logEntry => {
                        const p = document.createElement('p');
                        p.textContent = logEntry.message;
                        textEl.appendChild(p);
                    });
                }
                if (isHost && elements.returnToMapBtn) elements.returnToMapBtn.style.display = 'block';
                break;
        }

        if (Array.isArray(resultData.extraRewards)) { /* ... (reward logic is the same) ... */ }
        elements.endOfBattleScreen.classList.remove('hidden');
    }
}

// --- Map & rendering logic (unchanged except for defensive checks) ---

export function renderMap(mapData, gameState, onNodeClick) {
    const mapContainer = document.getElementById('map-container');
    const mapNodes = elements.mapNodes;
    if (!mapNodes || !mapData) return;

    // Initialize the pan/zoom handler if it doesn't exist
    if (!mapInteractionHandler) {
        mapInteractionHandler = new MapInteraction(mapContainer, mapNodes);
    }

    mapNodes.innerHTML = ''; // Clear previous map
    const nodeElements = {};

    const logicalWidth = 25;
    const logicalHeight = 40;
    const canvasWidth = mapNodes.clientWidth || 1600;
    const canvasHeight = mapNodes.clientHeight || 1600;
    const padding = 100;

    const scaleX = (canvasWidth - padding * 2) / logicalWidth;
    const scaleY = (canvasHeight - padding * 2) / logicalHeight;

    const transformPoint = (pos) => {
        const x = (pos.x * scaleX) + padding;
        const y = (canvasHeight - (pos.y * scaleY)) - padding;
        return { x, y };
    };

    // Draw lines for connections first
    (mapData.connections || []).forEach(conn => {
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
    Object.values(mapData.nodes || {}).forEach(node => {
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

    // Mark most-recently cleared node
    const lastClearedNodeId = gameState.clearedNodes?.[gameState.clearedNodes.length - 1];
    if (lastClearedNodeId !== undefined) {
        const el = nodeElements[String(lastClearedNodeId)];
        if (el) el.classList.add('just-cleared');
    }

    // Votable logic
    const votableNodeIds = determineVotableNodes(mapData, gameState);
    votableNodeIds.forEach(nodeId => {
        const nodeEl = nodeElements[String(nodeId)];
        if (nodeEl) {
            nodeEl.classList.add('votable');
            nodeEl.onclick = (event) => {
                event.stopPropagation();
                const numericId = Number(nodeId);
                onNodeClick(typeof onNodeClick === 'function' ? numericId : nodeId);
            };
        }
    });

    if (elements.votingStatus) {
        elements.votingStatus.textContent = votableNodeIds.length > 0 ? "Choose your next destination." : gameState.clearedNodes?.some(c => String(c) === '1') ? "Congratulations! You defeated the boss!" : "Battle in progress...";
    }

    // Auto-center the view on the last cleared node
    const focusNodeId = lastClearedNodeId ?? 0;
    const focusNode = mapData.nodes ? mapData.nodes[focusNodeId] : null;
    if (focusNode) {
        const focusPos = transformPoint(focusNode.pos);
        mapInteractionHandler.centerOn(focusPos.x, focusPos.y);
    }
}

function determineVotableNodes(mapData, gameState) {
    if (!gameState || gameState.status !== 'map_vote') return [];
    const cleared = gameState.clearedNodes || [0];
    const lastClearedNodeId = String(cleared[cleared.length - 1] || 0);

    const connections = (mapData.connections || [])
        .filter(conn => String(conn.from) === lastClearedNodeId)
        .map(conn => String(conn.to));

    const uniqueConnections = [...new Set(connections)];
    return uniqueConnections.filter(nodeId => !cleared.some(c => String(c) === nodeId));
}

export function setTimerVisibility(visible) {
    if (elements.timerContainer) elements.timerContainer.style.display = visible ? 'block' : 'none';
}

let battleTimerInterval = null;
export function updateTimer(endTime) {
    if (battleTimerInterval) clearInterval(battleTimerInterval);
    if (!endTime) {
        if (elements.turnTimer) elements.turnTimer.textContent = '--';
        return;
    }
    battleTimerInterval = setInterval(() => {
        const timeLeft = Math.max(0, Math.round((endTime - Date.now()) / 1000));
        if (elements.turnTimer) elements.turnTimer.textContent = timeLeft;
        if (timeLeft <= 0 && battleTimerInterval) clearInterval(battleTimerInterval);
    }, 500);
}

export function updatePlayerList(players) {
    if (!elements.playerList) return;
    elements.playerList.innerHTML = '';
    for (const pId in players) {
        const player = players[pId];
        const deckName = decks[player.deck]?.name || 'Unknown Deck';
        elements.playerList.innerHTML += `<p>${player.name} (Deck: ${deckName})</p>`;
    }
}

export function clearMapHighlights() {
    const mapNodes = elements.mapNodes;
    if (!mapNodes) return;

    // Remove highlight classes from any leftover nodes
    mapNodes.querySelectorAll('.node').forEach(n => {
        n.classList.remove('current', 'votable', 'just-cleared', 'cleared');
        n.onclick = null;
    });

    // Remove connection lines
    mapNodes.querySelectorAll('.node-line').forEach(l => l.remove());

    // Clear the DOM so renderMap starts with a fresh container
    mapNodes.innerHTML = '';
}

export function showRewardChoices(rewards, callback) {
    const container = elements.rewardChoices;
    if (!container) return;
    container.innerHTML = '';
    rewards.forEach(r => {
        const btn = document.createElement('button');
        btn.textContent = r;
        btn.onclick = () => {
            // hide UI and forward selection
            container.style.display = 'none';
            if (typeof callback === 'function') callback(r);
        };
        container.appendChild(btn);
    });
    container.style.display = 'block';
}


export function showCardSelection(cardChoices, callback) {
    const container = elements.cardSelection;
    if (!container) return;
    container.innerHTML = "<h3>Choose a Card</h3>";
    cardChoices.forEach(card => {
        const btn = document.createElement("button");
        btn.textContent = card;
        btn.onclick = () => {
            container.style.display = "none"; // hide after choice
            if (typeof callback === 'function') callback(card);
        };
        container.appendChild(btn);
    });
    container.style.display = "block";
}

export function hideRewardChoices() {
    const container = document.getElementById("rewardChoices");
    if (container) {
        container.innerHTML = "";
        container.style.display = "none";
    }
}

export function hideCardSelection() {
    const container = document.getElementById("cardSelection");
    if (container) {
        container.innerHTML = "";
        container.style.display = "none";
    }
}

export function renderItems(items) {
    const container = elements.itemsContainer || document.getElementById("itemsContainer");
    if (!container) return;
    container.innerHTML = "";
    if (!items || items.length === 0) {
        container.innerHTML = "<p style='color: #999; font-size: 14px;'>No items equipped</p>";
        return;
    }
    
    const title = document.createElement("h4");
    title.textContent = "Items:";
    title.style.marginBottom = "10px";
    container.appendChild(title);
    
    const ul = document.createElement("ul");
    ul.className = "items-list";
    ul.style.cssText = "list-style: none; padding: 0; margin: 0;";
    
    items.forEach(it => {
        const li = document.createElement("li");
        li.style.cssText = "padding: 5px; background: #40444b; margin-bottom: 5px; border-radius: 3px; font-size: 14px;";
        li.textContent = it;
        ul.appendChild(li);
    });
    container.appendChild(ul);
}

export function showCardRemovalUI(player, callback) {
    const container = document.getElementById("shop-container");
    container.innerHTML = "<h2>Select a card to remove</h2>";

    player.extraCards.forEach((card, idx) => {
        const btn = document.createElement("button");
        btn.textContent = card;
        btn.onclick = () => callback(card, idx);
        container.appendChild(btn);
    });
}