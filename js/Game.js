/* ================================================================
   EFRAIN'S HOUSE
   GAME CONTROLLER — ULTRA PERFORMANCE / LOW-LAG OVERDRIVE
   ================================================================

   IMPORTANT:
   Put this AFTER your existing Game class
   and BEFORE:

       const game = new Game();

   It is designed as a drop-in optimization layer.

   PRESERVES:
   • Existing gameplay rules
   • GameState
   • AssetManager
   • UIManager
   • CameraSystem
   • EnemyAI
   • InputHandler
   • Night progression
   • Vent mechanics
   • Camera mechanics
   • Existing animations
   • Existing menus
   • Existing victory/game-over behavior

   OPTIMIZES:
   • Game timers
   • Power/Oxygen updates
   • View rotation
   • DOM lookups
   • Resize handling
   • UI refresh frequency
   • Vent UI polling
   • Background-tab CPU usage
   • Duplicate game loops
   • Animation cleanup
   • RAF cleanup
   • Timer cleanup
   • Repeated style writes
   ================================================================ */

(() => {

    /* ============================================================
       SAFETY
       ============================================================ */

    if (
        typeof Game !== 'function'
    ) {
        return;
    }

    /* ============================================================
       PRIVATE PERFORMANCE STORAGE
       ============================================================ */

    const PERF =
        Symbol('FNAE_GAME_PERFORMANCE');

    /* ============================================================
       ENSURE PERFORMANCE STATE
       ============================================================ */

    function ensurePerf(game) {

        if (game[PERF]) {
            return game[PERF];
        }

        const perf = {

            /* ----------------------------------------------------
               CORE LOOP
               ---------------------------------------------------- */

            gameTicker: null,

            gameAccumulator: 0,

            lastGameTick: 0,

            gameRunning: false,

            /* ----------------------------------------------------
               VIEW ROTATION
               ---------------------------------------------------- */

            rotationRAF: 0,

            rotationRunning: false,

            lastRenderedViewPosition:
                null,

            /* ----------------------------------------------------
               UI
               ---------------------------------------------------- */

            uiRAF: 0,

            uiQueued: false,

            lastUIUpdate:
                0,

            /* ----------------------------------------------------
               RESIZE
               ---------------------------------------------------- */

            resizeRAF: 0,

            resizeQueued: false,

            /* ----------------------------------------------------
               VENT ANIMATION
               ---------------------------------------------------- */

            ventTimers: new Set(),

            ventStatusTimer: null,

            /* ----------------------------------------------------
               GENERAL TIMERS
               ---------------------------------------------------- */

            timers: new Set(),

            /* ----------------------------------------------------
               PAGE VISIBILITY
               ---------------------------------------------------- */

            pageHidden:
                document.hidden,

            wasRunningBeforeHidden:
                false,

            /* ----------------------------------------------------
               DOM CACHE
               ---------------------------------------------------- */

            elements: Object.create(null),

            /* ----------------------------------------------------
               STATE FLAGS
               ---------------------------------------------------- */

            destroyed: false,

            nightEndRunning: false,

            cutsceneRunning: false,

            /* ----------------------------------------------------
               LAST VALUES
               ---------------------------------------------------- */

            lastOxygen:
                null,

            lastGameTime:
                null,

            lastVentState:
                null,

            /* ----------------------------------------------------
               RESIZE STATE
               ---------------------------------------------------- */

            viewportWidth:
                window.innerWidth,

            viewportHeight:
                window.innerHeight,

            dpr:
                Math.min(
                    window.devicePixelRatio || 1,
                    2
                )
        };

        game[PERF] = perf;

        /* ========================================================
           CACHE IMPORTANT ELEMENTS
           ======================================================== */

        perf.elements.mainMenu =
            document.getElementById(
                'main-menu'
            );

        perf.elements.gameScreen =
            document.getElementById(
                'game-screen'
            );

        perf.elements.cameraPanel =
            document.getElementById(
                'camera-panel'
            );

        perf.elements.controlPanel =
            document.getElementById(
                'control-panel'
            );

        perf.elements.tutorial =
            document.getElementById(
                'tutorial-overlay'
            );

        perf.elements.cutscene =
            document.getElementById(
                'cutscene'
            );

        perf.elements.nightIntro =
            document.getElementById(
                'night-intro'
            );

        perf.elements.gameOver =
            document.getElementById(
                'game-over'
            );

        perf.elements.menuMusic =
            document.getElementById(
                'menu-music'
            );

        perf.elements.gameOverStatic =
            document.getElementById(
                'game-over-static'
            );

        perf.elements.ventIcon =
            document.querySelector(
                '.vent-icon'
            );

        /* ========================================================
           CSS VIEWPORT VARIABLES
           ======================================================== */

        updateViewportCSS(
            game,
            true
        );

        /* ========================================================
           VISIBILITY
           ======================================================== */

        document.addEventListener(
            'visibilitychange',
            () => {

                perf.pageHidden =
                    document.hidden;

                if (
                    document.hidden
                ) {

                    /*
                     * Remember whether the actual game was running.
                     */
                    perf.wasRunningBeforeHidden =
                        !!game.state?.isGameRunning;

                    /*
                     * Pause expensive visual loops.
                     */
                    stopRotationLoop(
                        game
                    );

                    /*
                     * Don't allow background tab updates.
                     */
                    if (
                        game.state
                    ) {

                        game.state.__fnaeHidden =
                            true;
                    }

                } else {

                    if (
                        game.state
                    ) {

                        game.state.__fnaeHidden =
                            false;
                    }

                    /*
                     * Resume rotation only if the game was actually
                     * running before the tab was hidden.
                     */
                    if (
                        perf.wasRunningBeforeHidden &&
                        game.state?.isGameRunning
                    ) {

                        startRotationLoop(
                            game
                        );
                    }

                    queueUIUpdate(
                        game,
                        true
                    );
                }
            },
            {
                passive: true
            }
        );

        /* ========================================================
           RESIZE
           ======================================================== */

        window.addEventListener(
            'resize',
            () => {

                if (
                    perf.resizeQueued
                ) {

                    return;
                }

                perf.resizeQueued =
                    true;

                perf.resizeRAF =
                    requestAnimationFrame(
                        () => {

                            perf.resizeQueued =
                                false;

                            perf.resizeRAF =
                                0;

                            updateViewportCSS(
                                game,
                                false
                            );

                            /*
                             * UI gets one synchronized update after
                             * the new viewport dimensions are known.
                             */
                            queueUIUpdate(
                                game,
                                true
                            );
                        }
                    );
            },
            {
                passive: true
            }
        );

        return perf;
    }

    /* ============================================================
       VIEWPORT CSS VARIABLES
       ============================================================ */

    function updateViewportCSS(
        game,
        force
    ) {

        const perf =
            ensurePerf(game);

        const width =
            window.innerWidth;

        const height =
            window.innerHeight;

        if (
            !force &&
            width === perf.viewportWidth &&
            height === perf.viewportHeight
        ) {

            return;
        }

        perf.viewportWidth =
            width;

        perf.viewportHeight =
            height;

        perf.dpr =
            Math.min(
                window.devicePixelRatio || 1,
                2
            );

        /*
         * These variables can be used by your CSS for responsive
         * sizing without JavaScript repeatedly querying dimensions.
         */

        const root =
            document.documentElement;

        root.style.setProperty(
            '--fnae-vw',
            `${width}px`
        );

        root.style.setProperty(
            '--fnae-vh',
            `${height}px`
        );

        root.style.setProperty(
            '--fnae-dpr',
            `${perf.dpr}`
        );

        root.style.setProperty(
            '--fnae-min-dimension',
            `${Math.min(
                width,
                height
            )}px`
        );
    }

    /* ============================================================
       SAFE TIMER
       ============================================================ */

    function schedule(
        game,
        callback,
        delay
    ) {

        const perf =
            ensurePerf(game);

        if (
            perf.destroyed
        ) {
            return null;
        }

        const id =
            setTimeout(
                () => {

                    perf.timers.delete(
                        id
                    );

                    if (
                        perf.destroyed
                    ) {

                        return;
                    }

                    callback();

                },
                Math.max(
                    0,
                    delay | 0
                )
            );

        perf.timers.add(
            id
        );

        return id;
    }

    /* ============================================================
       CLEAR SAFE TIMER
       ============================================================ */

    function clearScheduled(
        game,
        id
    ) {

        if (!id) {
            return;
        }

        const perf =
            ensurePerf(game);

        clearTimeout(
            id
        );

        perf.timers.delete(
            id
        );
    }

    /* ============================================================
       UI UPDATE COALESCER
       ============================================================ */

    function queueUIUpdate(
        game,
        force = false
    ) {

        const perf =
            ensurePerf(game);

        if (
            perf.uiQueued &&
            !force
        ) {

            return;
        }

        if (
            perf.pageHidden &&
            !force
        ) {

            return;
        }

        if (
            perf.uiQueued
        ) {

            return;
        }

        perf.uiQueued =
            true;

        perf.uiRAF =
            requestAnimationFrame(
                () => {

                    perf.uiQueued =
                        false;

                    perf.uiRAF =
                        0;

                    if (
                        perf.pageHidden &&
                        !force
                    ) {

                        return;
                    }

                    if (
                        !game.ui
                    ) {

                        return;
                    }

                    perf.lastUIUpdate =
                        performance.now();

                    game.ui.update();
                }
            );
    }

    /* ============================================================
       STOP PERFORMANCE LOOPS
       ============================================================ */

    function stopPerformanceLoops(
        game
    ) {

        const perf =
            ensurePerf(game);

        /* --------------------------------------------------------
           GAME TICKER
           -------------------------------------------------------- */

        if (
            perf.gameTicker
        ) {

            clearInterval(
                perf.gameTicker
            );

            perf.gameTicker =
                null;
        }

        /* --------------------------------------------------------
           ROTATION RAF
           -------------------------------------------------------- */

        stopRotationLoop(
            game
        );

        /* --------------------------------------------------------
           UI RAF
           -------------------------------------------------------- */

        if (
            perf.uiRAF
        ) {

            cancelAnimationFrame(
                perf.uiRAF
            );

            perf.uiRAF =
                0;

            perf.uiQueued =
                false;
        }

        /* --------------------------------------------------------
           RESIZE RAF
           -------------------------------------------------------- */

        if (
            perf.resizeRAF
        ) {

            cancelAnimationFrame(
                perf.resizeRAF
            );

            perf.resizeRAF =
                0;

            perf.resizeQueued =
                false;
        }

        /* --------------------------------------------------------
           TIMER SET
           -------------------------------------------------------- */

        for (
            const id
            of perf.timers
        ) {

            clearTimeout(
                id
            );
        }

        perf.timers.clear();

        /* --------------------------------------------------------
           OLD GAME TIMERS
           -------------------------------------------------------- */

        if (
            game.timeInterval
        ) {

            clearInterval(
                game.timeInterval
            );

            game.timeInterval =
                null;
        }

        if (
            game.powerInterval
        ) {

            clearInterval(
                game.powerInterval
            );

            game.powerInterval =
                null;
        }
    }

    /* ============================================================
       ROTATION LOOP
       ============================================================ */

    function startRotationLoop(
        game
    ) {

        const perf =
            ensurePerf(game);

        if (
            perf.pageHidden ||
            !game.state?.isGameRunning
        ) {

            return;
        }

        if (
            perf.rotationRunning
        ) {

            return;
        }

        perf.rotationRunning =
            true;

        const loop =
            () => {

                if (
                    !perf.rotationRunning ||
                    perf.pageHidden ||
                    !game.state?.isGameRunning
                ) {

                    perf.rotationRunning =
                        false;

                    perf.rotationRAF =
                        0;

                    return;
                }

                /*
                 * Rotation is disabled while interfaces are open.
                 */

                if (
                    !game.state.controlPanelOpen &&
                    !game.state.cameraOpen
                {

                    let changed =
                        false;

                    if (
                        game.isRotatingLeft &&
                        game.viewPosition > 0
                    ) {

                        const next =
                            Math.max(
                                0,
                                game.viewPosition -
                                game.rotationSpeed
                            );

                        if (
                            next !==
                            game.viewPosition
                        ) {

                            game.viewPosition =
                                next;

                            changed =
                                true;
                        }
                    }

                    if (
                        game.isRotatingRight &&
                        game.viewPosition < 1
                    ) {

                        const next =
                            Math.min(
                                1,
                                game.viewPosition +
                                game.rotationSpeed
                            );

                        if (
                            next !==
                            game.viewPosition
                        ) {

                            game.viewPosition =
                                next;

                            changed =
                                true;
                        }
                    }

                    /*
                     * IMPORTANT:
                     * Only touch the image when its actual position
                     * changed.
                     */

                    if (
                        changed &&
                        perf.lastRenderedViewPosition !==
                        game.viewPosition
                    ) {

                        perf.lastRenderedViewPosition =
                            game.viewPosition;

                        if (
                            game.ui?.updateViewPosition
                        ) {

                            game.ui.updateViewPosition(
                                game.viewPosition
                            );
                        }
                    }
                }

                /*
                 * Keep the loop alive while the game is running.
                 * The body is extremely cheap when no rotation occurs.
                 */

                perf.rotationRAF =
                    requestAnimationFrame(
                        loop
                    );
            };

        perf.rotationRAF =
            requestAnimationFrame(
                loop
            );
    }

    /* ============================================================
       STOP ROTATION LOOP
       ============================================================ */

    function stopRotationLoop(
        game
    ) {

        const perf =
            ensurePerf(game);

        perf.rotationRunning =
            false;

        if (
            perf.rotationRAF
        ) {

            cancelAnimationFrame(
                perf.rotationRAF
            );

            perf.rotationRAF =
                0;
        }
    }

    /* ============================================================
       ONE SYNCHRONIZED GAME TICKER
       ============================================================ */

    function startGameTicker(
        game
    ) {

        const perf =
            ensurePerf(game);

        /*
         * Prevent duplicates.
         */

        if (
            perf.gameTicker
        ) {

            clearInterval(
                perf.gameTicker
            );

            perf.gameTicker =
                null;
        }

        perf.gameAccumulator =
            0;

        perf.lastGameTick =
            performance.now();

        perf.gameRunning =
            true;

        /*
         * ONE interval replaces two independent timers.

         * Every second:
         * 1. Oxygen/power logic runs.
         * 2. Every 60 seconds game time advances.

         * This reduces timer overhead and keeps both systems
         * synchronized.
         */

        perf.gameTicker =
            setInterval(
                () => {

                    if (
                        perf.destroyed ||
                        perf.pageHidden ||
                        !game.state?.isGameRunning
                    ) {

                        return;
                    }

                    const now =
                        performance.now();

                    const elapsed =
                        now -
                        perf.lastGameTick;

                    perf.lastGameTick =
                        now;

                    /*
                     * Clamp massive timing jumps. This prevents a
                     * browser hiccup from instantly skipping several
                     * in-game hours.
                     */

                    const delta =
                        Math.min(
                            elapsed,
                            2000
                        );

                    perf.gameAccumulator +=
                        delta;

                    /* ------------------------------------------------
                       POWER / OXYGEN
                       ------------------------------------------------ */

                    game.updatePower();

                    /* ------------------------------------------------
                       GAME TIME
                       ------------------------------------------------ */

                    while (
                        perf.gameAccumulator >=
                        60000
                    ) {

                        perf.gameAccumulator -=
                            60000;

                        if (
                            !game.state.isGameRunning
                        ) {

                            break;
                        }

                        game.state.currentTime +=
                            1;

                        /*
                         * We don't update the entire UI twice if
                         * updatePower() already queued it.
                         */

                        queueUIUpdate(
                            game
                        );

                        if (
                            game.state.currentTime >=
                            6
                        ) {

                            game.winNight();

                            break;
                        }
                    }

                },
                1000
            );
    }

    /* ============================================================
       PATCH startGameLoop
       ============================================================ */

    const NativeStartGameLoop =
        Game.prototype.startGameLoop;

    Game.prototype.startGameLoop =
        function optimizedStartGameLoop() {

            ensurePerf(
                this
            );

            /*
             * Start our synchronized ticker.
             */

            startGameTicker(
                this
            );

            /*
             * Start the lightweight rotation system.
             */

            startRotationLoop(
                this
            );
        };

    /* ============================================================
       PATCH stopGame
       ============================================================ */

    const NativeStopGame =
        Game.prototype.stopGame;

    Game.prototype.stopGame =
        function optimizedStopGame() {

            const perf =
                ensurePerf(
                    this
                );

            perf.gameRunning =
                false;

            stopPerformanceLoops(
                this
            );

            /*
             * Keep original game cleanup.
             */

            NativeStopGame.call(
                this
            );

            /*
             * Ensure our loops remain stopped even if the
             * original method modifies game state.
             */

            perf.gameRunning =
                false;
        };

    /* ============================================================
       PATCH startViewRotation
       ============================================================ */

    const NativeStartViewRotation =
        Game.prototype.startViewRotation;

    Game.prototype.startViewRotation =
        function optimizedStartViewRotation() {

            ensurePerf(
                this
            );

            /*
             * Use our optimized RAF.
             */

            startRotationLoop(
                this
            );
        };

    /* ============================================================
       PATCH updatePower
       ============================================================ */

    const NativeUpdatePower =
        Game.prototype.updatePower;

    Game.prototype.updatePower =
        function optimizedUpdatePower() {

            const perf =
                ensurePerf(
                    this
                );

            if (
                perf.pageHidden
            ) {

                return;
            }

            /*
             * Run original oxygen logic.
             */

            NativeUpdatePower.call(
                this
            );

            /*
             * Avoid repeatedly forcing full UI refreshes when
             * oxygen hasn't visibly changed.
             */

            const oxygen =
                this.state.oxygen;

            if (
                perf.lastOxygen !==
                oxygen
            ) {

                perf.lastOxygen =
                    oxygen;

                queueUIUpdate(
                    this
                );
            }
        };

    /* ============================================================
       PATCH toggleCamera
       ============================================================ */

    const NativeToggleCamera =
        Game.prototype.toggleCamera;

    Game.prototype.toggleCamera =
        function optimizedToggleCamera() {

            /*
             * CameraSystem is already optimized separately.
             */

            NativeToggleCamera.call(
                this
            );

            /*
             * Stop rotation immediately when camera opens.
             */

            if (
                this.state.cameraOpen
            ) {

                stopRotationLoop(
                    this
                );

            } else if (
                this.state.isGameRunning
            ) {

                startRotationLoop(
                    this
                );
            }
        };

    /* ============================================================
       PATCH toggleVents
       ============================================================ */

    const NativeToggleVents =
        Game.prototype.toggleVents;

    Game.prototype.toggleVents =
        function optimizedToggleVents() {

            const perf =
                ensurePerf(
                    this
                );

            /*
             * Existing method already contains all gameplay logic,
             * sound, timing, and EnemyAI interaction.
             *
             * We let it run unchanged.
             */

            NativeToggleVents.call(
                this
            );

            /*
             * Replace the old 100ms polling interval with a much
             * cheaper short-lived UI synchronizer.
             */

            if (
                perf.ventStatusTimer
            ) {

                clearInterval(
                    perf.ventStatusTimer
                );

                perf.ventStatusTimer =
                    null;
            }

            if (
                this.state.ventsToggling
            ) {

                let lastRefresh =
                    0;

                perf.ventStatusTimer =
                    setInterval(
                        () => {

                            if (
                                !this.state
                                    .ventsToggling
                            ) {

                                clearInterval(
                                    perf.ventStatusTimer
                                );

                                perf.ventStatusTimer =
                                    null;

                                return;
                            }

                            const now =
                                performance.now();

                            /*
                             * Hard cap UI refresh frequency to
                             * ~5 FPS during the vent transition.
                             *
                             * The animation itself remains CSS-driven.
                             */

                            if (
                                now -
                                lastRefresh <
                                200
                            ) {

                                return;
                            }

                            lastRefresh =
                                now;

                            if (
                                this.ui
                                    .updateVentsStatus
                            ) {

                                this.ui
                                    .updateVentsStatus();
                            }

                        },
                        200
                    );
            }
        };

    /* ============================================================
       PATCH showGoldenStephen
       ============================================================ */

    const NativeGoldenStephen =
        Game.prototype.showGoldenStephen;

    Game.prototype.showGoldenStephen =
        function optimizedGoldenStephen() {

            /*
             * Prevent duplicate golden overlays from stacking
             * if multiple game events trigger the easter egg.
             */

            const existing =
                document.getElementById(
                    'golden-stephen-overlay'
                );

            if (
                existing
            ) {

                return;
            }

            NativeGoldenStephen.call(
                this
            );
        };

    /* ============================================================
       PATCH gameOver
       ============================================================ */

    const NativeGameOver =
        Game.prototype.gameOver;

    Game.prototype.gameOver =
        function optimizedGameOver(
            message
        ) {

            /*
             * Stop performance loops BEFORE creating the
             * fullscreen game-over effects.
             *
             * This prevents the hidden game from continuing
             * to consume CPU underneath the static.
             */

            stopPerformanceLoops(
                this
            );

            const perf =
                ensurePerf(
                    this
                );

            perf.gameRunning =
                false;

            NativeGameOver.call(
                this,
                message
            );
        };

    /* ============================================================
       PATCH winNight
       ============================================================ */

    const NativeWinNight =
        Game.prototype.winNight;

    Game.prototype.winNight =
        function optimizedWinNight() {

            stopPerformanceLoops(
                this
            );

            const perf =
                ensurePerf(
                    this
                );

            perf.gameRunning =
                false;

            NativeWinNight.call(
                this
            );
        };

    /* ============================================================
       PATCH continueToNextNight
       ============================================================ */

    const NativeContinueNext =
        Game.prototype.continueToNextNight;

    Game.prototype.continueToNextNight =
        async function optimizedContinueNextNight() {

            /*
             * Kill anything left from the previous night before
             * initializing the next one.
             */

            stopPerformanceLoops(
                this
            );

            const perf =
                ensurePerf(
                    this
                );

            perf.lastOxygen =
                null;

            perf.lastGameTime =
                null;

            perf.lastRenderedViewPosition =
                null;

            perf.gameAccumulator =
                0;

            await NativeContinueNext.call(
                this
            );
        };

    /* ============================================================
       PATCH initGame
       ============================================================ */

    const NativeInitGame =
        Game.prototype.initGame;

    Game.prototype.initGame =
        async function optimizedInitGame() {

            const perf =
                ensurePerf(
                    this
                );

            /*
             * Make absolutely sure no previous game's loops
             * survived a restart.
             */

            stopPerformanceLoops(
                this
            );

            perf.gameAccumulator =
                0;

            perf.lastGameTick =
                performance.now();

            perf.lastOxygen =
                null;

            perf.lastGameTime =
                null;

            perf.lastRenderedViewPosition =
                null;

            await NativeInitGame.call(
                this
            );

            /*
             * Native initGame() starts the game loop itself.
             * The overridden startGameLoop() therefore installs
             * our optimized ticker.
             */

            queueUIUpdate(
                this,
                true
            );
        };

    /* ============================================================
       PATCH restartGame
       ============================================================ */

    const NativeRestartGame =
        Game.prototype.restartGame;

    Game.prototype.restartGame =
        function optimizedRestartGame() {

            stopPerformanceLoops(
                this
            );

            NativeRestartGame.call(
                this
            );
        };

    /* ============================================================
       PATCH showMainMenu
       ============================================================ */

    const NativeShowMainMenu =
        Game.prototype.showMainMenu;

    Game.prototype.showMainMenu =
        function optimizedShowMainMenu() {

            stopPerformanceLoops(
                this
            );

            NativeShowMainMenu.call(
                this
            );
        };

    /* ============================================================
       PATCH gameOverScreen
       ============================================================ */

    const NativeGameOverScreen =
        Game.prototype.gameOverScreen;

    Game.prototype.gameOverScreen =
        function optimizedGameOverScreen(
            message,
            win = false
        ) {

            stopRotationLoop(
                this
            );

            /*
             * Avoid duplicate game-over static playback.
             */

            const perf =
                ensurePerf(
                    this
                );

            perf.gameRunning =
                false;

            NativeGameOverScreen.call(
                this,
                message,
                win
            );
        };

    /* ============================================================
       PATCH showNightIntro
       ============================================================ */

    const NativeShowNightIntro =
        Game.prototype.showNightIntro;

    Game.prototype.showNightIntro =
        function optimizedShowNightIntro() {

            const perf =
                ensurePerf(
                    this
                );

            /*
             * Don't allow multiple intro promises to run
             * simultaneously.
             */

            if (
                perf.nightEndRunning
            ) {

                return Promise.resolve();
            }

            perf.nightEndRunning =
                true;

            return NativeShowNightIntro
                .call(
                    this
                )
                .finally(
                    () => {

                        perf.nightEndRunning =
                            false;
                    }
                );
        };

    /* ============================================================
       PATCH CONTINUE BUTTON PROGRESS
       ============================================================ */

    const NativeUpdateContinue =
        Game.prototype.updateContinueButton;

    Game.prototype.updateContinueButton =
        function optimizedUpdateContinueButton() {

            /*
             * LocalStorage is tiny, but there is no reason to call
             * the original function repeatedly within one frame.
             */

            const perf =
                ensurePerf(
                    this
                );

            const now =
                performance.now();

            if (
                perf.lastContinueUpdate &&
                now -
                perf.lastContinueUpdate <
                100
            ) {

                return;
            }

            perf.lastContinueUpdate =
                now;

            NativeUpdateContinue.call(
                this
            );
        };

    /* ============================================================
       EXTRA CLEANUP API
       ============================================================ */

    Game.prototype.destroyPerformanceLayer =
        function destroyPerformanceLayer() {

            const perf =
                ensurePerf(
                    this
                );

            perf.destroyed =
                true;

            stopPerformanceLoops(
                this
            );

            if (
                perf.resizeRAF
            ) {

                cancelAnimationFrame(
                    perf.resizeRAF
                );

                perf.resizeRAF =
                    0;
            }

            if (
                perf.uiRAF
            ) {

                cancelAnimationFrame(
                    perf.uiRAF
                );

                perf.uiRAF =
                    0;
            }

            if (
                this.assets
            ) {

                this.assets.stopSound(
                    'vents'
                );

                this.assets.stopSound(
                    'static'
                );

                this.assets.stopSound(
                    'staticLoop'
                );

                this.assets.stopSound(
                    'ventCrawling'
                );
            }
        };

})();
