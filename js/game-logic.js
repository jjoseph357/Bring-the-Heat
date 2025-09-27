// Corresponds to the node types you requested
const NODE_TYPES = {
    NORMAL: 'Normal Battle',
    ELITE: 'Elite Battle',
    SHOP: 'Shop',
    REST: 'Rest Site',
    EVENT: 'Unknown Event',
    BOSS: 'Boss'
};
/**
 * Main function to generate the map. Corresponds to MapGenerator.gd's generate().
 * @returns {object} A map object with nodes and connections.
 */
export function generateNewMap() {
    const planeWidth = 25, planeHeight = 40;
    const nodeCount = Math.floor(planeWidth * planeHeight / 15);
    const pathCount = 12;

    const points = [{ x: planeWidth / 2, y: 0 }, { x: planeWidth / 2, y: planeHeight }];
    const minDistance = 5, minDistanceSq = minDistance * minDistance;
    let attempts = 0;

    for (let i = 0; i < nodeCount; i++) {
        while (attempts < 2000) {
            attempts++;
            const point = { x: Math.floor(Math.random() * planeWidth), y: Math.floor(Math.random() * planeHeight) };
            if (!points.some(p => Math.pow(p.x - point.x, 2) + Math.pow(p.y - point.y, 2) < minDistanceSq)) {
                points.push(point);
                break;
            }
        }
    }
    
    const delaunay = Delaunator.from(points, p => p.x, p => p.y);
    const graph = buildGraph(points, delaunay.triangles);
    const paths = [];
    for (let i = 0; i < pathCount; i++) {
        const pathIds = findShortestPath(0, 1, graph);
        if (pathIds.length === 0) break;
        paths.push(pathIds);
        if (pathIds.length > 2) {
            graph.nodes[pathIds[Math.floor(Math.random() * (pathIds.length - 2)) + 1]].disabled = true;
        }
    }
    Object.values(graph.nodes).forEach(node => node.disabled = false);

    const finalMap = { nodes: {}, connections: [] };
    const allPathNodes = new Set(paths.flat());

    allPathNodes.forEach(id => {
        finalMap.nodes[id] = { id: id, pos: points[id], type: NODE_TYPES.NORMAL };
    });
    finalMap.nodes[0].type = 'Start';
    finalMap.nodes[1].type = NODE_TYPES.BOSS;

    // --- THIS IS THE CRITICAL FIX FOR UNREACHABLE NODES ---
    // The previous filter was too strict and removed valid connections.
    // This new logic trusts the A* paths completely.
    paths.forEach(path => {
        for (let i = 0; i < path.length - 1; i++) {
            const fromId = path[i];
            const toId = path[i + 1];
            // Only add the connection if it doesn't already exist.
            if (!finalMap.connections.some(c => c.from === fromId && c.to === toId)) {
                finalMap.connections.push({ from: fromId, to: toId });
            }
        }
    });
    // --------------------------------------------------------

    return finalMap;
}

// --- A* Pathfinding Helper Functions (Unchanged) ---
function buildGraph(points, triangles) {
    const graph = { nodes: {} };
    points.forEach((pos, id) => {
        graph.nodes[id] = { id, pos, neighbors: new Set(), disabled: false };
    });
    for (let i = 0; i < triangles.length; i += 3) {
        const p1 = triangles[i];
        const p2 = triangles[i + 1];
        const p3 = triangles[i + 2];
        graph.nodes[p1].neighbors.add(p2); graph.nodes[p1].neighbors.add(p3);
        graph.nodes[p2].neighbors.add(p1); graph.nodes[p2].neighbors.add(p3);
        graph.nodes[p3].neighbors.add(p1); graph.nodes[p3].neighbors.add(p2);
    }
    return graph;
}

function findShortestPath(startId, endId, graph) {
    const openSet = new Set([startId]);
    const cameFrom = {};
    const gScore = {};
    Object.keys(graph.nodes).forEach(id => gScore[id] = Infinity);
    gScore[startId] = 0;

    const fScore = {};
    Object.keys(graph.nodes).forEach(id => fScore[id] = Infinity);
    fScore[startId] = heuristic(graph.nodes[startId].pos, graph.nodes[endId].pos);

    while (openSet.size > 0) {
        let currentId = null;
        let lowestFScore = Infinity;
        openSet.forEach(id => {
            if (fScore[id] < lowestFScore) {
                lowestFScore = fScore[id];
                currentId = id;
            }
        });

        if (currentId === endId) {
            return reconstructPath(cameFrom, currentId);
        }

        openSet.delete(currentId);
        const currentNode = graph.nodes[currentId];

        currentNode.neighbors.forEach(neighborId => {
            const neighborNode = graph.nodes[neighborId];
            if (neighborNode.disabled) return;

            const tentativeGScore = gScore[currentId] + heuristic(currentNode.pos, neighborNode.pos);
            if (tentativeGScore < gScore[neighborId]) {
                cameFrom[neighborId] = currentId;
                gScore[neighborId] = tentativeGScore;
                fScore[neighborId] = gScore[neighborId] + heuristic(neighborNode.pos, graph.nodes[endId].pos);
                if (!openSet.has(neighborId)) {
                    openSet.add(neighborId);
                }
            }
        });
    }
    return []; // No path found
}

function reconstructPath(cameFrom, current) {
    const totalPath = [current];
    while (cameFrom[current] !== undefined) {
        current = cameFrom[current];
        totalPath.unshift(current);
    }
    return totalPath;
}

function heuristic(pos1, pos2) {
    return Math.sqrt(Math.pow(pos1.x - pos2.x, 2) + Math.pow(pos1.y - pos2.y, 2));
}


// --- Original Deck Shuffling Logic (Still Needed) ---
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
