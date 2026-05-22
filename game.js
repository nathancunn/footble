let players = [];
let target = null;
let attempt = 0;
let status = 'playing';
let maxAttempts = 5;
let displayHistory = [];
let revealOrder = [];
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
    const dailyIndex = Math.abs(hash) % players.length;
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
    
    // Populate datalist
    const datalist = document.getElementById('players-datalist');
    datalist.innerHTML = players.map(p => `<option value="${p.name}">`).join('');
    
    // Load saved state if any
    const savedStateStr = localStorage.getItem('footbleState');
    if (savedStateStr) {
        try {
            const savedState = JSON.parse(savedStateStr);
            if (savedState.date === todayStr && savedState.targetName === target.name) {
                attempt = savedState.attempt;
                status = savedState.status;
            }
        } catch (e) {
            console.error('Failed to parse saved state');
        }
    }
    
    render();
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
        return `
            <tr>
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
            shareText = `Footble #${dayNumber} [${score}/${maxAttempts}]\n${'❌'.repeat(attempt)}⚽`;
        } else {
            shareText = `Footble #${dayNumber} [X/${maxAttempts}]\n${'❌'.repeat(maxAttempts)}`;
        }

        messageArea.innerHTML = `
            <strong>${resultMsg}</strong><br>
            <div style="display: flex; gap: 10px; margin-top: 10px; flex-wrap: wrap;">
                <button id="share-btn" style="background: #10b981; color: white; padding: 8px 12px; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Share Results</button>
            </div>
            <p style="margin-top: 15px; font-size: 0.9em; color: #54595d;">Come back tomorrow for the next player!</p>
        `;
        
        document.getElementById('share-btn').onclick = () => {
            navigator.clipboard.writeText(shareText).then(() => {
                const btn = document.getElementById('share-btn');
                btn.textContent = 'Copied!';
                setTimeout(() => btn.textContent = 'Share Results', 2000);
            }).catch(err => {
                console.error('Failed to copy text: ', err);
                alert("Failed to copy to clipboard");
            });
        };
    }
};

document.getElementById('guess-input').addEventListener('input', (e) => {
    const val = e.target.value.trim().toLowerCase();
    const btn = document.getElementById('submit-guess-btn');
    const isValidOption = players.some(p => p.name.toLowerCase() === val);
    
    // Enable button only if the input is a valid player
    btn.disabled = !isValidOption;
});

document.getElementById('guess-form').onsubmit = (e) => {
    e.preventDefault();
    const input = document.getElementById('guess-input');
    const val = input.value.trim().toLowerCase();
    const messageArea = document.getElementById('message-area');
    const btn = document.getElementById('submit-guess-btn');
    
    // Validate guess against options (fallback)
    const isValidOption = players.some(p => p.name.toLowerCase() === val);
    
    if (!isValidOption) {
        return;
    }
    
    if (val === target.name.toLowerCase()) {
        status = 'win';
    } else {
        attempt++;
        if (attempt >= maxAttempts) {
            status = 'lost';
        }
    }
    
    // Clear validation error if any
    messageArea.textContent = '';
    input.value = '';
    btn.disabled = true; // Disable button again until next valid input
    
    // Save state
    localStorage.setItem('footbleState', JSON.stringify({
        date: todayStr,
        targetName: target.name,
        attempt: attempt,
        status: status
    }));

    render();
};

initGame();
