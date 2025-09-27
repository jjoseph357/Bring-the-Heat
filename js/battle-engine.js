/**
 * This file contains the "pure" game logic for a battle turn.
 * It does not know about Firebase or local state management.
 * It takes the current state as input and returns the new state as output.
 */

import { decks } from './config.js';
import { shuffleDeck, createDeck } from './game-logic.js';

export function handleCharge(pData, chargeValue) {
    if (isNaN(chargeValue) || chargeValue < 0 || chargeValue > pData.mana) {
        return { error: 'Invalid mana investment.' };
    }
    
    pData.charge = chargeValue;
    pData.mana -= chargeValue;
    pData.status = 'acting';
    
    return { updatedPlayer: pData };
}

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
        pData.hand = [];
        pData.sum = 0;
        pData.charge = 0; // Lose the charge

        if (pData.mana <= 0) {
            logMessages.push(`${pData.name} had no mana to fall back on!`);
            pData.hp = 0;
        }
    }
    // NOTE: We no longer change the status here.

    return { updatedPlayer: pData, logMessages };
}

export function handleAttack(pData) {
    const deckConfig = decks[pData.deckId];
    const manaGained = (pData.charge || 0) * deckConfig.g(pData.sum);
    const damage = Math.floor(manaGained);
    
    let logMessages = [`${pData.name} attacks for ${damage} damage!`];

    pData.mana = Math.floor(pData.mana + manaGained);
    pData.hand = [];
    pData.sum = 0;
    pData.charge = 0; // Bet is resolved.

    if (pData.mana <= 0) {
        logMessages.push(`${pData.name}'s attack wasn't enough to sustain them!`);
        pData.hp = 0;
    }
    // NOTE: We no longer change the status here.

    return { updatedPlayer: pData, damageDealt: damage, logMessages };
}
