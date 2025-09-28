import { decks, monsters } from './config.js';
import * as ui from './ui.js';
import { generateNewMap, createDeck, shuffleDeck } from './game-logic.js';
import * as engine from './battle-engine.js';

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getDatabase, ref, set, onValue, get, child, update, remove, runTransaction, push } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";

let db, currentLobby, currentPlayerId, isHost, myName, myDeckId, lobbyData;
let lobbyRef, battleRef;
let hostTurnTimer = null;

// Reward & card choice pools (local helpers)
export const rewardPool = [
    "card that draws two cards",
    "1","2","3","4","5","6","7","8","9","10","11",
    "-1","-2","-3",
    "+2 mana","+5 gold","+1 hp"
];

const cardChoicePool = [
    "card that draws two cards",
    "1","2","3","4","5","6","7","8","9","10","11",
    "-1","-2","-3"
];

// Elite rewards (items with permanent effects)
export const eliteRewardPool = [
    "Increase gold earned by 20% (unique)",
    "Heal +2 hp after each location (stackable)",
    "Reduce revive cost by 20% (unique)",
    "Increase starting mana by 10 (stackable)",
    "Gain +200 gold"
];

// Boss rewards - NEW
const bossRewardPool = [
    "Can buy 1 mana for 1 gold",
    "Earn 10% interest after each location",
    "10% of gold is added to damage",
    "Each 2 drawn permanently adds 1 damage"
];

// Battle debuffs - NEW
const battleDebuffs = [
    "Drawing the number 3 does not add to sum",
    "Target sum is doubled",
    "Draw double the cards each draw"
];

// Shop items list
const shopItemsMasterList = [
    { name: "Gain +10 HP", cost: 30, action: "heal10" },
    { name: "Earn double gold for 3 encounters", cost: 60, action: "doubleGold" },
    { name: "Enemies start with half HP next encounter", cost: 30, action: "halfHp" },
    { name: "Start next 3 encounters with +10 mana", cost: 30, action: "bonusMana" },
    { name: "Start next 3 encounters with a 10 drawn", cost: 30, action: "startWith10" },
    { name: "Add a card to your deck", cost: 30, action: "addCard" },
    { name: "Remove 1 card from your deck", cost: 50, action: "removeCard" }
];

export function getRandomRewards(count = 3) {
    const shuffled = [...rewardPool].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
}
function getRandomCardChoices(count = 3) {
    const shuffled = [...cardChoicePool].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
}
function getRandomEliteRewards(count = 3) {
    const shuffled = [...eliteRewardPool].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
}
function getRandomBossRewards(count = 3) {
    const shuffled = [...bossRewardPool].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
}

export function init(firebaseConfig, playerName, deckId) {
    const app = initializeApp(firebaseConfig);
    db = getDatabase(app);
    myName = playerName;
    myDeckId = deckId;

    ui.elements.startGameBtn.onclick = () => {
        if (isHost) {
            update(ref(db, `lobbies/${currentLobby}/gameState`), {
                status: 'map_vote',
                clearedNodes: [0] // Initialize
            });
        }
    };

    ui.elements.createLobbyBtn.onclick = createLobby;
    ui.elements.joinLobbyBtn.onclick = joinLobby;
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
            const updates = {
                '/battle': null, '/map': null, '/votes': null,
                '/gameState/status': 'lobby',
            };
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
    const initialPlayer = { 
        name: myName, 
        deck: myDeckId, 
        hp: 100, 
        maxHp: 100, 
        gold: 0, 
        deaths: 0, 
        extraCards: [], 
        removedCards: [],
        items: [],
        permanentDamage: 0,
        consumables: { doubleGold: 0, halfHpEnemies: 0, bonusMana: 0, startWith10: 0 }
    };
    set(lobbyRef, { host: currentPlayerId, players: { [currentPlayerId]: initialPlayer }, gameState: { status: 'lobby', loopCount: 0 } });
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
        if (snapshot.exists() && Object.keys(data.players || {}).length < 4) {
            currentLobby = lobbyCode; lobbyRef = tempLobbyRef;
            currentPlayerId = `player_${Date.now()}`;
            const newPlayerRef = ref(db, `lobbies/${lobbyCode}/players/${currentPlayerId}`);
            set(newPlayerRef, { 
                name: myName, 
                deck: myDeckId, 
                hp: 100, 
                maxHp: 100, 
                gold: 0, 
                deaths: 0, 
                extraCards: [], 
                removedCards: [], 
                items: [],
                permanentDamage: 0,
                consumables: { doubleGold: 0, halfHpEnemies: 0, bonusMana: 0, startWith10: 0 }
            });
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
        const { gameState, battle: battleData, players, log } = lobbyData;
        
        if (isHost && hostTurnTimer) {
            clearInterval(hostTurnTimer); hostTurnTimer = null;
        }


        if (!gameState) return;

        if (gameState.status === 'lobby') {
            ui.showScreen(ui.elements.multiplayerLobby);
            updatePlayerList(players || {});
        }
        else if (gameState.status === 'map_vote') {
            // Host generates map lazily
            if (isHost && !lobbyData.map) set(child(lobbyRef, 'map'), generateNewMap());
            if (lobbyData.map) {
                ui.showGameScreen('map');
                ui.renderMap(lobbyData.map, gameState, castVote);
                ui.updatePartyStats(players || {}, currentPlayerId, revivePlayerMultiplayer);

                // Host resolves votes atomically when all living players have voted
                if (isHost && lobbyData.votes) {
                    const livingPlayerCount = Object.values(players || {}).filter(p => p.hp > 0).length;
                    if (livingPlayerCount > 0 && Object.keys(lobbyData.votes || {}).length === livingPlayerCount) {
                        const nextNodeId = performTally(lobbyData.votes);
                        const nodeType = lobbyData.map.nodes[nextNodeId].type;

                        // Build single updates object
                        let updates = {};

                        switch (nodeType) {
                            case 'Normal Battle':
                            case 'Elite Battle':
                            case 'Boss':
                                updates[`/battle`] = createBattleState(nodeType, lobbyData);
                                updates[`/gameState/status`] = 'battle';
                                break;

                            case 'Rest Site':
                                updates = { ...updates, ...prepareRestSiteUpdates(lobbyData, nextNodeId) };
                                break;

                            case 'Shop':
                                updates = { ...updates, ...prepareShopUpdates(lobbyData, nextNodeId) };
                                break;

                            case 'Unknown Event':
                                updates = { ...updates, ...prepareUnknownEventUpdates(lobbyData, nextNodeId) };
                                break;
                        }

                        updates[`/gameState/currentNodeId`] = nextNodeId;
                        updates[`/votes`] = null;

                        if (nodeType !== 'Normal Battle' && nodeType !== 'Elite Battle' && nodeType !== 'Boss') {
                            updates[`/gameState/clearedNodes`] = [...(gameState.clearedNodes || [0]), nextNodeId];
                        }

                        update(lobbyRef, updates);
                    }
                }
            }
        } else if (gameState.status === 'battle') {
            if (!battleData || !battleData.players || !battleData.monsters) return;
            battleRef = ref(db, `lobbies/${currentLobby}/battle`);
            ui.showGameScreen('battle');
            const myDeckIdLocal = battleData.players[currentPlayerId]?.deckId;
            ui.updateBattleUI(battleData, currentPlayerId, myDeckIdLocal);
            ui.updateTimer(battleData.phaseEndTime);

            if (isHost) {
                const allMonstersDead = battleData.monsters.every(m => m.hp <= 0);
                if (allMonstersDead) {
                    handleVictory(battleData);
                    return;
                }
                const livingPlayers = Object.values(battleData.players).filter(p => p.hp > 0);
                if (livingPlayers.length === 0) {
                    set(child(lobbyRef, 'gameState/status'), 'defeat');
                    return;
                }
                const allPlayersWaiting = livingPlayers.every(p => p.status === 'waiting');
                if (battleData.phase === 'PLAYER_TURN' && allPlayersWaiting) {
                    startEnemyTurn();
                } else if (battleData.phase === 'PLAYER_TURN') {
                    // start host timer to force end turn if time runs out
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
        } else if (gameState.status === 'event_result') {
            ui.showGameScreen('end_battle', { 
                result: 'event_result', 
                title: gameState.currentNodeType, 
                log: log 
            }, isHost);
            
            // CORRECTED LOGIC: Explicitly manage the continue button's visibility and behavior.
            // This ensures the host can proceed after the event is resolved.
            if (ui.elements.returnToMapBtn) {
                if (isHost) {
                    ui.elements.returnToMapBtn.textContent = 'Continue';
                    ui.elements.returnToMapBtn.onclick = () => returnToMap();
                    ui.elements.returnToMapBtn.style.display = 'block';
                } else {
                    ui.elements.returnToMapBtn.style.display = 'none';
                }
            }
        } else if (gameState.status === 'event_choice') {
            // Handle Unknown Event choices
            ui.showGameScreen('end_battle', { 
                result: 'event', 
                title: 'Unknown Event',
                message: `You encountered an ${gameState.eventType}!\n\nChoose one:`
            }, false);
            
            const myPlayerRecord = (lobbyData.players || {})[currentPlayerId];
            if (!myPlayerRecord || !myPlayerRecord.madeEventChoice) {
                ui.showRewardChoices(gameState.eventChoices, (choice) => {
                    applyEventChoice(choice, currentPlayerId);
                });
            }
        } else if (gameState.status === 'shop') {
            // Handle Shop
            const myPlayerRecord = (lobbyData.players || {})[currentPlayerId];
            if (myPlayerRecord) {
                showShopUI(myPlayerRecord);
            }
        } else if (gameState.status === 'victory' || gameState.status === 'defeat') {
            ui.showGameScreen('end_battle', {result: gameState.status, goldReward: gameState.goldReward, extraRewards: gameState.extraRewards }, isHost);
            
            // Reset the return button text to "Continue" 
            if (ui.elements.returnToMapBtn) {
                ui.elements.returnToMapBtn.textContent = 'Continue';
                ui.elements.returnToMapBtn.onclick = () => isHost && returnToMap();
            }

            if (Array.isArray(gameState.extraRewards) && gameState.extraRewards.length > 0) {
                const myPlayerRecord = (lobbyData.players || {})[currentPlayerId];
                const alreadyChosen = myPlayerRecord && myPlayerRecord.choseReward;

                if (!alreadyChosen) {
                    ui.showRewardChoices(gameState.extraRewards, (reward) => applyMultiplayerReward(reward));
                } else {
                    if (ui.hideRewardChoices) ui.hideRewardChoices();
                }
            } else {
                if (ui.hideRewardChoices) ui.hideRewardChoices();
            }
        }
    });
}

function updatePlayerList(players) {
    ui.elements.playerList.innerHTML = '';
    for (const pId in (players || {})) {
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
    Object.values(votes || {}).forEach(nodeId => { voteCounts[nodeId] = (voteCounts[nodeId] || 0) + 1; });
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
        monsterTier = 'elite';
        const eliteKeys = Object.keys(monsters.elite || {});
        monsterKey = eliteKeys[Math.floor(Math.random() * eliteKeys.length)];
    } else {
        monsterTier = 'normal';
        const normalKeys = Object.keys(monsters.normal || {});
        monsterKey = normalKeys[Math.floor(Math.random() * normalKeys.length)];
    }
    const baseMonster = { ...monsters[monsterTier][monsterKey] };

    // Apply difficulty scaling based on loopCount
    const loopCount = currentLobbyData.gameState.loopCount || 0;
    if (loopCount > 0) {
        baseMonster.hp = Math.floor(baseMonster.hp * Math.pow(1.5, loopCount));
        baseMonster.attack = Math.floor(baseMonster.attack * Math.pow(1.25, loopCount));
    }

    // Count total lobby players
    const totalPlayers = Object.keys(currentLobbyData.players || {}).length;

    // Apply random debuff for Elite and Boss battles
    let activeDebuff = null;
    if (nodeType === 'Elite Battle' || nodeType === 'Boss') {
        activeDebuff = battleDebuffs[Math.floor(Math.random() * battleDebuffs.length)];
    }

    const battleState = {
        phase: 'PLAYER_TURN', 
        phaseEndTime: Date.now() + 25000,
        monsters: [{
            tier: monsterTier,
            type: monsterKey,
            name: baseMonster.name,
            hp: baseMonster.hp * totalPlayers,
            attack: baseMonster.attack,
            id: `m_${Date.now()}`
        }],
        players: {}, 
        turn: 1,
        activeDebuff: activeDebuff
    };

    // Create initial log messages
    const initialLogMessages = [];
    let halfHpApplied = false;

    for (const pId in (currentLobbyData.players || {})) {
        const player = currentLobbyData.players[pId];
        if (player.hp > 0) {
            const deckConfig = decks[player.deck];
            let baseDeck = createDeck(deckConfig, player.removedCards) || [];
            if (Array.isArray(player.extraCards) && player.extraCards.length > 0) {
                baseDeck = baseDeck.concat(player.extraCards);
            }
            const shuffledDeck = shuffleDeck(baseDeck);

            // Calculate starting mana with items and consumables
            let startingMana = 2000;
            startingMana += 10 * ((player.items || []).filter(i => i === "Increase starting mana by 10 (stackable)").length);
            startingMana += 5 * ((player.items || []).filter(i => i === "Increase starting mana by 5 (event)").length);
            startingMana -= 5 * ((player.items || []).filter(i => i === "Decrease starting mana by 5").length);
            
            // Apply consumables
            const consumables = player.consumables || {};
            if (consumables.bonusMana > 0) {
                startingMana += 10;
            }

            // Initialize starting hand
            let startingHand = [];
            if (consumables.startWith10 > 0) {
                startingHand.push("10");
            }

            battleState.players[pId] = {
                name: player.name,
                hp: player.hp,
                maxHp: player.maxHp || 100,
                mana: startingMana,
                deck: shuffledDeck,
                deckId: player.deck,
                hand: startingHand,
                sum: 0,
                charge: 0,
                status: player.hp > 0 ? 'needs_mana' : 'defeated',
                gold: player.gold || 0,
                items: [...(player.items || [])],
                permanentDamage: player.permanentDamage || 0
            };

            // Apply half HP consumable (only once)
            if (!halfHpApplied && player.consumables && player.consumables.halfHpEnemies > 0) {
                battleState.monsters.forEach(monster => {
                    monster.hp = Math.floor(monster.hp / 2);
                });
                initialLogMessages.push("Consumable weakens the enemies! They start with half HP!");
                halfHpApplied = true;
            }
        }
    }

    if (activeDebuff) {
        initialLogMessages.push(`Battle Debuff Active: ${activeDebuff}`);
    }

    // Add initial log messages as a simple object
    const log = {};
    initialLogMessages.forEach((msg, idx) => {
        log[`init_${idx}`] = { message: msg, timestamp: Date.now() };
    });
    battleState.log = log;

    return battleState;
}

function logBattleMessage(message) {
    // Check if we're in battle state before trying to log
    if (!lobbyData || lobbyData.gameState.status !== 'battle') return;
    
    const logRef = ref(db, `lobbies/${currentLobby}/battle/log`);
    const newLogEntryRef = push(logRef);
    set(newLogEntryRef, { message, timestamp: Date.now() });
}

function handleVictory(battleData) {
    if (!isHost) return;

    const monster = battleData.monsters[0];
    const monsterStats = monsters[monster.tier][monster.type];
    const goldDropRange = monsterStats.goldDrop;
    const goldReward = Math.floor(Math.random() * (goldDropRange[1] - goldDropRange[0] + 1)) + goldDropRange[0];

    const multiplier = Object.values(lobbyData.players || {}).some(p => (p.items || []).includes("Increase gold earned by 20% (unique)")) ? 1.2 : 1;
    const boostedGoldReward = Math.floor(goldReward * multiplier);
    
    const updates = {};
    for (const pId in lobbyData.players) {
        updates[`/players/${pId}/choseReward`] = null;
    }

    updates[`/gameState/status`] = 'victory';
    updates[`/gameState/goldReward`] = boostedGoldReward;

    if (monster.tier === "normal") {
        const rewards = getRandomRewards(3);
        updates[`/gameState/extraRewards`] = rewards;
    } else if (monster.tier === "elite") {
        const eliteRewards = getRandomEliteRewards(3);
        updates[`/gameState/extraRewards`] = eliteRewards;
    } else if (monster.tier === "boss") {
        const bossRewards = getRandomBossRewards(3);
        updates[`/gameState/extraRewards`] = bossRewards;
        updates[`/gameState/bossDefeated`] = true;
        updates['/gameState/loopCount'] = (lobbyData.gameState.loopCount || 0) + 1;
    } else {
        updates[`/gameState/extraRewards`] = null;
    }

    const currentNodeId = lobbyData.gameState.currentNodeId;
    updates[`/gameState/clearedNodes`] = [...(lobbyData.gameState.clearedNodes || [0]), currentNodeId];

    for (const pId in lobbyData.players) {
        const finalBattleData = battleData.players && battleData.players[pId];
        const player = lobbyData.players[pId];
        
        if (finalBattleData) {
            let newHp = finalBattleData.hp;
            let finalGold = finalBattleData.gold || player.gold || 0;

            if (finalBattleData.hp > 0) {
                // Apply gold reward
                let playerGoldReward = boostedGoldReward;
                
                // Apply double gold consumable
                if (player.consumables && player.consumables.doubleGold > 0) {
                    playerGoldReward *= 2;
                    updates[`/players/${pId}/consumables/doubleGold`] = Math.max(0, player.consumables.doubleGold - 1);
                }
                
                finalGold += playerGoldReward;
                
                // Apply healing item effect
                const playerItems = player.items || [];
                const healStacks = playerItems.filter(it => it === "Heal +2 hp after each location (stackable)").length;
                if (healStacks > 0) {
                    const maxHp = player.maxHp || 100;
                    newHp = Math.min(maxHp, newHp + (2 * healStacks));
                }

                // Apply interest item effect
                if (playerItems.includes("Earn 10% interest after each location")) {
                    const interest = Math.floor(finalGold * 0.1);
                    finalGold += interest;
                }
            }
            
            updates[`/players/${pId}/hp`] = newHp;
            updates[`/players/${pId}/gold`] = finalGold;
            
            // Preserve permanent damage bonus
            if (finalBattleData.permanentDamage) {
                updates[`/players/${pId}/permanentDamage`] = finalBattleData.permanentDamage;
            }
            
            // Decrement consumables used in battle
            if (player.consumables) {
                if (player.consumables.bonusMana > 0) {
                    updates[`/players/${pId}/consumables/bonusMana`] = Math.max(0, player.consumables.bonusMana - 1);
                }
                if (player.consumables.startWith10 > 0) {
                    updates[`/players/${pId}/consumables/startWith10`] = Math.max(0, player.consumables.startWith10 - 1);
                }
                if (player.consumables.halfHpEnemies > 0) {
                    updates[`/players/${pId}/consumables/halfHpEnemies`] = Math.max(0, player.consumables.halfHpEnemies - 1);
                }
            }
        }
    }

    update(lobbyRef, updates);
}

function applyMultiplayerReward(reward) {
    const playerRef = ref(db, `lobbies/${currentLobby}/players/${currentPlayerId}`);

    runTransaction(playerRef, (pData) => {
        if (!pData) return pData;
        pData.extraCards = pData.extraCards || [];
        pData.items = pData.items || [];
        pData.removedCards = pData.removedCards || [];

        if (reward === "card that draws two cards") {
            pData.extraCards.push("draw2");
        } else if (/^-?\d+$/.test(String(reward).trim())) {
            pData.extraCards.push(String(reward));
        } else if (reward === "+2 mana" || reward === "+1 hp" || reward === "+5 gold") {
            pData.extraCards.push(reward);
        } else if (reward === "Increase gold earned by 20% (unique)" && !(pData.items || []).includes(reward)) {
            pData.items.push(reward);
        } else if (reward === "Heal +2 hp after each location (stackable)") {
            pData.items.push(reward);
        } else if (reward === "Reduce revive cost by 20% (unique)" && !(pData.items || []).includes(reward)) {
            pData.items.push(reward);
        } else if (reward === "Increase starting mana by 10 (stackable)") {
            pData.items.push(reward);
        } else if (reward === "Gain +200 gold") {
            pData.gold = (pData.gold || 0) + 200;
        } else if (reward === "Can buy 1 mana for 1 gold") {
            if (!pData.items.includes(reward)) {
                pData.items.push(reward);
            }
        } else if (reward === "Earn 10% interest after each location") {
            if (!pData.items.includes(reward)) {
                pData.items.push(reward);
            }
        } else if (reward === "10% of gold is added to damage") {
            if (!pData.items.includes(reward)) {
                pData.items.push(reward);
            }
        } else if (reward === "Each 2 drawn permanently adds 1 damage") {
            if (!pData.items.includes(reward)) {
                pData.items.push(reward);
            }
        } else {
            pData.extraCards.push(String(reward));
        }

        pData.choseReward = true;
        return pData;
    }).then(() => {
        ui.updatePartyStats(lobbyData.players, currentPlayerId, revivePlayerMultiplayer);
        ui.renderItems(lobbyData.players[currentPlayerId].items);
        if (ui.hideRewardChoices) ui.hideRewardChoices();

        get(lobbyRef).then(snap => {
            const snapshot = snap.val();
            if (!snapshot) return;

            const livingPlayers = Object.values(snapshot.players || {}).filter(p => p.hp > 0);
            const allChosen = livingPlayers.length > 0 && livingPlayers.every(p => p.choseReward);

            if (allChosen) {
                const updates = {};
                updates[`/gameState/extraRewards`] = null;

                for (const pid in snapshot.players) {
                    if (snapshot.players[pid].choseReward) {
                        updates[`/players/${pid}/choseReward`] = null;
                    }
                }

                if (snapshot.gameState.bossDefeated && isHost) {
                    updates[`/map`] = generateNewMap();
                    updates[`/gameState/bossDefeated`] = null;
                    updates[`/gameState/clearedNodes`] = [0];
                    updates[`/gameState/currentNodeId`] = null;
                }

                update(lobbyRef, updates);
            }
        }).catch(err => {
            console.error('Error checking allChosen in applyMultiplayerReward:', err);
        });
    }).catch(err => {
        console.error('Failed to apply multiplayer reward transaction:', err);
    });
}

function revivePlayerMultiplayer(playerId) {
    if (playerId !== currentPlayerId) return;
    const playerRef = ref(db, `lobbies/${currentLobby}/players/${playerId}`);
    runTransaction(playerRef, (pData) => {
        if (pData && pData.hp <= 0) {
            let reviveCost = 50 + ((pData.deaths || 0) * 50);
            if ((pData.items || []).includes("Reduce revive cost by 20% (unique)")) {
                reviveCost = Math.floor(reviveCost * 0.8);
            }
            if (pData.gold >= reviveCost) {
                pData.gold -= reviveCost;
                pData.hp = pData.maxHp || 100;
                pData.deaths = (pData.deaths || 0) + 1;
            }
        }
        return pData;
    });
}

function prepareRestSiteUpdates(lobbySnapshotData, nodeId) {
    const updates = {};
    const log = {};
    let logCounter = 0;

    for (const pId in (lobbySnapshotData.players || {})) {
        const pData = lobbySnapshotData.players[pId];
        if (pData.hp > 0) {
            const result = engine.handleRest(pData);
            let newHp = result.updatedPlayer.hp;
            log[`log_${logCounter++}`] = { message: result.logMessage };
        
            if (Array.isArray(pData.items)) {
                const healStacks = pData.items.filter(it => it === "Heal +2 hp after each location (stackable)").length;
                if (healStacks > 0) {
                    const healAmount = 2 * healStacks;
                    newHp = Math.min((pData.maxHp || 100), newHp + healAmount);
                    log[`log_${logCounter++}`] = { message: `${pData.name}'s item heals them for an additional ${healAmount} HP.` };
                }
            }
            updates[`/players/${pId}/hp`] = newHp;

            if ((pData.items || []).includes("Earn 10% interest after each location")) {
                const interest = Math.floor((pData.gold || 0) * 0.1);
                updates[`/players/${pId}/gold`] = (pData.gold || 0) + interest;
                log[`log_${logCounter++}`] = { message: `${pData.name} earns ${interest} gold in interest.` };
            }
        }
    }

    updates[`/log`] = log;
    updates[`/gameState/status`] = 'event_result';
    updates[`/gameState/currentNodeType`] = 'Rest Site';
    updates[`/votes`] = null;
    updates[`/gameState/clearedNodes`] = [...(lobbySnapshotData.gameState?.clearedNodes || [0]), nodeId];

    return updates;
}

function prepareShopUpdates(lobbySnapshotData, nodeId) {
    const updates = {};
    const log = {};
    let logCounter = 0;

    log[`log_${logCounter++}`] = { message: `The party arrived at a Shop.` };
    
    for (const pId in (lobbySnapshotData.players || {})) {
        const pData = lobbySnapshotData.players[pId];
        if (pData.hp > 0 && Array.isArray(pData.items)) {
            const healStacks = pData.items.filter(it => it === "Heal +2 hp after each location (stackable)").length;
            if (healStacks > 0) {
                const healAmount = 2 * healStacks;
                const newHp = Math.min((pData.maxHp || 100), pData.hp + healAmount);
                updates[`/players/${pId}/hp`] = newHp;
                log[`log_${logCounter++}`] = { message: `${pData.name}'s item heals them for ${healAmount} HP.` };
            }
            
            if (pData.items.includes("Earn 10% interest after each location")) {
                const interest = Math.floor((pData.gold || 0) * 0.1);
                updates[`/players/${pId}/gold`] = (pData.gold || 0) + interest;
                log[`log_${logCounter++}`] = { message: `${pData.name} earns ${interest} gold in interest.` };
            }
        }
        
        // Generate random shop inventory for each player
        const shopInventory = [...shopItemsMasterList].sort(() => 0.5 - Math.random()).slice(0, 5);
        updates[`/players/${pId}/shopInventory`] = shopInventory;
        updates[`/players/${pId}/purchasedRemoval`] = false;
    }
    
    updates[`/log`] = log;
    updates[`/gameState/status`] = 'shop';
    updates[`/gameState/currentNodeType`] = 'Shop';
    updates[`/votes`] = null;

    return updates;
}

function showShopUI(playerData) {
    const shopInventory = playerData.shopInventory || [];
    
    let shopHTML = `<div style="background: #40444b; padding: 20px; border-radius: 10px;">`;
    shopHTML += `<h3>Welcome to the Shop!</h3>`;
    shopHTML += `<p>Your Gold: <strong>${playerData.gold}</strong></p>`;
    shopHTML += `<div style="display: grid; gap: 10px; margin-top: 20px;">`;
    
    shopInventory.forEach(item => {
        const canAfford = playerData.gold >= item.cost;
        const disabled = !canAfford || (item.action === "removeCard" && playerData.purchasedRemoval);
        
        shopHTML += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: #23272a; border-radius: 5px;">
                <span>${item.name}</span>
                <button 
                    onclick="window.handleShopPurchaseMP('${item.action}', ${item.cost})"
                    ${disabled ? 'disabled' : ''}
                    style="background: ${canAfford && !disabled ? '#7289da' : '#555'}; color: white; border: none; padding: 5px 15px; border-radius: 5px; cursor: ${canAfford && !disabled ? 'pointer' : 'not-allowed'};">
                    ${item.cost} Gold
                </button>
            </div>
        `;
    });
    
    shopHTML += `</div></div>`;
    
    // Store shop purchase handler globally for multiplayer
    window.handleShopPurchaseMP = (action, cost) => {
        handleShopPurchase(action, cost);
    };
    
    ui.showGameScreen('end_battle', { result: 'event', title: 'Shop', message: shopHTML }, false);
    
    // Show leave shop button for all players
    if (ui.elements.returnToMapBtn) {
        ui.elements.returnToMapBtn.style.display = 'inline-block';
        ui.elements.returnToMapBtn.textContent = 'Leave Shop';
        ui.elements.returnToMapBtn.onclick = () => {
            leaveShop();
        };
    }
}

function handleShopPurchase(action, cost) {
    const playerRef = ref(db, `lobbies/${currentLobby}/players/${currentPlayerId}`);
    
    runTransaction(playerRef, (pData) => {
        if (!pData || pData.gold < cost) return pData;
        
        pData.gold -= cost;
        pData.consumables = pData.consumables || { doubleGold: 0, halfHpEnemies: 0, bonusMana: 0, startWith10: 0 };
        
        switch(action) {
            case "heal10":
                pData.hp = Math.min(pData.maxHp, pData.hp + 10);
                alert("Healed 10 HP!");
                break;
            case "doubleGold":
                pData.consumables.doubleGold = (pData.consumables.doubleGold || 0) + 3;
                alert("You'll earn double gold for the next 3 encounters!");
                break;
            case "halfHp":
                pData.consumables.halfHpEnemies = (pData.consumables.halfHpEnemies || 0) + 1;
                alert("Enemies will start with half HP in the next encounter!");
                break;
            case "bonusMana":
                pData.consumables.bonusMana = (pData.consumables.bonusMana || 0) + 3;
                alert("You'll start with +10 mana for the next 3 encounters!");
                break;
            case "startWith10":
                pData.consumables.startWith10 = (pData.consumables.startWith10 || 0) + 3;
                alert("You'll start with a 10 card drawn for the next 3 encounters!");
                break;
            case "addCard":
                // Card selection will be handled separately
                pData.gold += cost; // Refund temporarily
                const choices = getRandomCardChoices(3);
                ui.showCardSelection(choices, (picked) => {
                    // Apply the card selection
                    runTransaction(playerRef, (pData2) => {
                        if (!pData2) return pData2;
                        pData2.gold -= cost; // Re-charge
                        pData2.extraCards = pData2.extraCards || [];
                        pData2.extraCards.push(picked === "card that draws two cards" ? "draw2" : picked);
                        return pData2;
                    }).then(() => {
                        alert(`Added ${picked} to your deck!`);
                    });
                });
                return pData; // Return early, card selection will handle the rest
            case "removeCard":
                if (pData.purchasedRemoval) {
                    alert("You can only remove one card per shop!");
                    pData.gold += cost; // Refund
                    return pData;
                }
                pData.purchasedRemoval = true;
                pData.gold += cost; // Refund temporarily for card removal UI
                // Show card removal UI
                showCardRemovalUIMP(pData, cost);
                return pData;
        }
        
        return pData;
    }).then(() => {
        // Refresh shop UI
        get(ref(db, `lobbies/${currentLobby}/players/${currentPlayerId}`)).then(snapshot => {
            if (snapshot.exists()) {
                showShopUI(snapshot.val());
            }
        });
    });
}

function showCardRemovalUIMP(playerData, cost) {
    const allCards = [];
    const deckConfig = decks[playerData.deck];
    
    // Add base deck cards, accounting for already removed cards
    const baseDeck = createDeck(deckConfig, playerData.removedCards);
    allCards.push(...baseDeck.map(String));
    
    // Add extra cards
    (playerData.extraCards || []).forEach(card => {
        allCards.push(String(card));
    });
    
    if (allCards.length === 0) {
        alert("No cards to remove!");
        return;
    }
    
    const cardToRemove = prompt("Which card would you like to remove? Your deck contains:\n" + 
        allCards.join(", ") + "\n\nEnter the card value to remove:");
    
    if (cardToRemove) {
        const playerRef = ref(db, `lobbies/${currentLobby}/players/${currentPlayerId}`);
        runTransaction(playerRef, (pData) => {
            if (!pData) return pData;
            
            pData.gold -= cost; // Charge for removal
            pData.extraCards = pData.extraCards || [];
            pData.removedCards = pData.removedCards || [];
            
            // Try to remove from extraCards first
            const extraCardIndex = pData.extraCards.findIndex(c => String(c) === cardToRemove);
            if (extraCardIndex > -1) {
                pData.extraCards.splice(extraCardIndex, 1);
                alert(`Removed ${cardToRemove} from your deck!`);
            } else {
                // If not in extraCards, add to removedCards list for base deck
                const baseCardExists = deckConfig.cards.some(c => String(c.v) === cardToRemove);
                if (baseCardExists) {
                    pData.removedCards.push(cardToRemove);
                    alert(`Removed ${cardToRemove} from your deck!`);
                } else {
                    alert("Card not found in your deck.");
                    pData.gold += cost; // Refund if card not found
                }
            }
            
            return pData;
        });
    }
}

function leaveShop() {
    const playerRef = ref(db, `lobbies/${currentLobby}/players/${currentPlayerId}`);
    runTransaction(playerRef, (pData) => {
        if (!pData) return pData;
        pData.leftShop = true;
        return pData;
    }).then(() => {
        // Check if all players have left the shop
        if (isHost) {
            get(lobbyRef).then(snap => {
                const snapshot = snap.val();
                if (!snapshot) return;
                
                const livingPlayers = Object.values(snapshot.players || {}).filter(p => p.hp > 0);
                const allLeft = livingPlayers.length > 0 && livingPlayers.every(p => p.leftShop);
                
                if (allLeft) {
                    const updates = {};
                    updates[`/gameState/status`] = 'map_vote';
                    updates[`/gameState/currentNodeType`] = null;
                    updates[`/gameState/clearedNodes`] = [...(snapshot.gameState?.clearedNodes || [0]), snapshot.gameState.currentNodeId];
                    
                    // Clear shop data
                    for (const pid in snapshot.players) {
                        updates[`/players/${pid}/leftShop`] = null;
                        updates[`/players/${pid}/shopInventory`] = null;
                        updates[`/players/${pid}/purchasedRemoval`] = null;
                    }
                    
                    update(lobbyRef, updates);
                }
            });
        }
    });
}

function prepareUnknownEventUpdates(lobbySnapshotData, nodeId) {
    const updates = {};
    const log = {};
    let logCounter = 0;

    // 50% chance for blessing or curse
    const isBlessing = Math.random() < 0.5;
    const eventType = isBlessing ? "Blessing" : "Curse";
    
    log[`log_${logCounter++}`] = { message: `The party encountered an Unknown Event: ${eventType}!` };
    
    const blessings = [
        "Gain 20 HP",
        "Gain 20 Max HP", 
        "Gain 25% gold",
        "Increase starting mana by 5",
        "Choose 3 cards to remove from your deck"
    ];
    
    const curses = [
        "Lose 20 HP",
        "Lose 20 Max HP",
        "Lose 25% of your gold",
        "Decrease starting mana by 5",
        "Get 3 random cards"
    ];
    
    const options = isBlessing ? blessings : curses;
    const chosenOptions = [];
    const optionsCopy = [...options];
    
    // Pick 3 random options
    for (let i = 0; i < 3 && optionsCopy.length > 0; i++) {
        const idx = Math.floor(Math.random() * optionsCopy.length);
        chosenOptions.push(optionsCopy[idx]);
        optionsCopy.splice(idx, 1);
    }
    
    // Store event choices for players to select
    updates[`/gameState/eventChoices`] = chosenOptions;
    updates[`/gameState/eventType`] = eventType;
    updates[`/gameState/status`] = 'event_choice';
    updates[`/gameState/currentNodeType`] = 'Unknown Event';
    updates[`/votes`] = null;
    
    // Apply healing item effect
    for (const pId in (lobbySnapshotData.players || {})) {
        const pData = lobbySnapshotData.players[pId];
        if (pData.hp > 0 && Array.isArray(pData.items)) {
            const healStacks = pData.items.filter(it => it === "Heal +2 hp after each location (stackable)").length;
            if (healStacks > 0) {
                const healAmount = 2 * healStacks;
                const newHp = Math.min((pData.maxHp || 100), pData.hp + healAmount);
                updates[`/players/${pId}/hp`] = newHp;
                log[`log_${logCounter++}`] = { message: `${pData.name}'s item heals them for ${healAmount} HP.` };
            }
            
            if (pData.items.includes("Earn 10% interest after each location")) {
                const interest = Math.floor((pData.gold || 0) * 0.1);
                updates[`/players/${pId}/gold`] = (pData.gold || 0) + interest;
                log[`log_${logCounter++}`] = { message: `${pData.name} earns ${interest} gold in interest.` };
            }
        }
        
        // Reset event choice marker
        updates[`/players/${pId}/madeEventChoice`] = null;
    }
    
    updates[`/log`] = log;

    return updates;
}

function applyEventChoice(choice, playerId) {
    const playerRef = ref(db, `lobbies/${currentLobby}/players/${playerId}`);
    
    runTransaction(playerRef, (pData) => {
        if (!pData || pData.madeEventChoice) return pData;
        
        pData.madeEventChoice = true;
        pData.removedCards = pData.removedCards || [];
        
        switch(choice) {
            // Blessings
            case "Gain 20 HP":
                pData.hp = Math.min((pData.maxHp || 100), (pData.hp || 0) + 20);
                break;
            case "Gain 20 Max HP":
                pData.maxHp = (pData.maxHp || 100) + 20;
                pData.hp = (pData.hp || 0) + 20;
                break;
            case "Gain 25% gold":
                pData.gold = Math.floor((pData.gold || 0) * 1.25);
                break;
            case "Increase starting mana by 5":
                pData.items = pData.items || [];
                pData.items.push("Increase starting mana by 5 (event)");
                break;
            case "Choose 3 cards to remove from your deck":
                // This would need a separate UI implementation
                pData.pendingCardRemoval = 3;
                break;
                
            // Curses
            case "Lose 20 HP":
                pData.hp = Math.max(1, (pData.hp || 100) - 20);
                break;
            case "Lose 20 Max HP":
                pData.maxHp = Math.max(20, (pData.maxHp || 100) - 20);
                pData.hp = Math.min(pData.hp, pData.maxHp);
                break;
            case "Lose 25% of your gold":
                pData.gold = Math.floor((pData.gold || 0) * 0.75);
                break;
            case "Decrease starting mana by 5":
                pData.items = pData.items || [];
                pData.items.push("Decrease starting mana by 5");
                break;
            case "Get 3 random cards":
                pData.extraCards = pData.extraCards || [];
                const randomCards = ["1","2","3","4","5","6","7","8","9","10","-1","-2"];
                for (let i = 0; i < 3; i++) {
                    pData.extraCards.push(randomCards[Math.floor(Math.random() * randomCards.length)]);
                }
                break;
        }
        
        return pData;
    }).then(() => {
        if (ui.hideRewardChoices) ui.hideRewardChoices();
        
        // Check if all players have made their choice
        if (isHost) {
            get(lobbyRef).then(snap => {
                const snapshot = snap.val();
                if (!snapshot) return;
                
                const livingPlayers = Object.values(snapshot.players || {}).filter(p => p.hp > 0);
                const allChose = livingPlayers.length > 0 && livingPlayers.every(p => p.madeEventChoice);
                
                if (allChose) {
                    const updates = {};
                    updates[`/gameState/status`] = 'event_result';
                    updates[`/gameState/eventChoices`] = null;
                    updates[`/gameState/eventType`] = null;
                    updates[`/gameState/clearedNodes`] = [...(snapshot.gameState?.clearedNodes || [0]), snapshot.gameState.currentNodeId];
                    updates[`/gameState/currentNodeType`] = 'Unknown Event'; // Set this for the event_result screen
                    
                    // Build log
                    const log = {};
                    let logCounter = 0;
                    
                    log[`log_${logCounter++}`] = { message: `Event resolved. All players have made their choices.` };
                    
                    for (const pid in snapshot.players) {
                        updates[`/players/${pid}/madeEventChoice`] = null;
                    }
                    
                    updates[`/log`] = log;
                    
                    update(lobbyRef, updates);
                }
            });
        }
    });
}

function forceEndTurn(battleData) {
    if (!isHost) return;
    
    // Create a batch of updates instead of individual transactions
    const updates = {};
    const logMessages = [];
    
    Object.keys(battleData.players).forEach(pId => {
        const pData = battleData.players[pId];
        if (pData.hp > 0 && (pData.status === 'needs_mana' || pData.status === 'acting')) {
            if (pData.status === 'needs_mana') {
                // Player with 0 mana becomes defeated
                if (pData.mana <= 0) {
                    updates[`/players/${pId}/hp`] = 0;
                    updates[`/players/${pId}/status`] = 'defeated';
                    logMessages.push(`${pData.name} has no mana left and is defeated!`);
                } else {
                    // Force an attack with 0 charge
                    pData.charge = 0;
                    const result = engine.handleAttack(pData, battleData.activeDebuff);
                    updates[`/players/${pId}`] = result.updatedPlayer;
                    result.logMessages.forEach(msg => logMessages.push(msg));
                }
            } else {
                updates[`/players/${pId}/status`] = 'waiting';
                logMessages.push(`${pData.name}'s turn ended.`);
            }
        }
    });
    
    // Apply all updates at once
    update(battleRef, updates).then(() => {
        // Log all messages
        logMessages.forEach(logBattleMessage);
    });
}

function chargeAttack() {
    const chargeValue = parseInt(ui.elements.manaInput.value, 10);
    const playerBattleRef = ref(db, `lobbies/${currentLobby}/battle/players/${currentPlayerId}`);
    
    runTransaction(playerBattleRef, (pData) => {
        if (!pData || pData.hp <= 0 || pData.status !== 'needs_mana') return pData;
        
        // Check if player has 0 mana - they should be defeated
        if (pData.mana <= 0 && pData.status === 'needs_mana') {
            pData.hp = 0;
            pData.status = 'defeated';
            logBattleMessage(`${pData.name} has no mana and is defeated!`);
            return pData;
        }
        
        // Check for "Can buy 1 mana for 1 gold" item
        if ((pData.items || []).includes("Can buy 1 mana for 1 gold")) {
            const goldAvailable = pData.gold || 0;
            const manaNeeded = Math.max(0, chargeValue - (pData.mana || 0));
            if (manaNeeded > 0 && goldAvailable >= manaNeeded) {
                pData.gold -= manaNeeded;
                pData.mana += manaNeeded;
                logBattleMessage(`${pData.name} converts ${manaNeeded} gold to mana for this combat!`);
            }
        }
        
        const result = engine.handleCharge(pData, chargeValue, lobbyData?.battle?.activeDebuff);
        if (result.error) {
            alert(result.error);
            return pData;
        }
        return result.updatedPlayer;
    });
}

function drawCard() {
    const playerRef = ref(db, `lobbies/${currentLobby}/battle/players/${currentPlayerId}`);
    runTransaction(playerRef, (pData) => {
        if (pData && pData.hp > 0 && pData.status === 'acting') {
            pData.status = 'waiting';
            
            // Handle double draw debuff
            let drawCount = 1;
            if (lobbyData?.battle?.activeDebuff === "Draw double the cards each draw") {
                drawCount = 2;
            }
            
            for (let i = 0; i < drawCount; i++) {
                const result = engine.handleDraw(pData, lobbyData?.battle?.activeDebuff);
                pData = result.updatedPlayer;
                result.logMessages.forEach(logBattleMessage);
                
                // Track 2s for permanent damage
                if (pData.items && pData.items.includes("Each 2 drawn permanently adds 1 damage")) {
                    const hand = pData.hand || [];
                    if (hand.length > 0) {
                        const lastCard = hand[hand.length - 1];
                        if (lastCard === "2" || lastCard === 2) {
                            pData.permanentDamage = (pData.permanentDamage || 0) + 1;
                            logBattleMessage(`${pData.name} gains +1 permanent damage from drawing a 2!`);
                        }
                    }
                }
                
                // If busted, stop drawing
                if (pData.busted) break;
            }
            
            return pData;
        }
        return pData;
    });
}

function performAttack() {
    const playerRef = ref(db, `lobbies/${currentLobby}/battle/players/${currentPlayerId}`);
    runTransaction(playerRef, (pData) => {
        if (pData && pData.hp > 0 && pData.status === 'acting') {
            pData.status = 'waiting';
            const result = engine.handleAttack(pData, lobbyData?.battle?.activeDebuff);
            result.logMessages.forEach(logBattleMessage);
            
            let totalDamage = result.damageDealt;
            
            // Add permanent damage bonus
            totalDamage += pData.permanentDamage || 0;
            
            // Add gold-based damage
            if (pData.items && pData.items.includes("10% of gold is added to damage")) {
                const goldBonus = Math.floor((pData.gold || 0) * 0.1);
                totalDamage += goldBonus;
                if (goldBonus > 0) {
                    logBattleMessage(`${pData.name}'s wealth adds ${goldBonus} bonus damage!`);
                }
            }
            
            if (totalDamage > 0) {
                const monsterHpRef = ref(db, `lobbies/${currentLobby}/battle/monsters/0/hp`);
                runTransaction(monsterHpRef, (hp) => Math.max(0, (hp || 0) - totalDamage));
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

        const monster = battleData.monsters[0];
        const monsterStats = { 
            ...monsters[monster.tier][monster.type],
            attack: monster.attack
        };
        
        update(battleRef, { phase: 'ENEMY_TURN', phaseEndTime: Date.now() + 3000 });
        setTimeout(() => {
            const damageUpdates = {};
            const lobbyPlayerUpdates = {};
            const livingPlayers = Object.entries(battleData.players).filter(([id, data]) => data.hp > 0);
            if (livingPlayers.length === 0) return;

            const [targetPlayerId, targetPlayerData] = livingPlayers[Math.floor(Math.random() * livingPlayers.length)];
            if (Math.random() < monsterStats.hitChance) {
                const newHp = Math.max(0, targetPlayerData.hp - monsterStats.attack);
                damageUpdates[`/players/${targetPlayerId}/hp`] = newHp;
                lobbyPlayerUpdates[`/players/${targetPlayerId}/hp`] = newHp;
                logBattleMessage(`${monster.name} hits ${targetPlayerData.name} for ${monsterStats.attack} damage!`);
                if (newHp <= 0) {
                    logBattleMessage(`${targetPlayerData.name} has been defeated!`);
                    damageUpdates[`/players/${targetPlayerId}/status`] = 'defeated';
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
                            // CORRECTED LOGIC: Remove the premature death check.
                            // A player with a charge can act. Otherwise, they need mana.
                            // The death check will happen correctly when they try to charge with 0 mana.
                            if (pData.charge > 0) {
                                nextTurnUpdates[`players/${pId}/status`] = 'acting';
                            } else {
                                nextTurnUpdates[`players/${pId}/status`] = 'needs_mana';
                            }
                        }
                    }
                    update(battleRef, nextTurnUpdates);
                });
            }, 2000);
        }, 1000);
    });
}

function clearDebuffUI() {
    const debuffEl = document.getElementById("active-debuff-display");
    if(debuffEl) {
        debuffEl.remove();
    }
}

function returnToMap() {
    if (!isHost) return;

    clearDebuffUI();

    const updates = {
        '/gameState/status': 'map_vote',
        '/gameState/goldReward': null,
        '/battle': null,
        '/gameState/extraRewards': null,
    };
    update(lobbyRef, updates);
}