<!DOCTYPE html>
<html lang="es">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= htmlspecialchars(NOMBRE_APP) ?></title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="<?= GestorArchivos::versionAsset('public/css/styles.css') ?>">
    <style>
        .trivia-loading-card {
            text-align: center;
            padding: clamp(2rem, 6vw, 4rem) 1.5rem;
        }

        .trivia-loader {
            width: 76px;
            height: 76px;
            margin: 0 auto 1.5rem;
            border-radius: 50%;
            border: 7px solid #e6edf5;
            border-top-color: #1478b8;
            border-right-color: #179b90;
            animation: trivia-spin 0.85s linear infinite;
        }

        @keyframes trivia-spin {
            to {
                transform: rotate(360deg);
            }
        }

        .trivia-loading-title {
            font-weight: 800;
            color: #17283c;
        }

        .trivia-loading-status {
            color: #53647a;
            min-height: 3rem;
            max-width: 32rem;
            margin: 1rem auto;
        }

        .answers-list .answer-btn.trivia-answer-correct {
            background: #e1f5e8 !important;
            border: 2px solid #189254 !important;
            color: #075a32 !important;
            opacity: 1 !important;
        }

        .answers-list .answer-btn.trivia-answer-wrong {
            background: #fff0ed !important;
            border: 2px solid #d43b31 !important;
            color: #9e251d !important;
            opacity: 1 !important;
        }

        .feedback-box.trivia-feedback-right {
            background: #eaf8ef;
            color: #17633b;
            border: 1px solid #94d7ad;
        }

        .feedback-box.trivia-feedback-wrong {
            background: #fff1ee;
            color: #922e25;
            border: 1px solid #e9a79d;
        }

        .trivia-explanation {
            font-size: 0.95rem;
            opacity: 0.92;
        }

        @media (prefers-reduced-motion:reduce) {
            .trivia-loader {
                animation: none;
            }
        }
    </style>
    <script>
        window.TRIVIA_API_BASE = <?= json_encode(Ruta::ctrRutaApi(), JSON_UNESCAPED_SLASHES) ?>;
    </script>
</head>

<body>
    <header class="app-header">
        <div class="brand">
            <div class="logo-wrapper">
                <img src="public/img/logo.png" alt="Logo Rutas" class="brand-logo">
            </div>
            ◈ Desafío de <span>Seguridad Vial</span>
        </div>
        <nav class="main-nav">
            <button class="btn-vial active" data-page="home" onclick="showPage('home')">Inicio</button>
            <button class="btn-vial" data-page="setup" onclick="showPage('setup')">Jugar</button>
            <button class="btn-vial" data-page="ranking" onclick="showPage('ranking')">Ranking</button>
            <button class="btn-vial" data-page="admin" onclick="showPage('admin')">Administrar</button>
        </nav>
    </header>

    <main class="app-main">
        <!-- 1. PANTALLA DE BIENVENIDA -->
        <section id="home">
            <div class="hero">
                <span class="pill">APRENDÉ · JUGÁ · COMPETÍ</span>
                <h1>Demostrá cuánto sabés sobre seguridad vial</h1>
                <p>Poné a prueba tus conocimientos con 5 preguntas aleatorias por partida, 5 opciones de respuesta, límite oficial de 10 segundos y competencia en simultáneo.</p>
                <div>
                    <button class="btn-primary-vial" onclick="showPage('setup')">Comenzar desafío →</button>
                </div>
            </div>

            <div class="grid-cards">
                <div class="card-vial">
                    <div class="icon-lg">🎲</div>
                    <h3>4 Categorías Viales</h3>
                    <p class="muted mb-0">Partidas dinámicas con 5 preguntas aleatorias sin repetición entre las tablets en juego.</p>
                </div>
                <div class="card-vial">
                    <div class="icon-lg">⏱️</div>
                    <h3>Reloj de 10 segundos</h3>
                    <p class="muted mb-0">Puntuación oficial calculada según tu velocidad: 50, 40, 30, 20 y 10 puntos.</p>
                </div>
                <div class="card-vial">
                    <div class="icon-lg">🏆</div>
                    <h3>Ranking de Competencia y General</h3>
                    <p class="muted mb-0">Consultá tu posición en la ronda actual y en el historial acumulado de participantes.</p>
                </div>
            </div>
        </section>

        <!-- 2. CONFIGURACIÓN DE PARTIDA -->
        <section class="hidden panel-narrow" id="setup">
            <div class="card-vial">
                <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
                    <h2 class="fw-bold m-0">Configurar Partida</h2>
                    <span class="pill">5 PREGUNTAS · MÁX 250 PTS</span>
                </div>
                <p class="muted">Ingresá tu nombre y elegí la categoría del desafío para iniciar tu partida independiente.</p>

                <div class="row g-3">
                    <div class="col-md-8">
                        <label class="fw-bold small">Nombre o Apodo del Participante</label>
                        <input class="field" id="participantNameInput" maxlength="100" placeholder="Ej. Alberto Ferreira" type="text">
                    </div>
                    <div class="col-md-4">
                        <label class="fw-bold small">Dispositivo / Tablet</label>
                        <select class="field" id="tabletCodeSelect" onchange="updateTabletBadge()">
                            <option value="TABLET_1">Tablet 1</option>
                            <option value="TABLET_2">Tablet 2</option>
                            <option value="TABLET_3">Tablet 3</option>
                        </select>
                    </div>
                </div>

                <label class="fw-bold small mt-2">Seleccioná una Categoría</label>
                <div class="category-grid" id="categoriesContainer"></div>

                <div class="alert alert-danger hidden py-2" id="setupAlert"></div>

                <button class="btn-primary-vial w-100 fs-5 mt-2" id="btnStartGame" onclick="startNewGame()">
                    ¡Comenzar Juego! →
                </button>
            </div>
        </section>

        <!-- PREPARACIÓN: visible inmediatamente durante la carga de la partida -->
        <section class="hidden panel-narrow" id="game-loading" aria-live="polite">
            <div class="card-vial trivia-loading-card" role="status">
                <div class="trivia-loader" aria-hidden="true"></div>
                <h2 class="trivia-loading-title">¡Tu desafío está por comenzar!</h2>
                <p class="trivia-loading-status" id="gameLoadingStatus">Preparando las cinco preguntas…</p>
                <span class="pill">🎯 5 PREGUNTAS · ⏱️ 10 SEGUNDOS CADA UNA</span>
                <p class="muted small mt-3 mb-0">Estamos preparando todo para que juegues sin interrupciones.</p>
            </div>
        </section>

        <!-- 3. PANTALLA DE PREGUNTA Y RESPUESTAS -->
        <section class="hidden panel-narrow" id="quiz">
            <div class="card-vial">
                <div class="topline align-items-center mb-3">
                    <span class="pill" id="quizPlayerInfo">PARTICIPANTE · 1/5</span>
                    <div class="timer-badge" id="timerBadge">⏱️ <span id="timeLeft">10</span>s</div>
                    <strong class="fs-4">⭐ <span id="currentScore">0</span> pts</strong>
                </div>

                <div class="progress-vial">
                    <div id="progressBar"></div>
                </div>

                <div class="question-media" id="questionMediaBox">
                    <span id="questionIcon">🚦</span>
                    <img alt="Imagen de la pregunta" class="hidden" id="questionImage">
                </div>

                <h3 class="fw-bold mb-3" id="questionText">Cargando pregunta...</h3>

                <div class="answers-list" id="answersContainer"></div>

                <div class="feedback-box hidden" id="feedbackBox" aria-live="polite"></div>
            </div>
        </section>

        <!-- 4. RESUMEN DE LA PARTIDA -->
        <section class="hidden panel-narrow" id="results">
            <div class="card-vial text-center">
                <div style="font-size: 64px;">🏆</div>
                <h1 class="fw-bold mt-2" id="resultTitle">¡Desafío Completado!</h1>
                <p class="muted" id="resultSubtitle">Resumen oficial registrado en el servidor</p>

                <div class="row g-3 my-3">
                    <div class="col-4">
                        <div class="p-3 rounded-4" style="background:#eff8f7;">
                            <div class="small muted fw-bold">PUNTAJE TOTAL</div>
                            <div class="fs-2 fw-bold" id="resTotalScore" style="color:var(--teal);">0</div>
                            <small class="muted">de 250 máx</small>
                        </div>
                    </div>
                    <div class="col-4">
                        <div class="p-3 rounded-4" style="background:#f3f7fa;">
                            <div class="small muted fw-bold">ACIERTOS</div>
                            <div class="fs-2 fw-bold" id="resCorrectCount">0/5</div>
                            <small class="muted">respuestas</small>
                        </div>
                    </div>
                    <div class="col-4">
                        <div class="p-3 rounded-4" style="background:#f3f7fa;">
                            <div class="small muted fw-bold">TIEMPO TOTAL</div>
                            <div class="fs-2 fw-bold" id="resTotalTime">0.0s</div>
                            <small class="muted">acumulado</small>
                        </div>
                    </div>
                </div>

                <div id="batchAnswerReview"></div>

                <div class="d-flex justify-content-center gap-2 flex-wrap mt-4">
                    <button class="btn-primary-vial" onclick="showPage('setup')">Jugar Nueva Partida</button>
                    <button class="btn-secondary-vial" onclick="showPage('ranking')">Ver Rankings</button>
                </div>
            </div>
        </section>

        <!-- 5. RANKINGS -->
        <section class="hidden" id="ranking">
            <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
                <div>
                    <h2 class="fw-bold m-0">🏆 Rankings de Participantes</h2>
                    <p class="muted m-0">Resultados persistidos en base de datos con desempate por menor tiempo de respuesta.</p>
                </div>
                <button class="btn-secondary-vial" onclick="loadActiveRankingTab()">🔄 Actualizar</button>
            </div>

            <div class="tabs-bar">
                <button class="tab-btn active" id="tabBtnComp" onclick="switchRankingTab('competition')">
                    🎯 Ranking por Competencia Actual
                </button>
                <button class="tab-btn" id="tabBtnGen" onclick="switchRankingTab('general')">
                    🌟 Ranking General Acumulado
                </button>
            </div>

            <!-- Vista 5.1: Ranking por Competencia -->
            <div class="card-vial" id="rankingCompetitionView">
                <div class="table-responsive-wrapper">
                    <table class="table-vial">
                        <thead>
                            <tr>
                                <th>Posición</th>
                                <th>Participante</th>
                                <th>Categoría</th>
                                <th>Tablet</th>
                                <th>Aciertos</th>
                                <th>Tiempo Total</th>
                                <th>Puntuación</th>
                                <th>Fecha</th>
                            </tr>
                        </thead>
                        <tbody id="compRankingRows"></tbody>
                    </table>
                </div>
                <p class="muted my-3 hidden" id="emptyCompRanking">Todavía no hay partidas finalizadas en esta competencia.</p>
            </div>

            <!-- Vista 5.2: Ranking General -->
            <div class="card-vial hidden" id="rankingGeneralView">
                <div class="table-responsive-wrapper">
                    <table class="table-vial">
                        <thead>
                            <tr>
                                <th>Posición General</th>
                                <th>Participante</th>
                                <th>Puntos Acumulados</th>
                                <th>Partidas Finalizadas</th>
                                <th>Aciertos Totales</th>
                                <th>Mejor Tiempo</th>
                            </tr>
                        </thead>
                        <tbody id="genRankingRows"></tbody>
                    </table>
                </div>
                <p class="muted my-3 hidden" id="emptyGenRanking">Todavía no hay historial acumulado.</p>
            </div>
        </section>

        <!-- 6. PANEL ADMINISTRATIVO -->
        <section class="hidden" id="admin">
            <!-- 6.1 Login Administrativo -->
            <div class="panel-narrow" id="adminLoginBox" style="max-width: 460px;">
                <div class="card-vial">
                    <span class="pill mb-2">ACCESO RESTRINGIDO</span>
                    <h3 class="fw-bold">Panel Administrativo</h3>
                    <p class="muted">Ingresá tus credenciales de administrador para gestionar el banco de preguntas, imágenes y competencias.</p>

                    <label class="fw-bold small">Usuario</label>
                    <input class="field" id="adminUsername" type="text" value="admin">

                    <label class="fw-bold small">Contraseña</label>
                    <input class="field" id="adminPassword" placeholder="••••••••" type="password">

                    <div class="alert alert-danger py-2 hidden" id="adminLoginError"></div>

                    <button class="btn-primary-vial w-100 mt-2" onclick="adminLogin()">Iniciar Sesión →</button>
                </div>
            </div>

            <!-- 6.2 Dashboard Administrativo -->
            <div class="hidden" id="adminDashboardBox">
                <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
                    <div>
                        <span class="pill" id="adminWelcomePill">ADMIN CONECTADO</span>
                        <h2 class="fw-bold m-0 mt-1">Gestión de Trivia Vial</h2>
                    </div>
                    <div class="d-flex gap-2">
                        <button class="btn-secondary-vial" onclick="startNewCompetitionRound()">🔁 Iniciar Nueva Competencia (Liberar Tablets)</button>
                        <button class="btn-danger-vial" onclick="adminLogout()">Cerrar Sesión</button>
                    </div>
                </div>

                <div class="grid-cards mb-4">
                    <div class="card-vial">
                        <small class="muted fw-bold">COMPETENCIA ACTIVA</small>
                        <h4 class="fw-bold mt-1 mb-0" id="statSessionCode">-</h4>
                    </div>
                    <div class="card-vial">
                        <small class="muted fw-bold">PREGUNTAS EN BANCO</small>
                        <h3 class="fw-bold mt-1 mb-0" id="statTotalQuestions">0</h3>
                    </div>
                    <div class="card-vial">
                        <small class="muted fw-bold">PARTIDAS JUGADAS</small>
                        <h3 class="fw-bold mt-1 mb-0" id="statTotalGames">0</h3>
                    </div>
                    <div class="card-vial">
                        <small class="muted fw-bold">PREGUNTAS BLOQUEADAS HOY</small>
                        <h3 class="fw-bold mt-1 mb-0" id="statLockedQuestions">0</h3>
                    </div>
                </div>

                <div class="tabs-bar">
                    <button class="tab-btn active" data-admintab="questions" onclick="switchAdminTab('questions')">📚 Preguntas (5 Opciones + Imagen)</button>
                    <button class="tab-btn" data-admintab="categories" onclick="switchAdminTab('categories')">🗂️ Categorías</button>
                    <button class="tab-btn" data-admintab="games" onclick="switchAdminTab('games')">🎮 Historial de Partidas</button>
                    <button class="tab-btn" data-admintab="participants" onclick="switchAdminTab('participants')">👥 Participantes</button>
                    <button class="tab-btn" data-admintab="errors" onclick="switchAdminTab('errors')">⚠️ Errores Operativos</button>
                </div>

                <!-- Sub-vista A -->
                <div class="card-vial" id="adminTab_questions">
                    <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
                        <div class="d-flex gap-2 flex-wrap align-items-center">
                            <select class="field m-0" id="filterQuestionCategory" onchange="loadAdminQuestions(0)" style="width:auto;">
                                <option value="">Todas las categorías</option>
                            </select>
                            <select class="field m-0" id="filterQuestionActive" onchange="loadAdminQuestions(0)" style="width:auto;">
                                <option value="">Todos los estados</option>
                                <option value="true">Solo Activas</option>
                                <option value="false">Solo Inactivas</option>
                            </select>
                        </div>
                        <button class="btn-primary-vial" onclick="openQuestionModal()">+ Nueva Pregunta (5 Opciones)</button>
                    </div>

                    <div class="table-responsive-wrapper">
                        <table class="table-vial">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Categoría</th>
                                    <th>Ícono/Img</th>
                                    <th>Enunciado</th>
                                    <th>Estado</th>
                                    <th>Acciones</th>
                                </tr>
                            </thead>
                            <tbody id="adminQuestionsRows"></tbody>
                        </table>
                    </div>
                    <div class="d-flex justify-content-between align-items-center mt-3">
                        <span class="small muted" id="questionsPageInfo">Página 1</span>
                        <div class="d-flex gap-2">
                            <button class="btn-secondary-vial py-1 px-3" onclick="changeQuestionsPage(-1)">Anterior</button>
                            <button class="btn-secondary-vial py-1 px-3" onclick="changeQuestionsPage(1)">Siguiente</button>
                        </div>
                    </div>
                </div>

                <!-- Sub-vista B -->
                <div class="card-vial hidden" id="adminTab_categories">
                    <div class="row g-4">
                        <div class="col-md-5">
                            <h4 class="fw-bold" id="catFormTitle">Nueva / Editar Categoría</h4>
                            <input id="editCategoryId" type="hidden">
                            <label class="small fw-bold">Código único (slug)</label>
                            <input class="field" id="catSlug" placeholder="ej. senales" type="text">
                            <label class="small fw-bold">Nombre</label>
                            <input class="field" id="catName" placeholder="Señales de tránsito" type="text">
                            <label class="small fw-bold">Ícono (Emoji)</label>
                            <input class="field" id="catIcon" type="text" value="🚦">
                            <label class="small fw-bold">Descripción</label>
                            <input class="field" id="catDesc" type="text">
                            <div class="form-check mb-3">
                                <input checked class="form-check-input" id="catActive" type="checkbox">
                                <label class="form-check-label fw-bold" for="catActive">Categoría Activa</label>
                            </div>
                            <div class="d-flex gap-2">
                                <button class="btn-primary-vial" onclick="saveCategory()">Guardar Categoría</button>
                                <button class="btn-secondary-vial" onclick="resetCategoryForm()">Limpiar</button>
                            </div>
                        </div>
                        <div class="col-md-7">
                            <h4 class="fw-bold">Categorías Registradas</h4>
                            <div class="table-responsive-wrapper">
                                <table class="table-vial">
                                    <thead>
                                        <tr>
                                            <th>ID</th>
                                            <th>Nombre</th>
                                            <th>Preguntas Activas</th>
                                            <th>Estado</th>
                                            <th>Acción</th>
                                        </tr>
                                    </thead>
                                    <tbody id="adminCategoriesRows"></tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Sub-vista C -->
                <div class="card-vial hidden" id="adminTab_games">
                    <h4 class="fw-bold mb-3">Historial Completo de Partidas</h4>
                    <div class="table-responsive-wrapper">
                        <table class="table-vial">
                            <thead>
                                <tr>
                                    <th>Sesión</th>
                                    <th>Participante</th>
                                    <th>Categoría</th>
                                    <th>Tablet</th>
                                    <th>Estado</th>
                                    <th>Puntaje</th>
                                    <th>Aciertos</th>
                                    <th>Tiempo</th>
                                    <th>Inicio</th>
                                </tr>
                            </thead>
                            <tbody id="adminGamesRows"></tbody>
                        </table>
                    </div>
                </div>

                <!-- Sub-vista D -->
                <div class="card-vial hidden" id="adminTab_participants">
                    <h4 class="fw-bold mb-3">Participantes Registrados</h4>
                    <div class="table-responsive-wrapper">
                        <table class="table-vial">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Nombre Visible</th>
                                    <th>Identificador Normalizado</th>
                                    <th>Última Partida</th>
                                </tr>
                            </thead>
                            <tbody id="adminParticipantsRows"></tbody>
                        </table>
                    </div>
                </div>

                <!-- Sub-vista E -->
                <div class="card-vial hidden" id="adminTab_errors">
                    <h4 class="fw-bold mb-3">Registro de Eventos y Errores Operativos</h4>
                    <div class="table-responsive-wrapper">
                        <table class="table-vial">
                            <thead>
                                <tr>
                                    <th>Fecha</th>
                                    <th>Código</th>
                                    <th>HTTP</th>
                                    <th>Endpoint</th>
                                    <th>Mensaje</th>
                                </tr>
                            </thead>
                            <tbody id="adminErrorsRows"></tbody>
                        </table>
                    </div>
                </div>
            </div>
        </section>
    </main>

    <!-- MODAL PARA CREAR / EDITAR PREGUNTA -->
    <div aria-hidden="true" class="modal fade" id="questionModal" tabindex="-1">
        <div class="modal-dialog modal-lg modal-dialog-scrollable">
            <div class="modal-content" style="border-radius: 18px;">
                <div class="modal-header" style="background: var(--navy); color: #fff;">
                    <h5 class="modal-title fw-bold" id="questionModalTitle">Configurar Pregunta</h5>
                    <button class="btn-close btn-close-white" data-bs-dismiss="modal" type="button"></button>
                </div>
                <div class="modal-body">
                    <input id="qModalId" type="hidden">
                    <div class="row g-2">
                        <div class="col-md-6">
                            <label class="small fw-bold">Categoría</label>
                            <select class="field" id="qModalCategory"></select>
                        </div>
                        <div class="col-md-3">
                            <label class="small fw-bold">Ícono</label>
                            <input class="field" id="qModalIcon" type="text" value="🚦">
                        </div>
                        <div class="col-md-3 d-flex align-items-center pt-3">
                            <div class="form-check">
                                <input checked class="form-check-input" id="qModalActive" type="checkbox">
                                <label class="form-check-label fw-bold" for="qModalActive">Pregunta Activa</label>
                            </div>
                        </div>
                    </div>

                    <label class="small fw-bold">Enunciado de la Pregunta</label>
                    <input class="field" id="qModalStatement" placeholder="¿Qué indica la señal...?" type="text">

                    <label class="small fw-bold">Explicación Educativa</label>
                    <input class="field" id="qModalExplanation" placeholder="La señal exige detener por completo..." type="text">

                    <hr>
                    <label class="small fw-bold d-block mb-2">5 Opciones de Respuesta (Marcá la ÚNICA correcta)</label>
                    <div id="qModalOptionsContainer"></div>

                    <hr>
                    <label class="small fw-bold">Imagen Opcional (JPEG, PNG o WebP · Máx 2 MB)</label>
                    <input accept="image/jpeg,image/png,image/webp" class="field" id="qModalImageInput" type="file">
                    <div class="hidden mt-2" id="qModalCurrentImageBox">
                        <img alt="Vista previa" id="qModalPreviewImg" src="" style="max-height: 110px; border-radius: 10px;">
                        <button class="btn-danger-vial ms-2" onclick="deleteCurrentQuestionImage()" type="button">Eliminar Imagen Actual</button>
                    </div>

                    <div class="alert alert-danger py-2 mt-2 hidden" id="qModalError"></div>
                </div>
                <div class="modal-footer">
                    <button class="btn-secondary-vial" data-bs-dismiss="modal" type="button">Cancelar</button>
                    <button class="btn-primary-vial" onclick="saveQuestionFromModal()" type="button">Guardar Pregunta</button>
                </div>
            </div>
        </div>
    </div>

    <footer class="app-footer-modern">
        <div class="footer-content">
            <span>© 2026 FERSAL · Trivia de Seguridad Vial</span>
        </div>
    </footer>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
    <script src="<?= GestorArchivos::versionAsset('public/js/app.js') ?>"></script>
</body>

</html>