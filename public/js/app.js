
const API_BASE = new URL('../api-trivia/api/v1', document.baseURI).href.replace(/\/$/, '');

// Estado global de juego en la tablet
let publicCategories = [];
let publicCategoriesLoadedAt = 0;
let selectedCategoryId = null;
let currentGameId = sessionStorage.getItem('activeGameId') || null;
let currentQuestionId = null;
let countdownInterval = null;
let answerSubmitted = false;

// Control de audio
let audioCtx = null;
let lastBeepSecond = -1;

function getAudioContext() {
    try {
        if (!audioCtx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                audioCtx = new AudioContext();
            }
        }
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    } catch (e) {
        console.error("Error al iniciar AudioContext:", e);
    }
    return audioCtx;
}

function playPressureTick(isCritical) {
    try {
        const ctx = getAudioContext();
        if (!ctx) return;
        if (ctx.state === 'suspended') {
            ctx.resume();
        }
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = isCritical ? 'sawtooth' : 'sine';
        osc.frequency.setValueAtTime(isCritical ? 880 : 440, ctx.currentTime);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (isCritical ? 0.15 : 0.09));
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + (isCritical ? 0.15 : 0.09));
    } catch (e) {
        // El navegador puede restringir el audio
    }
}

// Estado del panel administrativo
let adminQuestionsPage = 0;
let adminQuestionsList = [];
let questionModalInstance = null;

// Inicialización
document.addEventListener('DOMContentLoaded', async () => {
    sessionStorage.removeItem('triviaBatchGameV1');
    const savedTablet = localStorage.getItem('triviaTabletCode') || 'TABLET_1';
    const tabletSelect = document.getElementById('tabletCodeSelect');

    if (tabletSelect) {
        tabletSelect.value = savedTablet;
        updateTabletBadge();
    }

    buildModalFiveOptionInputs();
    await loadPublicCategories();

    if (currentGameId) {
        activeBatch = readSavedBatch();
        if (activeBatch) {
            showPage('quiz');
            await fetchNextOrCurrentQuestion();
        } else {
            // Una partida creada con la API antigua no tiene preguntas precargadas.
            clearSavedBatch();
            showPage('setup');
        }
    }
});

function updateTabletBadge() {
    const code = document.getElementById('tabletCodeSelect').value;
    localStorage.setItem('triviaTabletCode', code);

    const badge = document.getElementById('headerTabletBadge');
    if (badge) badge.textContent = code;
}

function showPage(pageId) {
    document.querySelectorAll('main.app-main > section').forEach(sec => sec.classList.add('hidden'));

    const target = document.getElementById(pageId);
    if (target) target.classList.remove('hidden');

    document.querySelectorAll('nav.main-nav .btn-vial').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.page === pageId);
    });

    if (pageId === 'setup') loadPublicCategories();
    if (pageId === 'ranking') loadActiveRankingTab();
    if (pageId === 'admin') checkAdminSession();

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================================================
// 1. FLUJO DE JUEGO PARA LAS 3 TABLETS
// ============================================================================

async function loadPublicCategories(force = false) {
    try {
        if (force || publicCategories.length === 0 || Date.now() - publicCategoriesLoadedAt > 60000) {
            const res = await fetch(`${API_BASE}/categories`);
            if (!res.ok) throw new Error('No se pudieron cargar las categorías.');
            publicCategories = await res.json();
            publicCategoriesLoadedAt = Date.now();
        }

        const container = document.getElementById('categoriesContainer');

        if (!publicCategories.length) {
            container.innerHTML = '<p class="muted">No hay categorías activas disponibles.</p>';
            return;
        }

        if (!selectedCategoryId) {
            selectedCategoryId = publicCategories[0].id;
        }

        container.innerHTML = publicCategories.map(cat => `
            <div class="category-option ${cat.id === selectedCategoryId ? 'selected' : ''}"
                 onclick="selectCategoryCard(${cat.id})">
                <div class="fs-2">${escapeHtml(cat.icon || '🚦')}</div>
                <h5 class="fw-bold mt-2 mb-1">${escapeHtml(cat.name)}</h5>
                <small class="muted d-block">${escapeHtml(cat.description || '')}</small>
                <span class="pill mt-2">${cat.activeQuestionCount} preguntas</span>
            </div>
        `).join('');
    } catch (e) {
        console.error('Error cargando categorías:', e);
    }
}

function selectCategoryCard(catId) {
    selectedCategoryId = catId;
    loadPublicCategories();
}

// ============================================================================
// PARTIDA EN MEMORIA: 1 POST carga 5 preguntas, 1 POST guarda 5 respuestas.
// Para feedback inmediato se entrega el ID correcto; el servidor recalcula al finalizar.
// ============================================================================

const TRIVIA_BATCH_STORAGE_KEY = 'triviaBatchGameV2';
const TRIVIA_OLD_STORAGE_KEY = 'triviaBatchGameV1';
const TRIVIA_FEEDBACK_DELAY_MS = 3100;
const imagePreloadResults = new Map();
const TRIVIA_GENERIC_ERROR = 'Disculpe los inconvenientes. Reintente; si el error persiste, comunicate con el administrador.';
let activeBatch = null;
let batchSending = false;
let nextQuestionTimeout = null;
let currentQuestionPerfStart = null;

function readSavedBatch() {
    try {
        const raw = sessionStorage.getItem(TRIVIA_BATCH_STORAGE_KEY);
        const saved = raw ? JSON.parse(raw) : null;
        if (!saved || !Array.isArray(saved.questions) || saved.questions.length !== 5 ||
            saved.questions.some(q => !Number.isInteger(Number(q.correctOptionId)) ||
                !q.options.some(o => Number(o.optionId) === Number(q.correctOptionId))) ||
            !Array.isArray(saved.answers) || saved.answers.length > 5 ||
            !saved.gameId || saved.gameId !== currentGameId) return null;
        return saved;
    } catch (e) {
        console.error('Estado de partida no recuperable:', e);
        return null;
    }
}

function saveBatch() {
    if (activeBatch) {
        sessionStorage.setItem(TRIVIA_BATCH_STORAGE_KEY, JSON.stringify(activeBatch));
    }
}

function clearSavedBatch() {
    sessionStorage.removeItem(TRIVIA_BATCH_STORAGE_KEY);
    sessionStorage.removeItem(TRIVIA_OLD_STORAGE_KEY);
    sessionStorage.removeItem('activeGameId');
    sessionStorage.removeItem('activeParticipantName');
    currentGameId = null;
    currentQuestionId = null;
    activeBatch = null;
}

function showLoadingStage(message) {
    const status = document.getElementById('gameLoadingStatus');
    if (status) status.textContent = message;
}

function preloadQuizImages(questions) {
    return Promise.all(questions.map(question => new Promise(resolve => {
        if (!question.imageUrl) return resolve();
        const img = new Image();
        let settled = false;
        const finish = ok => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            imagePreloadResults.set(question.imageUrl, ok);
            img.onload = null;
            img.onerror = null;
            resolve();
        };
        const timeout = setTimeout(() => finish(false), 3500);
        img.onload = () => finish(true);
        img.onerror = () => finish(false);
        img.src = question.imageUrl;
        if (img.complete) finish(img.naturalWidth > 0);
    })));
}

function localPoints(elapsedMs, correct) {
    return correct ? Math.max(10, 50 - 10 * Math.min(4, Math.floor(elapsedMs / 2000))) : 0;
}

function getLocalScore() {
    if (!activeBatch) return 0;
    return activeBatch.answers.reduce((score, answer, index) => {
        const question = activeBatch.questions[index];
        return score + localPoints(answer.elapsedMs,
            answer.selectedOptionId !== null && answer.elapsedMs < activeBatch.questionTimeLimitMs &&
            Number(answer.selectedOptionId) === Number(question.correctOptionId));
    }, 0);
}

async function startNewGame() {
    getAudioContext();
    const nameInput = document.getElementById('participantNameInput');
    const participantName = nameInput.value.trim();
    const tabletCode = document.getElementById('tabletCodeSelect').value;
    const alertBox = document.getElementById('setupAlert');
    alertBox.classList.add('hidden');

    if (!participantName) {
        alertBox.textContent = 'Por favor, ingresá tu nombre antes de comenzar.';
        alertBox.classList.remove('hidden');
        nameInput.focus();
        return;
    }
    if (!selectedCategoryId) {
        alertBox.textContent = 'Seleccioná una categoría para jugar.';
        alertBox.classList.remove('hidden');
        return;
    }
    const startButton = document.getElementById('btnStartGame');
    if (startButton.disabled) return;
    startButton.disabled = true;
    showPage('game-loading');
    showLoadingStage('Conectando, seleccionando las 5 preguntas…');
    const slowLoadingNotice = setTimeout(() => {
        showLoadingStage('La conexión está tardando un poco. Seguimos preparando la partida…');
    }, 10000);
    try {
        const res = await fetch(`${API_BASE}/games`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ participantName, categoryId: selectedCategoryId, tabletCode })
        });
        const data = await res.json();
        if (!res.ok) {
            throw new Error(res.status >= 500 ? TRIVIA_GENERIC_ERROR : (data.message || TRIVIA_GENERIC_ERROR));
        }
        if (!data.gameId || !Array.isArray(data.questions) || data.questions.length !== 5 ||
            data.questions.some(q => !Array.isArray(q.options) || q.options.length !== 5 ||
                !Number.isInteger(Number(q.correctOptionId)) ||
                !q.options.some(opt => Number(opt.optionId) === Number(q.correctOptionId)))) {
            throw new Error('La API no devolvió las preguntas con la información necesaria para corregirlas. Instalá también el PHP actualizado.');
        }

        clearTimeout(slowLoadingNotice);
        showLoadingStage('Preguntas listas. Preparando las imágenes para empezar…');
        currentGameId = data.gameId;
        activeBatch = {
            gameId: data.gameId,
            participantName: data.participantName,
            categoryId: data.categoryId,
            tabletCode: data.tabletCode,
            questionTimeLimitMs: Number(data.questionTimeLimitMs) || 10000,
            questions: data.questions,
            answers: [],
            questionStartedAtMs: null
        };
        sessionStorage.setItem('activeGameId', currentGameId);
        sessionStorage.setItem('activeParticipantName', data.participantName);
        saveBatch();
        await preloadQuizImages(activeBatch.questions);
        showPage('quiz');
        await showCachedQuestion();
    } catch (err) {
        console.error('No se pudo iniciar la partida:', err);
        alertBox.textContent = err.message || TRIVIA_GENERIC_ERROR;
        alertBox.classList.remove('hidden');
        // Si falló la carga, conservar la partida preparada para recuperarla
        // al recargar y evitar crear otra que consuma preguntas.
        if (activeBatch && activeBatch.answers.length === 0) {
            showLoadingStage('No se pudo abrir el juego. Recargá la página para recuperar la partida.');
        } else {
            showPage('setup');
        }
    } finally {
        clearTimeout(slowLoadingNotice);
        startButton.disabled = false;
    }
}

// El frontend anterior invocaba esta función en cada pregunta.
// Se conserva el nombre, pero ya NO hace fetch al servidor.
async function fetchNextOrCurrentQuestion() {
    return showCachedQuestion();
}

async function waitQuizImage(imageElement, imageUrl, iconElement, fallbackIcon) {
    if (!imageUrl) {
        imageElement.classList.add('hidden');
        iconElement.textContent = fallbackIcon || '🚦';
        iconElement.classList.remove('hidden');
        return;
    }
    imageElement.classList.add('hidden');
    iconElement.textContent = fallbackIcon || '🚦';
    iconElement.classList.remove('hidden');
    if (imagePreloadResults.get(imageUrl) === false) return;

    // Esperar la imagen ANTES de arrancar el reloj, sin bloquear indefinidamente.
    const imageReady = new Promise(resolve => {
        const done = ok => {
            imageElement.onload = null;
            imageElement.onerror = null;
            resolve(ok);
        };
        imageElement.onload = () => done(true);
        imageElement.onerror = () => done(false);
        imageElement.src = imageUrl;
        if (imageElement.complete) done(imageElement.naturalWidth > 0);
    });
    const loaded = await Promise.race([
        imageReady,
        new Promise(resolve => setTimeout(() => resolve(false), 4000))
    ]);
    if (loaded) {
        imageElement.classList.remove('hidden');
        iconElement.classList.add('hidden');
    } else {
        imageElement.classList.add('hidden');
        iconElement.classList.remove('hidden');
    }
}

async function showCachedQuestion() {
    if (!activeBatch) return;
    clearInterval(countdownInterval);
    clearTimeout(nextQuestionTimeout);
    countdownInterval = null;
    answerSubmitted = false;
    lastBeepSecond = -1;

    const questionIndex = activeBatch.answers.length;
    if (questionIndex >= activeBatch.questions.length) {
        await finalizeBatchGame();
        return;
    }
    const question = activeBatch.questions[questionIndex];
    currentQuestionId = question.gameQuestionId;
    document.getElementById('feedbackBox').classList.add('hidden');
    document.getElementById('feedbackBox').classList.remove('trivia-feedback-right', 'trivia-feedback-wrong');
    document.getElementById('timerBadge').classList.remove('critical');
    document.getElementById('questionText').textContent = question.statement;
    document.getElementById('quizPlayerInfo').textContent =
        `${activeBatch.participantName.toUpperCase()} · PREGUNTA ${question.questionOrder}/${activeBatch.questions.length}`;
    document.getElementById('currentScore').textContent = String(getLocalScore());
    document.getElementById('progressBar').style.width =
        `${(questionIndex / activeBatch.questions.length) * 100}%`;

    const answersContainer = document.getElementById('answersContainer');
    answersContainer.replaceChildren();
    const letters = ['A', 'B', 'C', 'D', 'E'];
    question.options.forEach((opt, idx) => {
        const button = document.createElement('button');
        button.className = 'answer-btn';
        button.dataset.optionId = opt.optionId;
        button.textContent = `${letters[idx]}. ${opt.text}`;
        button.disabled = true;
        button.addEventListener('click', () => submitPlayerAnswer(opt.optionId, button));
        answersContainer.appendChild(button);
    });

    const image = document.getElementById('questionImage');
    const icon = document.getElementById('questionIcon');
    document.getElementById('timeLeft').textContent = String(Math.ceil(activeBatch.questionTimeLimitMs / 1000));
    await waitQuizImage(image, question.imageUrl, icon, question.icon);

    // Si se recargó la página, NO reiniciar el reloj de la pregunta en curso.
    // Si es nueva, el tiempo comienza después de renderizar la pregunta.
    if (activeBatch.questionStartedAtMs === null) {
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        activeBatch.questionStartedAtMs = Date.now();
        currentQuestionPerfStart = performance.now();
        saveBatch();
    } else {
        // Tras recargar, recuperar el vencimiento persistido de la pregunta.
        currentQuestionPerfStart = null;
    }
    answersContainer.querySelectorAll('button').forEach(button => button.disabled = false);
    startVisualCountdown();
}

function startVisualCountdown() {
    if (!activeBatch) return;
    clearInterval(countdownInterval);
    const timeSpan = document.getElementById('timeLeft');
    const badge = document.getElementById('timerBadge');
    const elapsedNow = () => currentQuestionPerfStart === null
        ? Math.max(0, Date.now() - activeBatch.questionStartedAtMs)
        : Math.max(0, performance.now() - currentQuestionPerfStart);

    const updateTick = () => {
        if (answerSubmitted || !activeBatch) return;
        const remainingMs = Math.max(0, activeBatch.questionTimeLimitMs - elapsedNow());
        const remainingSeconds = Math.ceil(remainingMs / 1000);
        timeSpan.textContent = remainingSeconds;
        if (remainingSeconds > 0 && remainingSeconds !== lastBeepSecond) {
            lastBeepSecond = remainingSeconds;
            playPressureTick(remainingSeconds <= 2);
        }
        badge.classList.toggle('critical', remainingMs <= 2000);
        if (remainingMs <= 0) {
            clearInterval(countdownInterval);
            submitPlayerAnswer(null, null);
        }
    };
    updateTick();
    if (!answerSubmitted) countdownInterval = setInterval(updateTick, 75);
}

function submitPlayerAnswer(selectedOptionId, clickedBtn) {
    if (!activeBatch || answerSubmitted || activeBatch.questionStartedAtMs === null) return;
    answerSubmitted = true;
    clearInterval(countdownInterval);
    const question = activeBatch.questions[activeBatch.answers.length];
    const limit = activeBatch.questionTimeLimitMs;
    const elapsedMs = Math.min(limit, Math.max(0, Math.round(currentQuestionPerfStart === null
        ? Date.now() - activeBatch.questionStartedAtMs
        : performance.now() - currentQuestionPerfStart)));
    const timedOut = selectedOptionId === null || elapsedMs >= limit;
    const finalOptionId = timedOut ? null : Number(selectedOptionId);
    const correct = !timedOut && finalOptionId === Number(question.correctOptionId);
    const points = localPoints(elapsedMs, correct);
    const correctOption = question.options.find(opt => Number(opt.optionId) === Number(question.correctOptionId));

    document.querySelectorAll('#answersContainer .answer-btn').forEach(button => {
        button.disabled = true;
        const optionId = Number(button.dataset.optionId);
        if (optionId === Number(question.correctOptionId)) button.classList.add('trivia-answer-correct');
        if (!timedOut && clickedBtn === button && !correct) button.classList.add('trivia-answer-wrong');
    });
    activeBatch.answers.push({
        gameQuestionId: currentQuestionId,
        selectedOptionId: finalOptionId,
        elapsedMs: timedOut ? limit : elapsedMs
    });
    activeBatch.questionStartedAtMs = null;
    currentQuestionPerfStart = null;
    saveBatch();
    document.getElementById('currentScore').textContent = String(getLocalScore());

    const feedback = document.getElementById('feedbackBox');
    feedback.replaceChildren();
    feedback.classList.remove('hidden', 'trivia-feedback-right', 'trivia-feedback-wrong');
    feedback.classList.add(correct ? 'trivia-feedback-right' : 'trivia-feedback-wrong');
    const title = document.createElement('strong');
    title.className = 'd-block fs-5';
    title.textContent = correct ? `✅ ¡Correcto! +${points} puntos` :
        timedOut ? '⏰ Se terminó el tiempo. 0 puntos' : '❌ Respuesta incorrecta. 0 puntos';
    feedback.appendChild(title);
    if (!correct && correctOption) {
        const answer = document.createElement('div');
        answer.className = 'mt-1';
        answer.textContent = `La respuesta correcta es: ${correctOption.text}`;
        feedback.appendChild(answer);
    }
    if (question.explanation) {
        const explanation = document.createElement('div');
        explanation.className = 'mt-1 trivia-explanation';
        explanation.textContent = question.explanation;
        feedback.appendChild(explanation);
    }
    document.getElementById('progressBar').style.width =
        `${(activeBatch.answers.length / activeBatch.questions.length) * 100}%`;

    // Feedback inmediato y avance local. Cero solicitudes HTTP entre preguntas.
    nextQuestionTimeout = setTimeout(() => {
        if (activeBatch && activeBatch.answers.length >= activeBatch.questions.length) {
            finalizeBatchGame();
        } else {
            showCachedQuestion();
        }
    }, TRIVIA_FEEDBACK_DELAY_MS);
}

async function finalizeBatchGame() {
    if (!activeBatch || batchSending) return;
    if (activeBatch.answers.length !== activeBatch.questions.length) return;
    batchSending = true;
    clearTimeout(nextQuestionTimeout);
    clearInterval(countdownInterval);
    answerSubmitted = true;

    showPage('game-loading');
    showLoadingStage('Guardando tus respuestas y calculando tu resultado oficial…');
    document.getElementById('quizPlayerInfo').textContent = 'FINALIZANDO PARTIDA';
    document.getElementById('questionText').textContent = 'Verificando tus cinco respuestas…';
    document.getElementById('timeLeft').textContent = '✓';
    document.getElementById('answersContainer').replaceChildren();
    document.getElementById('questionImage').classList.add('hidden');
    const feedback = document.getElementById('feedbackBox');
    feedback.replaceChildren();
    feedback.classList.remove('trivia-feedback-right', 'trivia-feedback-wrong');
    feedback.textContent = 'Guardando resultado oficial en el servidor…';
    feedback.classList.remove('hidden');
    try {
        const res = await fetch(`${API_BASE}/games/${currentGameId}/answers/batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ answers: activeBatch.answers })
        });
        const result = await res.json();
        if (!res.ok) {
            throw new Error(res.status >= 500 ? TRIVIA_GENERIC_ERROR : (result.message || TRIVIA_GENERIC_ERROR));
        }
        if (!result.summary || result.summary.status !== 'FINISHED') {
            throw new Error('El servidor no confirmó el resultado de la partida.');
        }
        showOfficialSummary(result.summary, result.answerDetails || []);
        clearSavedBatch();
    } catch (error) {
        console.error('Error finalizando partida:', error);
        showPage('quiz');
        feedback.replaceChildren();
        const text = document.createElement('span');
        text.textContent = `${error.message || TRIVIA_GENERIC_ERROR} `;
        const retry = document.createElement('button');
        retry.className = 'btn-secondary-vial';
        retry.textContent = 'Reintentar guardar resultado';
        retry.addEventListener('click', finalizeBatchGame);
        feedback.append(text, retry);
    } finally {
        batchSending = false;
    }
}

function showOfficialSummary(summary, answerDetails) {
    document.getElementById('resultTitle').textContent = `¡Muy bien, ${summary.participantName}!`;
    document.getElementById('resultSubtitle').textContent =
        `Categoría: ${summary.categoryName} · Dispositivo: ${summary.tabletCode}`;
    document.getElementById('resTotalScore').textContent = `${summary.totalScore} pts`;
    document.getElementById('resCorrectCount').textContent =
        `${summary.correctCount}/${summary.totalQuestions}`;
    document.getElementById('resTotalTime').textContent =
        `${(summary.totalResponseTimeMs / 1000).toFixed(2)}s`;

    const review = document.getElementById('batchAnswerReview');
    showPage('results');
}

// Compatibilidad por si otro botón del sitio intenta cargar el resumen.
async function showGameSummaryScreen() {
    if (activeBatch && activeBatch.answers.length === activeBatch.questions.length) {
        await finalizeBatchGame();
        return;
    }
    if (!currentGameId) return;
    try {
        const res = await fetch(`${API_BASE}/games/${currentGameId}`);
        const summary = await res.json();
        if (!res.ok) throw new Error(summary.message || TRIVIA_GENERIC_ERROR);
        if (summary.status !== 'FINISHED') return;
        showOfficialSummary(summary, []);
        clearSavedBatch();
    } catch (e) {
        console.error('No se pudo recuperar el resumen:', e);
    }
}

// ============================================================================
// 2. RANKING POR COMPETENCIA Y RANKING GENERAL
// ============================================================================

let activeRankingTab = 'competition';

function switchRankingTab(tab) {
    activeRankingTab = tab;

    document.getElementById('tabBtnComp').classList.toggle('active', tab === 'competition');
    document.getElementById('tabBtnGen').classList.toggle('active', tab === 'general');
    document.getElementById('rankingCompetitionView').classList.toggle('hidden', tab !== 'competition');
    document.getElementById('rankingGeneralView').classList.toggle('hidden', tab !== 'general');

    loadActiveRankingTab();
}

async function loadActiveRankingTab() {
    if (activeRankingTab === 'competition') {
        const res = await fetch(`${API_BASE}/rankings/competition?page=0&size=50`);
        const page = await res.json();
        const rows = page.content || [];
        const tbody = document.getElementById('compRankingRows');

        document.getElementById('emptyCompRanking').classList.toggle('hidden', rows.length > 0);

        tbody.innerHTML = rows.map((r, i) => {
            const medal = i === 0 ? '🥇 1' : i === 1 ? '🥈 2' : i === 2 ? '🥉 3' : `#${i + 1}`;
            const dateStr = r.finishedAt ? new Date(r.finishedAt).toLocaleTimeString('es-PY', {
                hour: '2-digit',
                minute: '2-digit'
            }) : '-';

            return `
                <tr>
                    <td><strong>${medal}</strong></td>
                    <td><strong>${escapeHtml(r.participantName)}</strong></td>
                    <td>${escapeHtml(r.categoryName)}</td>
                    <td><span class="pill">${escapeHtml(r.tabletCode)}</span></td>
                    <td>${r.correctCount}/5</td>
                    <td>${(r.totalResponseTimeMs / 1000).toFixed(2)}s</td>
                    <td><strong style="color:var(--teal);">${r.score} pts</strong></td>
                    <td>${dateStr}</td>
                </tr>
            `;
        }).join('');
    } else {
        const res = await fetch(`${API_BASE}/rankings/general?page=0&size=50`);
        const page = await res.json();
        const rows = page.content || [];
        const tbody = document.getElementById('genRankingRows');

        document.getElementById('emptyGenRanking').classList.toggle('hidden', rows.length > 0);

        tbody.innerHTML = rows.map((r, i) => {
            const medal = i === 0 ? '🥇 1' : i === 1 ? '🥈 2' : i === 2 ? '🥉 3' : `#${i + 1}`;

            return `
                <tr>
                    <td><strong>${medal}</strong></td>
                    <td><strong>${escapeHtml(r.participantName)}</strong></td>
                    <td><strong style="color:var(--teal);">${r.accumulatedScore} pts</strong></td>
                    <td>${r.finishedGamesCount} partidas</td>
                    <td>${r.totalCorrectAnswers} aciertos</td>
                    <td>${(r.bestTimeMs / 1000).toFixed(2)}s</td>
                </tr>
            `;
        }).join('');
    }
}

// ============================================================================
// 3. PANEL ADMINISTRATIVO
// ============================================================================

async function checkAdminSession() {
    try {
        const res = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' });

        if (res.ok) {
            const profile = await res.json();
            showAdminDashboard(profile);
        } else {
            document.getElementById('adminLoginBox').classList.remove('hidden');
            document.getElementById('adminDashboardBox').classList.add('hidden');
        }
    } catch (e) {
        document.getElementById('adminLoginBox').classList.remove('hidden');
        document.getElementById('adminDashboardBox').classList.add('hidden');
    }
}

async function adminLogin() {
    const username = document.getElementById('adminUsername').value.trim();
    const password = document.getElementById('adminPassword').value;
    const errBox = document.getElementById('adminLoginError');

    errBox.classList.add('hidden');

    try {
        const res = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ username, password })
        });

        const data = await res.json();

        if (!res.ok) throw new Error(data.message || 'Credenciales inválidas');

        showAdminDashboard(data);
    } catch (e) {
        errBox.textContent = e.message;
        errBox.classList.remove('hidden');
    }
}

async function adminLogout() {
    await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        credentials: 'include'
    });

    document.getElementById('adminDashboardBox').classList.add('hidden');
    document.getElementById('adminLoginBox').classList.remove('hidden');
}

async function showAdminDashboard(profile) {
    document.getElementById('adminLoginBox').classList.add('hidden');
    document.getElementById('adminDashboardBox').classList.remove('hidden');

    document.getElementById('adminWelcomePill').textContent =
        `ADMIN: ${profile.fullName.toUpperCase()}`;

    await Promise.all([loadAdminStats(), loadAdminCategories()]);
    await loadAdminQuestions(0);
}

async function loadAdminStats() {
    const res = await fetch(`${API_BASE}/admin/stats`, {
        credentials: 'include'
    });

    if (!res.ok) return;

    const st = await res.json();

    document.getElementById('statSessionCode').textContent = st.activeSessionCode;
    document.getElementById('statTotalQuestions').textContent = st.totalQuestions;
    document.getElementById('statTotalGames').textContent = st.totalGames;
    document.getElementById('statLockedQuestions').textContent =
        `${st.lockedQuestionsCount} retenidas`;
}

async function startNewCompetitionRound() {
    const customName = prompt(
        'Nombre de la nueva competencia (esto también libera las preguntas retenidas en las 3 tablets):',
        'Competencia Seguridad Vial'
    );

    if (customName === null) return;

    const res = await fetch(`${API_BASE}/admin/sessions/new`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: customName })
    });

    if (res.ok) {
        await loadAdminStats();
        alert('Nueva sesión de competencia iniciada y bloqueos de tablets liberados.');
    }
}

function switchAdminTab(tabName) {
    document.querySelectorAll('#adminDashboardBox [data-admintab]').forEach(b => {
        b.classList.toggle('active', b.dataset.admintab === tabName);
    });

    ['questions', 'categories', 'games', 'participants', 'errors'].forEach(t => {
        document.getElementById(`adminTab_${t}`).classList.toggle('hidden', t !== tabName);
    });

    if (tabName === 'questions') loadAdminQuestions(0);
    if (tabName === 'categories') loadAdminCategories();
    if (tabName === 'games') loadAdminGamesHistory();
    if (tabName === 'participants') loadAdminParticipants();
    if (tabName === 'errors') loadAdminErrors();
}

// ============================================================================
// 4. CRUD DE CATEGORÍAS
// ============================================================================

let adminCategoriesCache = [];

async function loadAdminCategories() {
    const res = await fetch(`${API_BASE}/admin/categories`, {
        credentials: 'include'
    });

    if (!res.ok) return;

    adminCategoriesCache = await res.json();

    const filterSel = document.getElementById('filterQuestionCategory');
    filterSel.innerHTML = '<option value="">Todas las categorías</option>' +
        adminCategoriesCache.map(c =>
            `<option value="${c.id}">${escapeHtml(c.icon)} ${escapeHtml(c.name)}</option>`
        ).join('');

    const modalSel = document.getElementById('qModalCategory');
    modalSel.innerHTML = adminCategoriesCache.map(c =>
        `<option value="${c.id}">${escapeHtml(c.icon)} ${escapeHtml(c.name)}</option>`
    ).join('');

    const tbody = document.getElementById('adminCategoriesRows');

    tbody.innerHTML = adminCategoriesCache.map(c => `
        <tr>
            <td>${c.id}</td>
            <td>
                <strong>${escapeHtml(c.icon)} ${escapeHtml(c.name)}</strong>
                <br>
                <small class="muted">${escapeHtml(c.slug)}</small>
            </td>
            <td>${c.activeQuestionCount}</td>
            <td>${c.active
            ? '<span class="pill">Activa</span>'
            : '<span class="badge bg-secondary">Inactiva</span>'}
            </td>
            <td>
                <button class="btn-secondary-vial py-1 px-2"
                        onclick="editCategory(${c.id})">
                    Editar
                </button>
            </td>
        </tr>
    `).join('');
}

function editCategory(id) {
    const c = adminCategoriesCache.find(x => x.id === id);
    if (!c) return;

    document.getElementById('editCategoryId').value = c.id;
    document.getElementById('catSlug').value = c.slug;
    document.getElementById('catSlug').disabled = true;
    document.getElementById('catName').value = c.name;
    document.getElementById('catIcon').value = c.icon;
    document.getElementById('catDesc').value = c.description || '';
    document.getElementById('catActive').checked = c.active;
}

function resetCategoryForm() {
    document.getElementById('editCategoryId').value = '';
    document.getElementById('catSlug').value = '';
    document.getElementById('catSlug').disabled = false;
    document.getElementById('catName').value = '';
    document.getElementById('catIcon').value = '🚦';
    document.getElementById('catDesc').value = '';
    document.getElementById('catActive').checked = true;
}

async function saveCategory() {
    const id = document.getElementById('editCategoryId').value;

    const payload = {
        slug: document.getElementById('catSlug').value.trim(),
        name: document.getElementById('catName').value.trim(),
        icon: document.getElementById('catIcon').value.trim() || '🚦',
        description: document.getElementById('catDesc').value.trim(),
        active: document.getElementById('catActive').checked
    };

    const url = id
        ? `${API_BASE}/admin/categories/${id}`
        : `${API_BASE}/admin/categories`;

    const method = id ? 'PUT' : 'POST';

    const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok) {
        alert(data.message || 'Error guardando categoría');
        return;
    }

    resetCategoryForm();
    await loadAdminCategories();
    await loadPublicCategories(true);
}

// ============================================================================
// 5. CRUD DE PREGUNTAS
// ============================================================================

function buildModalFiveOptionInputs() {
    const container = document.getElementById('qModalOptionsContainer');
    const letters = ['A', 'B', 'C', 'D', 'E'];

    container.innerHTML = letters.map((L, idx) => `
        <div class="input-group mb-2">
            <div class="input-group-text">
                <input class="form-check-input mt-0"
                       type="radio"
                       name="qModalCorrectRadio"
                       value="${idx}"
                       ${idx === 0 ? 'checked' : ''}>
                <strong class="ms-2">${L}</strong>
            </div>
            <input type="text"
                   class="form-control q-modal-opt-text"
                   placeholder="Texto de la opción ${L}">
        </div>
    `).join('');
}

function changeQuestionsPage(delta) {
    loadAdminQuestions(adminQuestionsPage + delta);
}

function openQuestionModal(questionId = null) {
    if (!questionModalInstance) {
        questionModalInstance = new bootstrap.Modal(
            document.getElementById('questionModal')
        );
    }

    document.getElementById('qModalError').classList.add('hidden');
    document.getElementById('qModalImageInput').value = '';

    const textInputs = document.querySelectorAll('.q-modal-opt-text');
    const radios = document.querySelectorAll('input[name="qModalCorrectRadio"]');

    if (!questionId) {
        document.getElementById('questionModalTitle').textContent =
            'Nueva Pregunta (5 Opciones)';

        document.getElementById('qModalId').value = '';
        document.getElementById('qModalStatement').value = '';
        document.getElementById('qModalExplanation').value = '';
        document.getElementById('qModalIcon').value = '🚦';
        document.getElementById('qModalActive').checked = true;
        document.getElementById('qModalCurrentImageBox').classList.add('hidden');

        textInputs.forEach(inp => inp.value = '');
        radios[0].checked = true;
    } else {
        const q = adminQuestionsList.find(x => x.id === questionId);
        if (!q) return;

        document.getElementById('questionModalTitle').textContent =
            `Editar Pregunta #${q.id}`;

        document.getElementById('qModalId').value = q.id;
        document.getElementById('qModalCategory').value = q.categoryId;
        document.getElementById('qModalStatement').value = q.statement;
        document.getElementById('qModalExplanation').value = q.explanation;
        document.getElementById('qModalIcon').value = q.icon || '🚦';
        document.getElementById('qModalActive').checked = q.active;

        q.options.forEach((opt, idx) => {
            if (textInputs[idx]) textInputs[idx].value = opt.text;
            if (opt.correct && radios[idx]) radios[idx].checked = true;
        });

        const imgBox = document.getElementById('qModalCurrentImageBox');

        if (q.imageUrl) {
            document.getElementById('qModalPreviewImg').src = q.imageUrl;
            imgBox.classList.remove('hidden');
        } else {
            imgBox.classList.add('hidden');
        }
    }

    questionModalInstance.show();
}

async function saveQuestionFromModal() {
    const id = document.getElementById('qModalId').value;
    const errBox = document.getElementById('qModalError');

    errBox.classList.add('hidden');

    const textInputs = Array.from(
        document.querySelectorAll('.q-modal-opt-text')
    );

    const selectedRadio = document.querySelector(
        'input[name="qModalCorrectRadio"]:checked'
    );

    const correctIdx = selectedRadio ? Number(selectedRadio.value) : 0;

    const options = textInputs.map((inp, idx) => ({
        text: inp.value.trim(),
        correct: idx === correctIdx
    }));

    const payload = {
        categoryId: Number(document.getElementById('qModalCategory').value),
        statement: document.getElementById('qModalStatement').value.trim(),
        explanation: document.getElementById('qModalExplanation').value.trim(),
        icon: document.getElementById('qModalIcon').value.trim() || '🚦',
        active: document.getElementById('qModalActive').checked,
        options
    };

    try {
        const url = id
            ? `${API_BASE}/admin/questions/${id}`
            : `${API_BASE}/admin/questions`;

        const method = id ? 'PUT' : 'POST';

        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload)
        });

        const savedQuestion = await res.json();

        if (!res.ok) {
            throw new Error(savedQuestion.message || 'Error validando la pregunta');
        }

        const fileInput = document.getElementById('qModalImageInput');

        if (fileInput.files && fileInput.files.length > 0) {
            const formData = new FormData();
            formData.append('file', fileInput.files[0]);

            const imgRes = await fetch(
                `${API_BASE}/admin/questions/${savedQuestion.id}/image`,
                {
                    method: 'POST',
                    credentials: 'include',
                    body: formData
                }
            );

            if (!imgRes.ok) {
                const imgErr = await imgRes.json();
                throw new Error(
                    imgErr.message ||
                    'La pregunta se guardó, pero la imagen fue rechazada.'
                );
            }
        }

        questionModalInstance.hide();
        await loadAdminQuestions(adminQuestionsPage);
        await loadAdminStats();
    } catch (e) {
        errBox.textContent = e.message;
        errBox.classList.remove('hidden');
    }
}

async function deleteCurrentQuestionImage() {
    const id = document.getElementById('qModalId').value;
    if (!id) return;

    const res = await fetch(`${API_BASE}/admin/questions/${id}/image`, {
        method: 'DELETE',
        credentials: 'include'
    });

    if (res.ok) {
        document.getElementById('qModalCurrentImageBox').classList.add('hidden');
        await loadAdminQuestions(adminQuestionsPage);
    }
}

// ============================================================================
// 6. HISTORIAL DE PARTIDAS
// ============================================================================

async function loadAdminGamesHistory() {
    const res = await fetch(`${API_BASE}/admin/games?page=0&size=40`, {
        credentials: 'include'
    });

    if (!res.ok) return;

    const data = await res.json();

    document.getElementById('adminGamesRows').innerHTML =
        (data.content || []).map(g => `
            <tr>
                <td><small>${escapeHtml(g.sessionCode)}</small></td>
                <td><strong>${escapeHtml(g.participantName)}</strong></td>
                <td>${escapeHtml(g.categoryName)}</td>
                <td><span class="pill">${escapeHtml(g.tabletCode)}</span></td>
                <td>${escapeHtml(g.status)}</td>
                <td><strong>${g.totalScore} pts</strong></td>
                <td>${g.correctCount}/5</td>
                <td>${(g.totalResponseTimeMs / 1000).toFixed(2)}s</td>
                <td>
                    <small>
                        ${g.startedAt
                ? new Date(g.startedAt).toLocaleString('es-PY')
                : '-'}
                    </small>
                </td>
            </tr>
        `).join('');
}

// ============================================================================
// 7. PARTICIPANTES
// ============================================================================

async function loadAdminParticipants() {
    const res = await fetch(
        `${API_BASE}/admin/participants?page=0&size=40`,
        { credentials: 'include' }
    );

    if (!res.ok) return;

    const data = await res.json();

    document.getElementById('adminParticipantsRows').innerHTML =
        (data.content || []).map(p => `
            <tr>
                <td>#${p.id}</td>
                <td><strong>${escapeHtml(p.displayName)}</strong></td>
                <td><code>${escapeHtml(p.normalizedName)}</code></td>
                <td>
                    ${p.lastPlayedAt
                ? new Date(p.lastPlayedAt).toLocaleString('es-PY')
                : '-'}
                </td>
            </tr>
        `).join('');
}

// ============================================================================
// 8. ERRORES OPERATIVOS
// ============================================================================

async function loadAdminErrors() {
    const res = await fetch(`${API_BASE}/admin/errors?page=0&size=40`, {
        credentials: 'include'
    });

    if (!res.ok) return;

    const data = await res.json();

    document.getElementById('adminErrorsRows').innerHTML =
        (data.content || []).map(err => `
            <tr>
                <td>
                    <small>
                        ${err.createdAt
                ? new Date(err.createdAt).toLocaleString('es-PY')
                : '-'}
                    </small>
                </td>
                <td><code>${escapeHtml(err.errorCode)}</code></td>
                <td>${err.httpStatus}</td>
                <td><small>${escapeHtml(err.endpoint)}</small></td>
                <td>${escapeHtml(err.message)}</td>
            </tr>
        `).join('');
}

// ============================================================================
// 9. UTILIDADES
// ============================================================================

function escapeHtml(str) {
    if (str === null || str === undefined) return '';

    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ============================================================================
// 10. LISTADO Y PAGINACIÓN DE PREGUNTAS
// ============================================================================

async function loadAdminQuestions(page) {
    adminQuestionsPage = Math.max(0, page);

    const catId = document.getElementById('filterQuestionCategory').value;
    const active = document.getElementById('filterQuestionActive').value;

    const params = new URLSearchParams({
        page: adminQuestionsPage,
        size: 15
    });

    if (catId) params.append('categoryId', catId);
    if (active !== '') params.append('active', active);

    const res = await fetch(
        `${API_BASE}/admin/questions?${params}`,
        { credentials: 'include' }
    );

    if (!res.ok) return;

    const data = await res.json();

    adminQuestionsList = data.content || [];

    document.getElementById('questionsPageInfo').textContent =
        `Página ${data.number + 1} de ${Math.max(1, data.totalPages)} (${data.totalElements} preguntas)`;

    const tbody = document.getElementById('adminQuestionsRows');

    tbody.innerHTML = adminQuestionsList.map(q => `
        <tr>
            <td>#${q.id}</td>
            <td>${escapeHtml(q.categoryName)}</td>
            <td>
                ${q.imageUrl
            ? `<img src="${escapeHtml(q.imageUrl)}" style="height:34px;border-radius:6px;">`
            : `<span class="fs-4">${escapeHtml(q.icon || '🚦')}</span>`}
            </td>
            <td><strong>${escapeHtml(q.statement)}</strong></td>
            <td>
                ${q.active
            ? '<span class="pill">Activa</span>'
            : '<span class="badge bg-secondary">Inactiva</span>'}
            </td>
            <td>
                <button class="btn-secondary-vial py-1 px-2"
                        onclick="openQuestionModal(${q.id})">
                    Editar / Imagen
                </button>
            </td>
        </tr>
    `).join('');
}
