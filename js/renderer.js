import { decks, firebaseConfig } from './config.js';
import { elements, showScreen, updateDeckDetails } from './ui.js';
import * as singleplayer from './singleplayer.js';
import * as multiplayer from './multiplayer.js';


function init() {
    // Initial setup
    updateDeckDetails();
    elements.deckSelect.addEventListener('change', updateDeckDetails);

    // Main menu listeners
    elements.singlePlayerBtn.addEventListener('click', () => {
        const playerName = elements.playerNameInput.value.trim();
        if (!playerName) {
            alert('Please enter a name.');
            return;
        }
        singleplayer.start(playerName, elements.deckSelect.value);
    });

    elements.multiplayerBtn.addEventListener('click', () => {
        const playerName = elements.playerNameInput.value.trim();
        if (!playerName) {
            alert('Please enter a name.');
            return;
        }
        multiplayer.init(firebaseConfig, playerName, elements.deckSelect.value);
        showScreen(elements.multiplayerLobby);
    });

    elements.backToMainMenuBtn.addEventListener('click', () => {
        // This is a simple reload, but a more complex app might disconnect from Firebase here
        window.location.reload();
    });
}

// Start the application
init();