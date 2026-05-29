let players = [];
let target = null;
let attempt = 0;
let status = 'playing';
let maxAttempts = 5;
let displayHistory = [];
let revealOrder = [];
let newlyRevealedIndex = null;
let guesses = [];
const todayStr = new Date().toISOString().split('T')[0];

const initGame = async () => {
    try {
        const response = await fetch('data.json');
        players = await response.json();
    } catch (error) {
        console.error('Failed to load player data:', error);
        return;
    }

    // Choose daily player deterministically
    let hash = 0;
    for (let i = 0; i < todayStr.length; i++) {
        hash = ((hash << 5) - hash) + todayStr.charCodeAt(i);
        hash |= 0;
    }
    const dailyIndex = Math.abs(hash * 15485863) % players.length;
    const random = players[dailyIndex];

    // Filter out "Total" rows and empty clubs
    const validHistory = random.history.filter(c =>
        c.club && c.club.trim() !== '' &&
        c.club.toLowerCase() !== 'total' &&
        c.years && c.years.toLowerCase() !== 'total'
    );

    // Sort by year for display order
    displayHistory = [...validHistory].sort((a, b) => {
        const yearA = parseInt(a.years.replace('–', '-').split('-')[0]) || 0;
        const yearB = parseInt(b.years.replace('–', '-').split('-')[0]) || 0;
        return yearA - yearB;
    });

    // Determine free reveals (< 10 apps) and progression reveals (>= 10 apps)
    const freeReveals = [];
    const progressionClubs = [];

    displayHistory.forEach((club, index) => {
        const apps = parseInt(club.apps, 10) || 0;
        if (apps < 10) {
            freeReveals.push(index);
        } else {
            progressionClubs.push({ index, apps });
        }
    });

    revealOrder = {
        free: freeReveals,
        progression: progressionClubs.sort((a, b) => a.apps - b.apps).map(item => item.index)
    };

    // Set max attempts to the number of progression clubs
    maxAttempts = Math.max(1, revealOrder.progression.length);

    target = random;


    // Load saved state if any
    const savedStateStr = localStorage.getItem('footbleState');
    if (savedStateStr) {
        try {
            const savedState = JSON.parse(savedStateStr);
            if (savedState.date === todayStr && savedState.targetName === target.name) {
                attempt = savedState.attempt;
                status = savedState.status;
                guesses = savedState.guesses || [];
            }
        } catch (e) {
            console.error('Failed to parse saved state');
        }
    }

    updateStats();
    setupOverlays();
    render();
};

const updateStats = () => {
    let stats = JSON.parse(localStorage.getItem('footbleStats')) || { played: 0, won: 0, recorded: {} };

    // If user has made at least one attempt or game is finished, mark as played for today
    if (attempt > 0 || status !== 'playing') {
        if (!stats.recorded[todayStr]) {
            stats.played++;
            stats.recorded[todayStr] = { won: false, finished: false };
        }

        if (status === 'win' && !stats.recorded[todayStr].won) {
            stats.recorded[todayStr].won = true;
            stats.recorded[todayStr].finished = true;
            stats.won++;
        } else if (status === 'lost' && !stats.recorded[todayStr].finished) {
            stats.recorded[todayStr].finished = true;
        }

        localStorage.setItem('footbleStats', JSON.stringify(stats));
    }

    const winrate = stats.played > 0 ? Math.round((stats.won / stats.played) * 100) : 0;

    // Update inline stats
    document.getElementById('stat-played').textContent = stats.played;
    document.getElementById('stat-won').textContent = stats.won;
    document.getElementById('stat-winrate').textContent = `${winrate}%`;

    // Update modal stats
    document.getElementById('modal-stat-played').textContent = stats.played;
    document.getElementById('modal-stat-won').textContent = stats.won;
    document.getElementById('modal-stat-winrate').textContent = `${winrate}%`;
};

const setupOverlays = () => {
    const helpOverlay = document.getElementById('help-overlay');
    const statsOverlay = document.getElementById('stats-overlay');
    const gameOverOverlay = document.getElementById('game-over-overlay');

    // Check if first-time visit
    const hasVisited = localStorage.getItem('footbleVisited');
    if (!hasVisited) {
        helpOverlay.classList.add('show');
    }

    // Help modal triggers
    document.getElementById('help-btn').addEventListener('click', () => {
        helpOverlay.classList.add('show');
    });

    document.getElementById('start-game-btn').addEventListener('click', () => {
        helpOverlay.classList.remove('show');
        localStorage.setItem('footbleVisited', 'true');
    });

    document.getElementById('close-help-btn').addEventListener('click', () => {
        helpOverlay.classList.remove('show');
        localStorage.setItem('footbleVisited', 'true');
    });

    // Stats modal triggers
    document.getElementById('stats-btn').addEventListener('click', () => {
        updateStats();
        statsOverlay.classList.add('show');
    });

    document.getElementById('close-stats-btn').addEventListener('click', () => {
        statsOverlay.classList.remove('show');
    });

    document.getElementById('close-stats-modal-btn').addEventListener('click', () => {
        statsOverlay.classList.remove('show');
    });

    // Game over modal triggers
    document.getElementById('close-game-over-btn').addEventListener('click', () => {
        gameOverOverlay.classList.remove('show');
    });

    document.getElementById('view-lifetime-stats-btn').addEventListener('click', () => {
        gameOverOverlay.classList.remove('show');
        updateStats();
        statsOverlay.classList.add('show');
    });

    // Close overlay on background click
    window.addEventListener('click', (e) => {
        if (e.target === helpOverlay) {
            helpOverlay.classList.remove('show');
            localStorage.setItem('footbleVisited', 'true');
        }
        if (e.target === statsOverlay) {
            statsOverlay.classList.remove('show');
        }
        if (e.target === gameOverOverlay) {
            gameOverOverlay.classList.remove('show');
        }
    });
};

const render = () => {
    const revealedIndices = [
        ...revealOrder.free,
        ...revealOrder.progression.slice(0, attempt + 1)
    ];

    // Update Table
    const tbody = document.getElementById('career-body');
    tbody.innerHTML = displayHistory.map((club, idx) => {
        const isRevealed = revealedIndices.includes(idx) || status !== 'playing';
        const isNewReveal = idx === newlyRevealedIndex;
        return `
            <tr ${isNewReveal ? 'class="highlight-reveal"' : ''}>
                <td>${isRevealed ? club.years : '????–????'}</td>
                <td>${isRevealed ? club.club : '[REDACTED]'}</td>
                <td style="text-align: center;">${isRevealed ? club.apps : '—'}</td>
                <td style="text-align: center;">${isRevealed ? club.goals : '—'}</td>
            </tr>
        `;
    }).join('');

    // Update Status
    document.getElementById('attempts-status').innerHTML = `<strong>Attempts used:</strong> ${attempt} of ${maxAttempts}`;

    // Update Form/Message
    const inputArea = document.getElementById('input-area');
    const messageArea = document.getElementById('message-area');

    if (status === 'playing') {
        inputArea.style.display = 'block';
        if (attempt > 0) {
            messageArea.style.display = 'block';
            messageArea.className = 'message';
            // Only overwrite textContent if it isn't an invalid guess message
            if (messageArea.textContent !== 'Please select a valid player from the list.') {
                messageArea.textContent = 'Incorrect guess. Next club revealed below.';
            }
        } else {
            // Might have an invalid guess message on attempt 0
            if (messageArea.textContent !== 'Please select a valid player from the list.') {
                messageArea.style.display = 'none';
            }
        }
    } else {
        inputArea.style.display = 'none';
        messageArea.style.display = 'block';
        messageArea.className = `message ${status === 'win' ? 'win' : 'error'}`;

        const resultMsg = status === 'win'
            ? `Correct! The player is ${target.name}.`
            : `Game over! The player was ${target.name}.`;
        const epochDate = new Date('2026-05-22T00:00:00');
        const currentDate = new Date(todayStr + 'T00:00:00');
        const dayNumber = Math.floor((currentDate - epochDate) / (1000 * 60 * 60 * 24)) + 1;

        let shareText = '';
        if (status === 'win') {
            const score = attempt + 1;
            shareText = `Journeymen #${dayNumber} [${score}/${maxAttempts}]\n${'❌'.repeat(attempt)}⚽\njrnymn.xyz`;
        } else {
            shareText = `Journeymen #${dayNumber} [X/${maxAttempts}]\n${'❌'.repeat(maxAttempts)}\njrnymn.xyz`;
        }

        messageArea.innerHTML = `
            <strong>${resultMsg}</strong><br>
            <div style="display: flex; gap: 10px; margin-top: 10px; flex-wrap: wrap;">
                <button id="share-btn" style="background: #10b981; color: white; padding: 8px 12px; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Share Results</button>
            </div>
            <p style="margin-top: 15px; font-size: 0.9em; color: #54595d;">Come back tomorrow for the next journeyman!</p>
        `;

        // Update Game Over Modal elements
        document.getElementById('game-over-title').textContent = status === 'win' ? '🎉 Correct!' : '💔 Game Over';
        document.getElementById('game-over-subtitle').textContent = status === 'win' ? 'You guessed the Journeyman:' : 'Today\'s Journeyman was:';
        document.getElementById('solved-player-name').textContent = target.name;
        document.getElementById('game-over-attempts').textContent = status === 'win'
            ? `Guessed in ${attempt + 1} of ${maxAttempts} attempts`
            : `Failed to guess in ${maxAttempts} attempts`;

        const copyAction = (btnElementId) => {
            navigator.clipboard.writeText(shareText).then(() => {
                const btn = document.getElementById(btnElementId);
                const originalText = btn.textContent;
                btn.textContent = 'Copied! 📋';
                setTimeout(() => btn.textContent = originalText, 2000);
            }).catch(err => {
                console.error('Failed to copy text: ', err);
                alert("Failed to copy to clipboard");
            });
        };

        document.getElementById('share-btn').onclick = () => copyAction('share-btn');
        document.getElementById('modal-share-btn').onclick = () => copyAction('modal-share-btn');
    }

    // Reset after it is rendered once so that subsequent micro-renders don't trigger the animation again
    newlyRevealedIndex = null;
};

const showAutocomplete = () => {
    const input = document.getElementById('guess-input');
    const autocompleteList = document.getElementById('autocomplete-list');
    const val = input.value.trim().toLowerCase();

    const isValidOption = players.some(p => p.name.toLowerCase() === val);
    if (!val || status !== 'playing' || isValidOption) {
        autocompleteList.style.display = 'none';
        return;
    }

    const filtered = players.filter(p =>
        p.name.toLowerCase().includes(val) &&
        !guesses.some(g => g.toLowerCase() === p.name.toLowerCase())
    ).slice(0, 5);
    if (filtered.length === 0) {
        autocompleteList.style.display = 'none';
        return;
    }

    autocompleteList.innerHTML = filtered.map(p => `<li>${p.name}</li>`).join('');
    autocompleteList.style.display = 'block';

    autocompleteList.querySelectorAll('li').forEach(li => {
        li.addEventListener('mousedown', (e) => {
            e.preventDefault(); // Prevent input blur from hiding list before click
            input.value = li.textContent;
            autocompleteList.style.display = 'none';
            input.dispatchEvent(new Event('input')); // Re-trigger validation
        });
    });
};

document.getElementById('guess-input').addEventListener('input', (e) => {
    const val = e.target.value.trim().toLowerCase();
    const btn = document.getElementById('submit-guess-btn');
    const messageArea = document.getElementById('message-area');

    const isValidOption = players.some(p => p.name.toLowerCase() === val);
    const hasAlreadyGuessed = guesses.some(g => g.toLowerCase() === val);

    if (hasAlreadyGuessed) {
        messageArea.style.display = 'block';
        messageArea.className = 'message error';
        messageArea.textContent = "You've already guessed this player!";
        btn.disabled = true;
    } else {
        if (messageArea.textContent === "You've already guessed this player!") {
            messageArea.style.display = 'none';
            messageArea.textContent = '';
        }
        btn.disabled = !isValidOption;
    }
    showAutocomplete();
});

document.getElementById('guess-input').addEventListener('focus', showAutocomplete);
document.getElementById('guess-input').addEventListener('blur', () => {
    document.getElementById('autocomplete-list').style.display = 'none';
});

document.getElementById('guess-form').onsubmit = (e) => {
    e.preventDefault();
    const input = document.getElementById('guess-input');
    const val = input.value.trim().toLowerCase();
    const messageArea = document.getElementById('message-area');
    const btn = document.getElementById('submit-guess-btn');

    // Validate guess against options (fallback)
    const isValidOption = players.some(p => p.name.toLowerCase() === val);
    const hasAlreadyGuessed = guesses.some(g => g.toLowerCase() === val);

    if (!isValidOption || hasAlreadyGuessed) {
        return;
    }

    const matchedPlayer = players.find(p => p.name.toLowerCase() === val);
    if (matchedPlayer) {
        guesses.push(matchedPlayer.name);
    }

    if (val === target.name.toLowerCase()) {
        status = 'win';
    } else {
        attempt++;
        newlyRevealedIndex = revealOrder.progression[attempt];
        if (attempt >= maxAttempts) {
            status = 'lost';
        }
    }

    // Clear validation error if any
    messageArea.textContent = '';
    input.value = '';
    btn.disabled = true; // Disable button again until next valid input
    document.getElementById('autocomplete-list').style.display = 'none';

    // Save state
    localStorage.setItem('footbleState', JSON.stringify({
        date: todayStr,
        targetName: target.name,
        attempt: attempt,
        status: status,
        guesses: guesses
    }));

    updateStats();

    // Automatically show game over overlay when game completes
    if (status === 'win' || status === 'lost') {
        setTimeout(() => {
            document.getElementById('game-over-overlay').classList.add('show');
        }, 1200);
    }

    render();
};

document.getElementById('skip-btn').onclick = () => {
    if (status !== 'playing') return;

    attempt++;
    newlyRevealedIndex = revealOrder.progression[attempt];
    if (attempt >= maxAttempts) {
        status = 'lost';
    }

    const input = document.getElementById('guess-input');
    const btn = document.getElementById('submit-guess-btn');
    input.value = '';
    btn.disabled = true;
    document.getElementById('autocomplete-list').style.display = 'none';

    // Save state
    localStorage.setItem('footbleState', JSON.stringify({
        date: todayStr,
        targetName: target.name,
        attempt: attempt,
        status: status,
        guesses: guesses
    }));

    updateStats();

    if (status === 'win' || status === 'lost') {
        setTimeout(() => {
            document.getElementById('game-over-overlay').classList.add('show');
        }, 1200);
    }

    render();
};

initGame();
