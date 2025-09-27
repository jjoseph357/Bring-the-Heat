/**
 * This file contains the "pure" game logic for a battle turn.
 * It does not know about Firebase or local state management.
 * It takes the current state as input and returns the new state as output.
 */

import { decks } from './config.js';

/**
 * Handles the "Charge" action for a player.
 * @param {object} pData - The current data for the player.
 * @param {number} chargeValue - The amount of mana to charge.
 * @returns {object} An object containing the updated player data or an error.
 */
export function handleCharge(pData, chargeValue) {
    if (isNaN(chargeValue) || chargeValue < 0 || chargeValue > pData.mana) {
        return { error: 'Invalid mana investment.' };
    }
    
    pData.charge = chargeValue;
    pData.mana -= chargeValue;
    pData.status = 'acting';
    
    return { updatedPlayer: pData };
}

/**
 * Handles the "Draw" action for a player.
 * @param {object} pData - The current data for the player.
 * @returns {object} An object containing the updated player data and log messages.
 */
export function handleDraw(pData) {
    if (!pData.deck || pData.deck.length === 0) {
        pData.deck = shuffleDeck(createDeck(decks[pData.deckId]));
    }
    
    const drawnCard = pData.deck.pop();
    pData.hand = pData.hand ? [...pData.hand, drawnCard] : [drawnCard];
    pData.sum += drawnCard;

    let logMessages = [`${pData.name} drew a card.`];
    const deckConfig = decks[pData.deckId];
    
    if (pData.sum > deckConfig.jackpot) {
        logMessages.push(`${pData.name} busted!`);
        pData.status = 'needs_bet';
        pData.hand = [];
        pData.sum = 0;
        pData.charge = 0; // Lose the charge

        // Check for death on bust
        if (pData.mana <= 0) {
            logMessages.push(`${pData.name} had no mana to fall back on!`);
            pData.hp = 0;
        }
    } else {
        // Successful draw, status remains 'acting' for the next turn.
    }

    return { updatedPlayer: pData, logMessages };
}

/**
 * Handles the "Attack" action for a player.
 * @param {object} pData - The current data for the player.
 * @returns {object} An object containing the updated player data, damage dealt, and log messages.
 */
export function handleAttack(pData) {
    const deckConfig = decks[pData.deckId];
    const manaGained = pData.charge * deckConfig.g(pData.sum);
    const damage = Math.floor(manaGained);
    let logMessages = [`${pData.name} attacks for ${damage} damage!`];

    pData.mana = Math.floor(pData.mana + manaGained);
    pData.status = 'needs_bet';
    pData.hand = [];
    pData.sum = 0;
    pData.charge = 0;

    // Check for death after mana resolution
    if (pData.mana <= 0) {
        logMessages.push(`${pData.name}'s attack wasn't enough to sustain them!`);
        pData.hp = 0;
    }

    return { updatedPlayer: pData, damageDealt: damage, logMessages };
}