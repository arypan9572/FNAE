/* ============================================================
   EFRAIN'S HOUSE — ENEMY AI PERFORMANCE OVERDRIVE
   ============================================================

   DROP-IN PERFORMANCE LAYER

   Paste this AFTER your existing EnemyAI class.

   It preserves:
   • Existing AI configuration
   • Existing movement probabilities
   • Existing camera graph
   • Existing sound-lure mechanics
   • Existing Trump vent mechanics
   • Existing Hawking mechanics
   • Existing jumpscares
   • Existing character assets
   • Existing EnemyAI public API

   It optimizes:
   • AI timers
   • Movement path calculations
   • Sound attraction
   • Camera updates
   • Trump crawling
   • Night 4 / Night 5 aggressive mode
   • Repeated array allocation
   • Duplicate movement loops
   • Timer cleanup
   • Camera refresh spam
   • Hidden/stale AI callbacks
   ============================================================ */

(() => {

    /* ------------------------------------------------------------
       SAFETY
       ------------------------------------------------------------ */

    if (typeof EnemyAI !== 'function') {
        return;
    }

    /* ------------------------------------------------------------
       PRIVATE PERFORMANCE STATE

       Symbol prevents collisions with your existing variables.
       ------------------------------------------------------------ */

    const PERF = Symbol('efrainsEnemyAIPerformance');

    /* ------------------------------------------------------------
       CREATE PERFORMANCE STATE
       ------------------------------------------------------------ */

    function ensurePerf(ai) {

        if (ai[PERF]) {
            return ai[PERF];
        }

        const perf = {

            /*
             * All timers created by the optimized system.
             */
            timers: new Set(),

            /*
             * requestAnimationFrame handle.
             */
            raf: 0,

            /*
             * Prevents multiple camera refreshes from being
             * queued during a single browser frame.
             */
            cameraQueued: false,

            /*
             * Used to invalidate old asynchronous callbacks.
             */
            token: 0,

            /*
             * Allows destroy() to stop everything permanently.
             */
            destroyed: false,

            /*
             * Cached camera refresh timestamp.
             */
            lastCameraUpdate: 0,

            /*
             * Cached graph information.
             */
            locationKeys: [],

            depthBuckets: Object.create(null),

            trumpDepthBuckets: Object.create(null),

            adjacencySets: Object.create(null),

            /*
             * Reused empty structures.
             *
             * This avoids constantly allocating [] and Set()
             * objects inside AI calculations.
             */
            emptyArray: Object.freeze([]),

            emptySet: new Set(),

            /*
             * Aggressive-mode cache.
             */
            night4Aggressive: false,

            night5Aggressive: false,

            epsteinAggressiveConfig: null,

            trumpAggressiveConfig: null
        };

        ai[PERF] = perf;

        /* --------------------------------------------------------
           CACHE LOCATION GRAPH
           -------------------------------------------------------- */

        if (ai.locationDepth) {

            for (
                const loc
                of Object.keys(ai.locationDepth)
            ) {

                if (loc === 'office') {
                    continue;
                }

                perf.locationKeys.push(loc);

                const depth =
                    ai.locationDepth[loc];

                if (!perf.depthBuckets[depth]) {
                    perf.depthBuckets[depth] = [];
                }

                perf.depthBuckets[depth].push(
                    loc
                );

                /*
                 * Trump uses the same physical graph but has its
                 * own depth table.
                 */

                const trumpDepth =
                    ai.trumpLocationDepth[loc];

                if (
                    !perf.trumpDepthBuckets[
                        trumpDepth
                    ]
                ) {

                    perf.trumpDepthBuckets[
                        trumpDepth
                    ] = [];
                }

                perf.trumpDepthBuckets[
                    trumpDepth
                ].push(
                    loc
                );
            }
        }

        /* --------------------------------------------------------
           CACHE ADJACENCY SETS

           Original code frequently did:

           adjacentRooms[x].includes(y)

           Set.has() is much cheaper for repeated membership tests.
           -------------------------------------------------------- */

        if (ai.adjacentRooms) {

            for (
                const [loc, rooms]
                of Object.entries(
                    ai.adjacentRooms
                )
            ) {

                perf.adjacencySets[loc] =
                    new Set(rooms);
            }
        }

        /*
         * Freeze cached arrays.
         *
         * AI shouldn't mutate these.
         */

        for (
            const key
            of Object.keys(
                perf.depthBuckets
            )
        ) {

            perf.depthBuckets[key] =
                Object.freeze(
                    perf.depthBuckets[key].slice()
                );
        }

        for (
            const key
            of Object.keys(
                perf.trumpDepthBuckets
            )
        ) {

            perf.trumpDepthBuckets[key] =
                Object.freeze(
                    perf.trumpDepthBuckets[key].slice()
                );
        }

        return perf;
    }

    /* ============================================================
       TIMER SYSTEM
       ============================================================ */

    function schedule(
        ai,
        callback,
        delay
    ) {

        const perf =
            ensurePerf(ai);

        const token =
            perf.token;

        const id =
            setTimeout(
                () => {

                    perf.timers.delete(id);

                    /*
                     * If this timer belongs to an old AI state,
                     * silently kill it.
                     */

                    if (
                        perf.destroyed ||
                        token !== perf.token
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

        perf.timers.add(id);

        return id;
    }

    /* ============================================================
       CLEAR ONE TRACKED TIMER
       ============================================================ */

    function clearTracked(
        ai,
        id
    ) {

        if (!id) {
            return;
        }

        const perf =
            ensurePerf(ai);

        clearTimeout(id);

        perf.timers.delete(id);
    }

    /* ============================================================
       CLEAR EVERYTHING
       ============================================================ */

    function clearAllTracked(ai) {

        const perf =
            ensurePerf(ai);

        for (
            const id
            of perf.timers
        ) {

            clearTimeout(id);
        }

        perf.timers.clear();

        if (perf.raf) {

            cancelAnimationFrame(
                perf.raf
            );

            perf.raf = 0;
        }

        perf.cameraQueued =
            false;
    }

    /* ============================================================
       CAMERA UPDATE COALESCER
       ============================================================ */

    function queueCamera(
        ai,
        force = false
    ) {

        if (!ai.game?.camera) {
            return;
        }

        /*
         * Nothing visual needs refreshing if the camera panel
         * isn't currently open.
         */

        if (
            !ai.game.state?.cameraOpen ||
            ai.game.state?.cameraFailed
        ) {

            return;
        }

        const perf =
            ensurePerf(ai);

        /*
         * Don't schedule 10 refreshes in the same frame.
         */

        if (
            perf.cameraQueued
        ) {

            return;
        }

        perf.cameraQueued =
            true;

        perf.raf =
            requestAnimationFrame(
                () => {

                    perf.cameraQueued =
                        false;

                    perf.raf =
                        0;

                    if (
                        !ai.game.state.cameraOpen ||
                        ai.game.state.cameraFailed
                    ) {

                        return;
                    }

                    const now =
                        performance.now();

                    /*
                     * Normal updates are capped around the
                     * browser's frame cadence.
                     */

                    if (
                        !force &&
                        now -
                        perf.lastCameraUpdate <
                        16
                    ) {

                        return;
                    }

                    perf.lastCameraUpdate =
                        now;

                    /*
                     * Call the ORIGINAL camera-display method.
                     * This preserves your game's existing camera UI.
                     */

                    NativeUpdateDisplay.call(
                        ai
                    );
                }
            );
    }

    /* ============================================================
       NIGHT 4 AGGRESSIVE CONFIGURATION CACHE
       ============================================================ */

    function getEpConfig(ai) {

        const perf =
            ensurePerf(ai);

        const aggressive =
            ai.game.state.currentNight === 4 &&
            ai.game.state.currentTime >= 4;

        /*
         * Return original config when aggressive mode isn't active.
         */

        if (!aggressive) {

            perf.night4Aggressive =
                false;

            return ai.currentEpsteinConfig;
        }

        /*
         * Don't recreate the object every movement tick.
         */

        if (
            !perf.night4Aggressive
        ) {

            perf.night4Aggressive =
                true;

            perf.epsteinAggressiveConfig = {

                ...ai.currentEpsteinConfig,

                movementInterval:
                    [8000, 10000],

                movementProbability: {

                    forward: 1,

                    lateral: 0,

                    backward: 0
                }
            };
        }

        return perf.epsteinAggressiveConfig;
    }

    /* ============================================================
       NIGHT 5 AGGRESSIVE CONFIGURATION CACHE
       ============================================================ */

    function getTrumpConfig(ai) {

        const perf =
            ensurePerf(ai);

        const aggressive =
            ai.game.state.currentNight === 5 &&
            ai.game.state.currentTime >= 4;

        if (!aggressive) {

            perf.night5Aggressive =
                false;

            return ai.currentTrumpConfig;
        }

        /*
         * Cache the aggressive config instead of creating a
         * fresh object during every movement calculation.
         */

        if (
            !perf.night5Aggressive
        ) {

            perf.night5Aggressive =
                true;

            perf.trumpAggressiveConfig = {

                ...ai.currentTrumpConfig,

                movementInterval:
                    [6000, 7000],

                movementProbability: {

                    forward: 1,

                    lateral: 0,

                    backward: 0
                },

                ventCrawling: {

                    ...ai.currentTrumpConfig
                        .ventCrawling,

                    cam1Probability:
                        1,

                    cam2Probability:
                        0.8
                }
            };
        }

        return perf.trumpAggressiveConfig;
    }

    /* ============================================================
       OPTIMIZED START
       ============================================================ */

    EnemyAI.prototype.start =
        function optimizedEnemyStart() {

            const perf =
                ensurePerf(this);

            /*
             * Re-enable AI after reset/destroy.
             */

            perf.destroyed =
                false;

            /*
             * Kill stale timers before starting a new game.
             */

            clearAllTracked(
                this
            );

            /*
             * Invalidate callbacks from previous nights.
             */

            perf.token++;

            /*
             * Load the existing AI configuration.
             */

            this.loadAIConfig();

            /* ----------------------------------------------------
               EPSTEIN SPAWN
               ---------------------------------------------------- */

            schedule(
                this,

                () => {
                    this.spawnEpstein();
                },

                this.currentEpsteinConfig?.spawnDelay ||
                0
            );

            /* ----------------------------------------------------
               TRUMP SPAWN
               ---------------------------------------------------- */

            if (
                this.game.state.currentNight >= 2 &&
                this.game.state.currentNight <= 5 &&
                this.currentTrumpConfig
            ) {

                schedule(
                    this,

                    () => {
                        this.spawnTrump();
                    },

                    this.currentTrumpConfig
                        .spawnDelay ||
                    0
                );
            }

            /* ----------------------------------------------------
               HAWKING
               ---------------------------------------------------- */

            if (
                this.game.state.currentNight >= 3 &&
                this.game.state.currentNight <= 5
            ) {

                this.startHawking();
            }
        };

    /* ============================================================
       OPTIMIZED STOP
       ============================================================ */

    EnemyAI.prototype.stop =
        function optimizedEnemyStop() {

            const perf =
                ensurePerf(this);

            /*
             * Invalidate all callbacks.
             */

            perf.token++;

            clearAllTracked(
                this
            );

            /* ----------------------------------------------------
               Explicit AI timers
               ---------------------------------------------------- */

            if (
                this.epstein.movementTimer
            ) {

                clearTracked(
                    this,
                    this.epstein
                        .movementTimer
                );

                this.epstein
                    .movementTimer =
                    null;
            }

            if (
                this.trump.movementTimer
            ) {

                clearTracked(
                    this,
                    this.trump
                        .movementTimer
                );

                this.trump
                    .movementTimer =
                    null;
            }

            if (
                this.trump.crawlingTimer
            ) {

                clearTracked(
                    this,
                    this.trump
                        .crawlingTimer
                );

                this.trump
                    .crawlingTimer =
                    null;
            }

            if (
                this.trump.retreatTimer
            ) {

                clearTracked(
                    this,
                    this.trump
                        .retreatTimer
                );

                this.trump
                    .retreatTimer =
                    null;
            }

            if (
                this.hawking.timer
            ) {

                clearTracked(
                    this,
                    this.hawking
                        .timer
                );

                this.hawking.timer =
                    null;
            }

            if (
                this.hawking.warningTimer
            ) {

                clearTracked(
                    this,
                    this.hawking
                        .warningTimer
                );

                this.hawking
                    .warningTimer =
                    null;
            }

            if (
                this.hawking.attackTimer
            ) {

                clearTracked(
                    this,
                    this.hawking
                        .attackTimer
                );

                this.hawking
                    .attackTimer =
                    null;
            }

            /*
             * Stop looping vent audio.
             */

            this.game.assets?.stopSound(
                'ventCrawling'
            );

            /*
             * Hide Hawking warning.
             */

            this.hideHawkingWarning();
        };

    /* ============================================================
       OPTIMIZED EPSTEIN MOVEMENT LOOP
       ============================================================ */

    EnemyAI.prototype.startMovementLoop =
        function optimizedEpsteinMovementLoop() {

            const perf =
                ensurePerf(this);

            /*
             * Don't start duplicate loops.
             */

            if (
                !this.epstein.hasSpawned ||
                this.epstein.currentLocation ===
                'office'
            ) {

                return;
            }

            if (
                this.epstein
                    .movementTimer
            ) {

                return;
            }

            const tick =
                () => {

                    if (
                        perf.destroyed ||
                        !this.epstein
                            .hasSpawned ||
                        this.epstein
                            .currentLocation ===
                        'office'
                    ) {

                        this.epstein
                            .movementTimer =
                            null;

                        return;
                    }

                    const config =
                        getEpConfig(
                            this
                        );

                    const delay =
                        this.getRandomInterval(
                            config.movementInterval
                        );

                    this.epstein
                        .movementTimer =

                        schedule(
                            this,

                            () => {

                                this.epstein
                                    .movementTimer =
                                    null;

                                this.checkMovement();

                                tick();
                            },

                            delay
                        );
                };

            tick();
        };

    /* ============================================================
       OPTIMIZED TRUMP MOVEMENT LOOP
       ============================================================ */

    EnemyAI.prototype.startTrumpMovementLoop =
        function optimizedTrumpMovementLoop() {

            const perf =
                ensurePerf(this);

            if (
                !this.trump.hasSpawned ||
                this.trump.currentLocation ===
                'office' ||
                this.trump.isCrawling
            ) {

                return;
            }

            if (
                this.trump.movementTimer
            ) {

                return;
            }

            const tick =
                () => {

                    if (
                        perf.destroyed ||
                        !this.trump.hasSpawned ||
                        this.trump.currentLocation ===
                        'office'
                    ) {

                        this.trump
                            .movementTimer =
                            null;

                        return;
                    }

                    const config =
                        getTrumpConfig(
                            this
                        );

                    const delay =
                        this.getRandomInterval(
                            config.movementInterval
                        );

                    this.trump
                        .movementTimer =

                        schedule(
                            this,

                            () => {

                                this.trump
                                    .movementTimer =
                                    null;

                                this.checkTrumpMovement();

                                tick();
                            },

                            delay
                        );
                };

            tick();
        };

    /* ============================================================
       OPTIMIZED EPSTEIN MOVEMENT
       ============================================================ */

    EnemyAI.prototype.moveToNextLocation =
        function optimizedEpsteinMove() {

            const perf =
                ensurePerf(this);

            const current =
                this.epstein
                    .currentLocation;

            const depth =
                this.locationDepth[
                    current
                ];

            if (
                current === 'office' ||
                depth == null
            ) {

                return;
            }

            const config =
                getEpConfig(
                    this
                );

            /*
             * Forward positions are already cached by depth.
             */

            const forward =
                perf.depthBuckets[
                    depth - 1
                ] ||
                perf.emptyArray;

            const adjacent =
                this.adjacentRooms[
                    current
                ] ||
                perf.emptyArray;

            /*
             * These arrays are temporary but extremely tiny:
             * camera nodes only have a handful of neighbours.
             */

            const lateral =
                [];

            const backward =
                [];

            for (
                let i = 0;
                i < adjacent.length;
                i++
            ) {

                const loc =
                    adjacent[i];

                const nextDepth =
                    this.locationDepth[
                        loc
                    ];

                if (
                    nextDepth ===
                    depth
                ) {

                    lateral.push(
                        loc
                    );

                } else if (
                    nextDepth ===
                    depth + 1
                ) {

                    backward.push(
                        loc
                    );
                }
            }

            /*
             * Cam1 -> Office
             */

            if (
                depth === 1 &&
                forward.length === 0
            ) {

                this.epstein
                    .currentLocation =
                    'office';

                this.triggerJumpscare(
                    'epstein'
                );

                return;
            }

            const probability =
                config
                    .movementProbability;

            const total =
                probability.forward +
                probability.lateral +
                probability.backward;

            if (
                total <= 0
            ) {

                return;
            }

            const forwardChance =
                probability.forward /
                total;

            const lateralChance =
                forwardChance +
                probability.lateral /
                total;

            const random =
                Math.random();

            let choices =
                null;

            /*
             * Forward
             */

            if (
                random <
                forwardChance &&
                forward.length
            ) {

                choices =
                    forward;

            /*
             * Lateral
             */

            } else if (
                random <
                lateralChance &&
                lateral.length
            ) {

                choices =
                    lateral;

            /*
             * Backward
             */

            } else if (
                backward.length
            ) {

                choices =
                    backward;

            /*
             * Fallback
             */

            } else if (
                forward.length
            ) {

                choices =
                    forward;

            } else if (
                lateral.length
            ) {

                choices =
                    lateral;
            }

            if (
                !choices ||
                !choices.length
            ) {

                return;
            }

            const next =
                choices[
                    (
                        Math.random() *
                        choices.length
                    ) | 0
                ];

            this.epstein
                .currentLocation =
                next;

            this.game.assets?.playSound(
                'blip',
                false,
                0.5
            );

            if (
                next === 'office'
            ) {

                this.triggerJumpscare(
                    'epstein'
                );

                return;
            }

            /*
             * Only refresh the visual system once for this AI event.
             */

            queueCamera(
                this,
                true
            );
        };

    /* ============================================================
       OPTIMIZED TRUMP MOVEMENT
       ============================================================ */

    EnemyAI.prototype.moveTrumpToNextLocation =
        function optimizedTrumpMove() {

            const perf =
                ensurePerf(this);

            if (
                this.trump.isCrawling
            ) {

                return;
            }

            const current =
                this.trump.currentLocation;

            const depth =
                this.trumpLocationDepth[
                    current
                ];

            if (
                current === 'office' ||
                depth == null
            ) {

                return;
            }

            const config =
                getTrumpConfig(
                    this
                );

            /* ----------------------------------------------------
               VENT CRAWLING
               ---------------------------------------------------- */

            if (
                current === 'cam1' &&
                Math.random() <
                config.ventCrawling
                    .cam1Probability
            ) {

                this.startTrumpCrawling(
                    current
                );

                return;
            }

            if (
                current === 'cam2' &&
                Math.random() <
                config.ventCrawling
                    .cam2Probability
            ) {

                this.startTrumpCrawling(
                    current
                );

                return;
            }

            /*
             * Cached forward rooms.
             */

            const forward =
                perf.trumpDepthBuckets[
                    depth - 1
                ] ||
                perf.emptyArray;

            const adjacent =
                this.adjacentRooms[
                    current
                ] ||
                perf.emptyArray;

            const lateral =
                [];

            const backward =
                [];

            for (
                let i = 0;
                i < adjacent.length;
                i++
            ) {

                const loc =
                    adjacent[i];

                const nextDepth =
                    this.trumpLocationDepth[
                        loc
                    ];

                if (
                    nextDepth ===
                    depth
                ) {

                    lateral.push(
                        loc
                    );

                } else if (
                    nextDepth ===
                    depth + 1
                ) {

                    backward.push(
                        loc
                    );
                }
            }

            const probability =
                config
                    .movementProbability;

            const total =
                probability.forward +
                probability.lateral +
                probability.backward;

            if (
                total <= 0
            ) {

                return;
            }

            const forwardChance =
                probability.forward /
                total;

            const lateralChance =
                forwardChance +
                probability.lateral /
                total;

            const random =
                Math.random();

            let choices =
                null;

            if (
                random <
                forwardChance &&
                forward.length
            ) {

                choices =
                    forward;

            } else if (
                random <
                lateralChance &&
                lateral.length
            ) {

                choices =
                    lateral;

            } else if (
                backward.length
            ) {

                choices =
                    backward;

            } else if (
                forward.length
            ) {

                choices =
                    forward;

            } else if (
                lateral.length
            ) {

                choices =
                    lateral;
            }

            if (
                !choices ||
                !choices.length
            ) {

                return;
            }

            const next =
                choices[
                    (
                        Math.random() *
                        choices.length
                    ) | 0
                ];

            this.trump
                .currentLocation =
                next;

            this.game.assets?.playSound(
                'blip',
                false,
                0.5
            );

            if (
                next === 'office'
            ) {

                this.triggerJumpscare(
                    'trump'
                );

                return;
            }

            queueCamera(
                this,
                true
            );
        };

    /* ============================================================
       OPTIMIZED SOUND ATTRACTION
       ============================================================ */

    EnemyAI.prototype.attractToSound =
        function optimizedSoundAttraction(
            soundLocation
        ) {

            if (
                !soundLocation
            ) {

                return false;
            }

            const perf =
                ensurePerf(this);

            let attracted =
                false;

            /*
             * ----------------------------------------------------
               EPSTEIN
             * ----------------------------------------------------
             */

            const epSet =
                perf.adjacencySets[
                    this.epstein
                        .currentLocation
                ];

            if (
                this.epstein.hasSpawned &&
                epSet?.has(
                    soundLocation
                )
            ) {

                const resistance =
                    this.currentEpsteinConfig
                        ?.soundLureResistance ||
                    0;

                /*
                 * Sound resistance.
                 */

                if (
                    resistance <= 0 ||
                    Math.random() >= resistance
                ) {

                    this.epstein
                        .currentLocation =
                        soundLocation;

                    attracted =
                        true;

                    this.game.assets?.playSound(
                        'blip',
                        false,
                        0.5
                    );

                    if (
                        soundLocation ===
                        'office'
                    ) {

                        this.triggerJumpscare(
                            'epstein'
                        );

                        return true;
                    }

                } else {

                    /*
                     * The lure still makes a sound even when
                     * Epstein resists it.
                     */

                    this.game.assets?.playSound(
                        'blip',
                        false,
                        0.5
                    );
                }
            }

            /*
             * ----------------------------------------------------
               TRUMP
             * ----------------------------------------------------
             */

            const trumpSet =
                perf.adjacencySets[
                    this.trump
                        .currentLocation
                ];

            if (
                this.trump.hasSpawned &&
                !this.trump.isCrawling &&
                trumpSet?.has(
                    soundLocation
                )
            ) {

                this.trump
                    .currentLocation =
                    soundLocation;

                if (
                    !attracted
                ) {

                    this.game.assets?.playSound(
                        'blip',
                        false,
                        0.5
                    );
                }

                attracted =
                    true;

                if (
                    soundLocation ===
                    'office'
                ) {

                    this.triggerJumpscare(
                        'trump'
                    );

                    return true;
                }
            }

            /*
             * Camera only needs one visual refresh even if both
             * enemies react to the same lure.
             */

            if (
                attracted
            ) {

                queueCamera(
                    this,
                    true
                );
            }

            return attracted;
        };

    /* ============================================================
       OPTIMIZED TRUMP CRAWLING
       ============================================================ */

    EnemyAI.prototype.startTrumpCrawling =
        function optimizedTrumpCrawlStart(
            fromLocation
        ) {

            const perf =
                ensurePerf(this);

            if (
                this.trump.isCrawling
            ) {

                return;
            }

            const config =
                getTrumpConfig(
                    this
                ).ventCrawling;

            /*
             * Invalidate previous crawl callbacks.
             */

            perf.token++;

            const token =
                perf.token;

            /*
             * Clear old crawl timers.
             */

            if (
                this.trump.crawlingTimer
            ) {

                clearTracked(
                    this,
                    this.trump
                        .crawlingTimer
                );
            }

            if (
                this.trump.crawlSoundTimer
            ) {

                clearTracked(
                    this,
                    this.trump
                        .crawlSoundTimer
                );
            }

            if (
                this.trump
                    .crawlSoundStopTimer
            ) {

                clearTracked(
                    this,
                    this.trump
                        .crawlSoundStopTimer
                );
            }

            /*
             * Enter crawling state.
             */

            this.trump.isCrawling =
                true;

            this.trump.crawlingFrom =
                fromLocation;

            this.trump.currentLocation =
                'crawling';

            queueCamera(
                this
            );

            /*
             * Delayed vent audio.
             */

            this.trump
                .crawlSoundTimer =

                schedule(
                    this,

                    () => {

                        if (
                            token !==
                            perf.token ||
                            !this.trump
                                .isCrawling
                        ) {

                            return;
                        }

                        this.game.assets?.playSound(
                            'ventCrawling',
                            true,
                            0.8
                        );

                        /*
                         * Automatically stop looping
                         * vent sound after its configured duration.
                         */

                        this.trump
                            .crawlSoundStopTimer =

                            schedule(
                                this,

                                () => {

                                    if (
                                        token ===
                                        perf.token
                                    ) {

                                        this.game.assets?.stopSound(
                                            'ventCrawling'
                                        );
                                    }

                                },

                                config.soundDuration
                            );

                    },

                    config.soundDelay
                );

            /*
             * Total crawling timer.
             */

            this.trump
                .crawlingTimer =

                schedule(
                    this,

                    () => {

                        if (
                            token !==
                            perf.token ||
                            !this.trump
                                .isCrawling
                        ) {

                            return;
                        }

                        this.trump
                            .currentLocation =
                            'office';

                        this.trump
                            .isCrawling =
                            false;

                        this.trump
                            .crawlingFrom =
                            null;

                        this.game.assets?.stopSound(
                            'ventCrawling'
                        );

                        this.triggerJumpscare(
                            'trump'
                        );

                    },

                    config.totalDuration
                );
        };

    /* ============================================================
       OPTIMIZED STOP CRAWLING
       ============================================================ */

    EnemyAI.prototype.stopTrumpCrawling =
        function optimizedTrumpCrawlStop() {

            const perf =
                ensurePerf(this);

            if (
                !this.trump.isCrawling
            ) {

                return false;
            }

            const config =
                getTrumpConfig(
                    this
                ).ventCrawling;

            /*
             * Invalidate current crawl timers.
             */

            perf.token++;

            if (
                this.trump
                    .crawlingTimer
            ) {

                clearTracked(
                    this,
                    this.trump
                        .crawlingTimer
                );

                this.trump
                    .crawlingTimer =
                    null;
            }

            if (
                this.trump
                    .crawlSoundTimer
            ) {

                clearTracked(
                    this,
                    this.trump
                        .crawlSoundTimer
                );

                this.trump
                    .crawlSoundTimer =
                    null;
            }

            if (
                this.trump
                    .crawlSoundStopTimer
            ) {

                clearTracked(
                    this,
                    this.trump
                        .crawlSoundStopTimer
                );

                this.trump
                    .crawlSoundStopTimer =
                    null;
            }

            if (
                this.trump
                    .retreatTimer
            ) {

                clearTracked(
                    this,
                    this.trump
                        .retreatTimer
                );

                this.trump
                    .retreatTimer =
                    null;
            }

            /*
             * Stop audio immediately.
             */

            this.game.assets?.stopSound(
                'ventCrawling'
            );

            this.trump.isCrawling =
                false;

            /*
             * Pick a random depth-3 retreat location.
             *
             * These are already cached.
             */

            const retreatPool =
                perf.trumpDepthBuckets[3] ||
                perf.depthBuckets[3] ||
                perf.emptyArray;

            if (
                !retreatPool.length
            ) {

                return false;
            }

            const retreatLocation =
                retreatPool[
                    (
                        Math.random() *
                        retreatPool.length
                    ) | 0
                ];

            this.trump
                .currentLocation =
                retreatLocation;

            this.trump
                .crawlingFrom =
                null;

            queueCamera(
                this
            );

            /*
             * Delayed retreat sound.
             */

            const token =
                perf.token;

            this.trump
                .retreatTimer =

                schedule(
                    this,

                    () => {

                        if (
                            token !==
                            perf.token
                        ) {

                            return;
                        }

                        this.game.assets?.playSound(
                            'ventCrawling',
                            false,
                            0.8
                        );

                        /*
                         * End the retreat sound.
                         */

                        this.trump
                            .retreatSoundTimer =

                            schedule(
                                this,

                                () => {

                                    if (
                                        token ===
                                        perf.token
                                    ) {

                                        this.game.assets?.stopSound(
                                            'ventCrawling'
                                        );
                                    }

                                },

                                config.retreatSoundDuration
                            );

                    },

                    config.retreatDelay
                );

            return true;
        };

    /* ============================================================
       CAMERA DISPLAY THROTTLING
       ============================================================ */

    EnemyAI.prototype.updateCameraDisplay =
        function optimizedCameraDisplay() {

            /*
             * The AI may receive multiple state updates during the
             * same frame. Coalesce them into ONE visual refresh.
             */

            queueCamera(
                this,
                true
            );
        };

    /* ============================================================
       OPTIMIZED RESET
       ============================================================ */

    EnemyAI.prototype.reset =
        function optimizedEnemyReset() {

            /*
             * Call your original reset first.
             */

            NativeReset.call(
                this
            );

            const perf =
                ensurePerf(this);

            /*
             * Invalidate stale callbacks.
             */

            perf.token++;

            perf.destroyed =
                false;

            clearAllTracked(
                this
            );

            /*
             * Reset optimization state.
             */

            perf.night4Aggressive =
                false;

            perf.night5Aggressive =
                false;

            perf.epsteinAggressiveConfig =
                null;

            perf.trumpAggressiveConfig =
                null;

            perf.lastCameraUpdate =
                0;
        };

    /* ============================================================
       OPTIONAL DESTROY
       ============================================================

       Useful if you ever completely remove the game instance.
       ============================================================ */

    EnemyAI.prototype.destroy =
        function optimizedEnemyDestroy() {

            const perf =
                ensurePerf(this);

            perf.destroyed =
                true;

            perf.token++;

            clearAllTracked(
                this
            );

            if (
                this.game.assets
            ) {

                this.game.assets.stopSound(
                    'ventCrawling'
                );
            }

            this.hideHawkingWarning();
        };

})();
