export function generateMap() {
    const map = { nodes: {}, connections: [] };
    const levels = 5;
    let nodeCounter = 0;
    const nodesPerLevel = [1, 2, 3, 2, 1]; // Example structure
    let levelParents = [];

    for (let i = 0; i < levels; i++) {
        let currentLevelNodes = [];
        for (let j = 0; j < nodesPerLevel[i]; j++) {
            const nodeId = `node-${nodeCounter}`;
            map.nodes[nodeId] = { id: nodeId, level: i, cleared: false };
            currentLevelNodes.push(nodeId);
            if (i > 0) {
                // Connect to parent level nodes in a staggered way
                const parentNode = levelParents[j % levelParents.length];
                map.connections.push({ from: parentNode, to: nodeId });
                // Add extra connections for more branching
                if (levelParents.length > 1 && j > 0) {
                     const secondParent = levelParents[(j-1) % levelParents.length];
                     if(secondParent !== parentNode) {
                         map.connections.push({ from: secondParent, to: nodeId });
                     }
                }
            }
            nodeCounter++;
        }
        levelParents = currentLevelNodes;
    }
    const bossId = 'node-boss';
    map.nodes[bossId] = { id: bossId, level: levels, cleared: false };
    levelParents.forEach(parentId => map.connections.push({ from: parentId, to: bossId }));
    return map;
}

export function createDeck(deckConfig) {
    const deck = [];
    deckConfig.cards.forEach(cardInfo => {
        for (let i = 0; i < cardInfo.c; i++) {
            deck.push(cardInfo.v);
        }
    });
    return deck;
}

export function shuffleDeck(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}