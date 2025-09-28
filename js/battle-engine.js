/**
 * battle-engine.js
 *
 * Pure game logic for battle turns. No Firebase / DOM code here.
 * Exports: handleCharge, computeHandSum, handleDraw, handleAttack, handleRest
 */

import { decks } from './config.js';
import { shuffleDeck, createDeck } from './game-logic.js';

/**
 * computeHandSum(hand)
 * Only integer-like card strings (e.g. "1", "-2", "11") count toward the numeric sum.
 */
export function computeHandSum(hand) {
    if (!Array.isArray(hand)) return 0;
    return hand.reduce((acc, card) => {
        if (typeof card === 'number') return acc + card;
        if (typeof card === 'string' && /^-?\d+$/.test(card.trim())) return acc + parseInt(card, 10);
        return acc;
    }, 0);
}

/**
 * getJackpotForPlayer(pData)
 * Determine the jackpot (target) for the given player object (based on their deck).
 * Falls back to Infinity if deck info missing.
 */
function getJackpotForPlayer(pData) {
    const deckConfig = pData && pData.deckId ? decks[pData.deckId] : null;
    const jackpot = deckConfig && typeof deckConfig.jackpot !== 'undefined' ? Number(deckConfig.jackpot) : Infinity;
    return Number.isFinite(jackpot) ? jackpot : Infinity;
}

/**
 * isBusted(pData)
 * Pure check: does current hand sum exceed the jackpot?
 */
function isBusted(pData) {
    const sum = computeHandSum(pData.hand || []);
    const jackpot = getJackpotForPlayer(pData);
    return sum > jackpot;
}

/**
 * handleCharge(pData, chargeValue)
 * Subtracts chargeValue from current mana and sets status so player can act.
 */
export function handleCharge(pData, chargeValue) {
    if (!pData || pData.hp <= 0 || pData.status === 'defeated') {
        return { error: 'Defeated players cannot act.' };
    }
    if (isNaN(chargeValue) || chargeValue < 0 || chargeValue > (pData.mana || 0)) {
        return { error: 'Invalid mana investment.' };
    }
    pData.charge = chargeValue;
    pData.mana = (pData.mana || 0) - chargeValue;
    pData.status = 'acting'; // after charge, player can draw/attack
    pData.sum = computeHandSum(pData.hand || []);
    return { updatedPlayer: pData };
}

/**
 * handleDraw(playerData)
 * - Draws 1 card, if it's a draw2 draws up to 2 extra cards one-by-one.
 * - Applies effects for special cards (+2 mana, +1 hp, +5 gold).
 * - After each draw, recomputes sum and checks for bust. If busted:
 *     - Clear the current hand (player loses that hand)
 *     - reset sum and charge
 *     - set status to 'needs_mana' so player must invest again before drawing
 *     - set busted = true
 */
export function handleDraw(playerData) {
    const logMessages = [];
    if (!playerData || playerData.hp <= 0 || playerData.status === 'defeated') {
        logMessages.push(`${playerData?.name || 'Player'} cannot draw (defeated).`);
        return { updatedPlayer: playerData, logMessages };
    }

    // ensure structures exist
    playerData.hand = playerData.hand || [];
    playerData.deck = playerData.deck || [];

    if (playerData.deck.length === 0) {
        logMessages.push(`${playerData.name || 'Player'}'s deck is empty!`);
        playerData.sum = computeHandSum(playerData.hand || []);
        return { updatedPlayer: playerData, logMessages };
    }

    // helper to apply special effects (non-numeric)
    const applyEffect = (c) => {
        if (c === '+2 mana') {
            playerData.mana = (playerData.mana || 0) + 2;
            logMessages.push(`${playerData.name} gains +2 mana!`);
        } else if (c === '+1 hp') {
            playerData.hp = (playerData.hp || 0) + 1;
            if (typeof playerData.maxHp === 'number') {
                playerData.hp = Math.min(playerData.hp, playerData.maxHp);
            }
            logMessages.push(`${playerData.name} heals +1 HP!`);
        } else if (c === '+5 gold') {
            playerData.gold = (playerData.gold || 0) + 5;
            logMessages.push(`${playerData.name} gains +5 gold!`);
        }
    };

    // draw the primary card
    const card = playerData.deck.pop();
    playerData.hand.push(card);
    logMessages.push(`${playerData.name} drew ${card}`);

    // if draw2, draw extra cards one-by-one
    if (card === 'draw2' || card === 'card that draws two cards') {
        logMessages.push(`${playerData.name} draws 2 more cards!`);
        for (let i = 0; i < 2; i++) {
            if (!playerData.deck || playerData.deck.length === 0) break;
            const extraCard = playerData.deck.pop();
            playerData.hand.push(extraCard);
            logMessages.push(`${playerData.name} also drew ${extraCard}`);

            applyEffect(extraCard);

            // recompute sum and check for bust immediately
            playerData.sum = computeHandSum(playerData.hand);
            if (isBusted(playerData)) {
                const jackpot = getJackpotForPlayer(playerData);
                logMessages.push(`${playerData.name} exceeded the jackpot (sum ${playerData.sum} > ${jackpot}). They lose their hand and must invest more mana.`);
                playerData.hand = [];
                playerData.sum = 0;
                playerData.charge = 0;
                playerData.status = 'needs_mana';
                playerData.busted = true;
                return { updatedPlayer: playerData, logMessages };
            }
        }
    } else {
        applyEffect(card);
    }

    // final sum check after draw
    playerData.sum = computeHandSum(playerData.hand);
    if (isBusted(playerData)) {
        const jackpot = getJackpotForPlayer(playerData);
        logMessages.push(`${playerData.name} exceeded the jackpot (sum ${playerData.sum} > ${jackpot}). They lose their hand and must invest more mana.`);
        playerData.hand = [];
        playerData.sum = 0;
        playerData.charge = 0;
        playerData.status = 'needs_mana';
        playerData.busted = true;
    } else {
        playerData.busted = false;
    }

    return { updatedPlayer: playerData, logMessages };
}

/**
 * handleAttack(pData)
 * - Returns charge + profit/loss depending on multiplier.
 * - Clears hand, resets sum/charge, resets busted flag.
 * - If mana <= 0 afterwards, the player is defeated.
 */
export function handleAttack(pData) {
    const logMessages = [];
    if (!pData || pData.hp <= 0 || pData.status === 'defeated') {
        logMessages.push(`${pData?.name || 'Player'} cannot attack (defeated).`);
        return { updatedPlayer: pData, damageDealt: 0, logMessages };
    }

    pData.hand = pData.hand || [];
    pData.mana = pData.mana || 0;
    pData.charge = pData.charge || 0;

    // recompute sum & jackpot
    pData.sum = computeHandSum(pData.hand || []);
    const jackpot = getJackpotForPlayer(pData);

    if (pData.sum > jackpot) {
        logMessages.push(`${pData.name} had a busted hand at attack time; they lose their hand and must invest before acting.`);
        pData.hand = [];
        pData.sum = 0;
        pData.charge = 0;
        pData.status = 'needs_mana';
        pData.busted = true;
        return { updatedPlayer: pData, damageDealt: 0, logMessages };
    }

    const deckConfig = decks[pData.deckId];
    const g = (deckConfig && typeof deckConfig.g === 'function') ? deckConfig.g : (() => 1);

    const base = pData.charge || 0;
    const multiplier = g(pData.sum || 0);
    const damage = Math.floor(base * multiplier);

    // Refund investment + profit/loss
    const manaRefund = base + Math.floor(base * (multiplier - 1));
    pData.mana = (pData.mana || 0) + manaRefund;

    logMessages.push(`${pData.name} attacks for ${damage} damage!`);
    logMessages.push(`${pData.name} regains ${manaRefund} mana (including investment).`);

    // clear hand and reset
    pData.hand = [];
    pData.sum = 0;
    pData.charge = 0;
    pData.busted = false;

    if ((pData.mana || 0) <= 0) {
        logMessages.push(`${pData.name}'s attack wasn't enough to sustain them!`);
        pData.hp = 0;
        pData.status = 'defeated';
    }

    return { updatedPlayer: pData, damageDealt: damage, logMessages };
}

export function handleRest(pData) {
    const maxHp = pData.maxHp || 100;
    const healAmount = Math.floor((Math.random() * 0.10 + 0.15) * maxHp);
    pData.hp = Math.min(maxHp, (pData.hp || 0) + healAmount);
    const logMessage = `${pData.name} rests and recovers ${healAmount} HP.`;
    return { updatedPlayer: pData, logMessage };
}
