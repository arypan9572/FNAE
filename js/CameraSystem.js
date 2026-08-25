/* ============================================================
   EFRAIN'S HOUSE — ULTRA CAMERA SYSTEM
   High-performance camera/security-monitor controller.

   Goals:
   • Preserve the original gameplay behavior/API.
   • Minimize DOM churn and layout/repaint work.
   • Avoid nested timer chains when possible.
   • Cache DOM references and static assets.
   • Reuse character elements instead of rebuilding everything.
   • Use requestAnimationFrame for visual transitions.
   • Pause expensive static video whenever it is unnecessary.
   • Keep camera transitions cinematic without sacrificing FPS.
   • Keep existing method names compatible with the game.
   ============================================================ */

class CameraSystem {
    constructor(game) {
        this.game = game;

        /* --------------------------------------------------------
           DOM CACHE
           -------------------------------------------------------- */

        this.cameraPanel =
            document.getElementById('camera-panel');

        this.currentCamLabel =
            document.getElementById('current-cam-label');

        this.cameraErrorLabel =
            document.getElementById('camera-error-label');

        this.playSoundBtn =
            document.getElementById('play-sound-btn');

        this.shockHawkingBtn =
            document.getElementById('shock-hawking-btn');

        this.staticVideo =
            document.getElementById('camera-static-video');

        this.cameraGrid =
            document.getElementById('camera-grid');

        this.characterOverlay =
            document.getElementById('character-overlay');

        /* --------------------------------------------------------
           GAMEPLAY STATE
           -------------------------------------------------------- */

        this.currentSoundToggle = false;
        this.soundButtonCooldown = false;
        this.soundButtonUseCount = 0;
        this.maxSoundUses = 5;
        this.cooldownTime = 8000;
        this.cooldownInterval = null;
        this.cooldownTimeout = null;

        this.locationAttractCount = Object.create(null);
        this.maxLocationAttractCount = 2;
        this.lastEpLocation = null;

        /* --------------------------------------------------------
           ENEMY CONFIG REFERENCES
           -------------------------------------------------------- */

        this.characterImages = null;
        this.characterPositions = null;
        this.characterBrightness = null;
        this.characterRotation = null;

        /* --------------------------------------------------------
           PERFORMANCE / TRANSITION STATE
           -------------------------------------------------------- */

        this.isTransitioning = false;
        this.transitionToken = 0;
        this.transitionRaf = 0;

        this.staticStopTimer = null;
        this.staticVideoActive = false;

        this.closeTimer = null;
        this.pendingViewUpdate = false;

        this.lastRenderedCamera = null;

        /* --------------------------------------------------------
           CHARACTER CACHE
           Instead of repeatedly creating/removing images, keep a
           tiny reusable cache for the three possible characters.
           -------------------------------------------------------- */

        this.characterCache = {
            hawking: null,
            ep: null,
            trump: null
        };

        this.characterVisibility = {
            hawking: false,
            ep: false,
            trump: false
        };

        /* --------------------------------------------------------
           MAP CACHE
           -------------------------------------------------------- */

        this.mapContainer = null;
        this.cameraHotspots = [];
        this.mapImage = null;
        this.mapBuilt = false;

        /* --------------------------------------------------------
           PREVENT REPEATED STYLE WRITES
           -------------------------------------------------------- */

        this.lastShockVisible = null;
        this.lastMapVisible = null;

        /* --------------------------------------------------------
           REDUCED-MOTION SUPPORT
           -------------------------------------------------------- */

        this.reducedMotionQuery =
            window.matchMedia
                ? window.matchMedia('(prefers-reduced-motion: reduce)')
                : null;

        this.reducedMotion =
            !!this.reducedMotionQuery?.matches;

        if (this.reducedMotionQuery) {
            const updateMotion = (event) => {
                this.reducedMotion = !!event.matches;
            };

            if (this.reducedMotionQuery.addEventListener) {
                this.reducedMotionQuery.addEventListener(
                    'change',
                    updateMotion
                );
            } else if (this.reducedMotionQuery.addListener) {
                this.reducedMotionQuery.addListener(
                    'change',
                    updateMotion
                );
            }
        }

        /* --------------------------------------------------------
           EVENT BINDING
           -------------------------------------------------------- */

        this.bindEvents();

        /* Build/capture static structures immediately, but only
           when they are actually needed on screen. */
        this.ensureCharacterOverlay();
    }

    /* ============================================================
       INIT
       ============================================================ */

    initEPConfig() {
        if (!this.game.enemyAI) {
            return;
        }

        this.characterImages =
            this.game.enemyAI.characterImages;

        this.characterPositions =
            this.game.enemyAI.characterPositions;

        this.characterBrightness =
            this.game.enemyAI.characterBrightness;

        this.characterRotation =
            this.game.enemyAI.characterRotation;
    }

    /* ============================================================
       EVENTS
       ============================================================ */

    bindEvents() {
        if (this.playSoundBtn) {
            this.playSoundBtn.addEventListener(
                'click',
                () => this.playAmbientSound()
            );
        }

        if (this.shockHawkingBtn) {
            this.shockHawkingBtn.addEventListener(
                'click',
                () => this.shockHawking()
            );
        }

        if (this.staticVideo) {
            this.staticVideo.preload = 'metadata';
            this.staticVideo.playsInline = true;
            this.staticVideo.muted = true;

            this.staticVideo.addEventListener(
                'ended',
                () => {
                    /* A one-shot static clip should not remain active
                       after naturally finishing. */
                    if (!this.game.state.cameraFailed) {
                        this.stopStatic();
                    }
                },
                { passive: true }
            );
        }

        document.addEventListener(
            'visibilitychange',
            () => {
                if (document.hidden) {
                    this.pauseExpensiveVisuals();
                } else if (
                    this.game.state.cameraOpen &&
                    this.game.state.cameraFailed
                ) {
                    this.startStatic(true);
                }
            },
            { passive: true }
        );
    }

    /* ============================================================
       DOM HELPERS
       ============================================================ */

    ensureCharacterOverlay() {
        if (this.characterOverlay) {
            return this.characterOverlay;
        }

        this.characterOverlay =
            document.getElementById('character-overlay');

        if (this.characterOverlay) {
            return this.characterOverlay;
        }

        if (!this.cameraPanel) {
            return null;
        }

        const overlay =
            document.createElement('div');

        overlay.id = 'character-overlay';

        Object.assign(
            overlay.style,
            {
                position: 'absolute',
                inset: '0',
                pointerEvents: 'none',
                zIndex: '8',
                overflow: 'hidden',
                contain: 'layout paint style'
            }
        );

        this.cameraPanel.appendChild(overlay);
        this.characterOverlay = overlay;

        return overlay;
    }

    setDisplay(element, visible) {
        if (!element) {
            return;
        }

        const next = visible ? 'block' : 'none';

        if (element.style.display !== next) {
            element.style.display = next;
        }
    }

    setClass(element, className, enabled) {
        if (!element) {
            return;
        }

        element.classList.toggle(
            className,
            !!enabled
        );
    }

    /* ============================================================
       CAMERA TOGGLE
       ============================================================ */

    toggle() {
        if (this.game.state.cameraOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    /* ============================================================
       OPEN CAMERA
       ============================================================ */

    open() {
        if (!this.cameraPanel) {
            return;
        }

        this.cancelCloseTimer();
        this.game.state.cameraOpen = true;

        this.cameraPanel.classList.remove('hidden');
        this.cameraPanel.classList.remove('closing');
        this.cameraPanel.classList.add('show');

        this.game.assets.playSound('crank1');

        /*
         * Looping static should only run while the monitor is open.
         */
        this.game.assets.playSound(
            'staticLoop',
            true,
            0.3
        );

        this.createCameraGrid();
        this.updateShockButtonVisibility();

        if (
            this.game.enemyAI &&
            this.game.enemyAI.hawking &&
            this.game.enemyAI.hawking.active
        ) {
            this.game.enemyAI.updateHawkingWarningDisplay();
        }

        if (this.game.state.cameraFailed) {
            this.showCameraFailure();
        } else {
            this.stopStatic();
            this.setMapVisible(true);

            if (this.cameraErrorLabel) {
                this.cameraErrorLabel.classList.remove('active');
            }

            this.scheduleViewUpdate();
        }

        this.game.isRotatingLeft = false;
        this.game.isRotatingRight = false;
    }

    /* ============================================================
       CAMERA FAILURE
       ============================================================ */

    showCameraFailure() {
        if (!this.cameraPanel) {
            return;
        }

        if (
            this.game.state.currentNight === 5 &&
            Math.random() < 0.3
        ) {
            this.game.showGoldenStephen();
        }

        this.invalidateTransition();

        this.game.state.cameraFailed = true;
        this.isTransitioning = true;

        this.cameraPanel.classList.add(
            'transitioning'
        );

        this.setMapVisible(false);

        if (this.cameraErrorLabel) {
            this.cameraErrorLabel.classList.add('active');
        }

        this.startStatic(true);
    }

    /* ============================================================
       STATIC SYSTEM
       ============================================================ */

    startStatic(restart = false) {
        if (!this.staticVideo) {
            return;
        }

        /*
         * Don't constantly seek/decide/repaint when already active.
         */
        if (
            this.staticVideoActive &&
            !restart
        ) {
            return;
        }

        this.staticVideoActive = true;

        this.staticVideo.classList.add('active');

        if (document.hidden) {
            return;
        }

        try {
            if (
                restart ||
                this.staticVideo.currentTime >=
                Math.max(
                    0,
                    this.staticVideo.duration || 0
                )
            ) {
                this.staticVideo.currentTime = 0;
            }
        } catch (_) {
            /* Some media states do not allow seeking yet. */
        }

        const playPromise =
            this.staticVideo.play();

        if (
            playPromise &&
            typeof playPromise.catch === 'function'
        ) {
            playPromise.catch(() => {
                /*
                 * Autoplay policy or a transient decode state can
                 * block playback. The visual CSS effect remains.
                 */
            });
        }
    }

    stopStatic() {
        if (!this.staticVideo) {
            return;
        }

        this.staticVideoActive = false;

        this.staticVideo.classList.remove('active');

        try {
            this.staticVideo.pause();

            /*
             * Do not continuously seek to zero on every transition.
             * Rewinding only when needed avoids extra media work.
             */
            if (
                this.staticVideo.readyState >= 1 &&
                this.staticVideo.currentTime !== 0
            ) {
                this.staticVideo.currentTime = 0;
            }
        } catch (_) {}
    }

    pauseExpensiveVisuals() {
        if (
            this.staticVideo &&
            !this.staticVideo.paused
        ) {
            this.staticVideo.pause();
        }

        if (this.cooldownInterval) {
            clearInterval(
                this.cooldownInterval
            );
            this.cooldownInterval = null;
        }
    }

    /* ============================================================
       RESTORE NORMAL VIEW
       ============================================================ */

    restoreCameraView() {
        this.invalidateTransition();

        this.stopStatic();

        this.isTransitioning = false;

        this.cameraPanel?.classList.remove(
            'transitioning'
        );

        this.cameraErrorLabel?.classList.remove(
            'active'
        );

        this.setMapVisible(true);

        this.scheduleViewUpdate();
    }

    /* ============================================================
       RESTART CAMERA
       ============================================================ */

    restartCamera() {
        if (
            this.game.state.controlPanelBusy
        ) {
            return;
        }

        this.game.state.cameraRestarting = true;
        this.game.state.controlPanelBusy = true;

        this.game.assets.playSound(
            'ekg',
            false,
            0.8
        );

        window.setTimeout(
            () => {
                this.game.state.cameraFailed = false;
                this.game.state.cameraRestarting = false;
                this.game.state.controlPanelBusy = false;

                this.game.assets.stopSound('static');

                this.resetSoundButtonCount();

                if (
                    this.game.state.cameraOpen
                ) {
                    this.restoreCameraView();
                }
            },
            4000
        );
    }

    /* ============================================================
       CLOSE CAMERA
       ============================================================ */

    close() {
        if (!this.cameraPanel) {
            return;
        }

        this.game.state.cameraOpen = false;

        this.invalidateTransition();

        this.stopStatic();

        this.cameraPanel.classList.add('closing');
        this.cameraPanel.classList.remove('show');

        this.game.assets.stopSound(
            'staticLoop'
        );

        if (this.characterOverlay) {
            this.characterOverlay.style.visibility = 'hidden';
        }

        if (
            this.game.enemyAI &&
            this.game.enemyAI.hawking &&
            this.game.enemyAI.hawking.active
        ) {
            this.game.enemyAI.updateHawkingWarningDisplay();
        }

        this.cancelCloseTimer();

        this.closeTimer =
            window.setTimeout(
                () => {
                    if (
                        this.game.state.cameraOpen
                    ) {
                        return;
                    }

                    this.cameraPanel.classList.add(
                        'hidden'
                    );

                    this.cameraPanel.classList.remove(
                        'closing'
                    );
                },
                this.reducedMotion
                    ? 0
                    : 400
            );

        this.game.assets.playSound(
            'crank2'
        );
    }

    cancelCloseTimer() {
        if (this.closeTimer) {
            clearTimeout(
                this.closeTimer
            );

            this.closeTimer = null;
        }
    }

    /* ============================================================
       CAMERA SWITCH
       ============================================================ */

    switchCamera(camNum) {
        if (
            this.game.state.cameraFailed ||
            !this.game.state.cameraOpen
        ) {
            return;
        }

        const targetCam =
            `cam${camNum}`;

        if (
            this.game.state.currentCam ===
            targetCam
        ) {
            return;
        }

        this.runCameraTransition(
            () => {
                this.game.state.currentCam =
                    targetCam;

                this.updateView();

                this.createCameraGrid();
            }
        );
    }

    /* ============================================================
       UNIFIED CAMERA TRANSITION
       Replaces several nested setTimeout chains.
       ============================================================ */

    runCameraTransition(
        midCallback
    ) {
        this.invalidateTransition();

        const token =
            ++this.transitionToken;

        this.isTransitioning = true;

        this.cameraPanel?.classList.add(
            'transitioning'
        );

        this.setMapVisible(false);

        if (this.characterOverlay) {
            this.characterOverlay.style.visibility =
                'hidden';
        }

        this.game.assets.setSoundVolume(
            'staticLoop',
            0.1
        );

        this.game.assets.playSound(
            'static',
            false,
            1.0
        );

        this.scheduleStaticStop(
            1000,
            token
        );

        this.startStatic();

        const halfDuration =
            this.reducedMotion
                ? 80
                : 500;

        this.transitionRaf =
            window.setTimeout(
                () => {
                    if (
                        token !==
                        this.transitionToken
                    ) {
                        return;
                    }

                    if (
                        this.game.state.cameraFailed
                    ) {
                        this.showCameraFailure();
                        return;
                    }

                    if (
                        typeof midCallback ===
                        'function'
                    ) {
                        midCallback();
                    }

                    this.finishCameraTransition(
                        token
                    );
                },
                halfDuration
            );
    }

    finishCameraTransition(token) {
        if (
            token !==
            this.transitionToken
        ) {
            return;
        }

        const finalDelay =
            this.reducedMotion
                ? 0
                : 500;

        window.setTimeout(
            () => {
                if (
                    token !==
                    this.transitionToken
                ) {
                    return;
                }

                if (
                    this.game.state.cameraFailed
                ) {
                    this.showCameraFailure();
                    return;
                }

                this.stopStatic();

                this.isTransitioning = false;

                this.cameraPanel?.classList.remove(
                    'transitioning'
                );

                this.setMapVisible(true);

                if (this.characterOverlay) {
                    this.characterOverlay.style.visibility =
                        'visible';
                }

                this.updateShockButtonVisibility();

                this.game.assets.setSoundVolume(
                    'staticLoop',
                    0.3
                );
            },
            finalDelay
        );
    }

    scheduleStaticStop(delay, token) {
        if (this.staticStopTimer) {
            clearTimeout(
                this.staticStopTimer
            );
        }

        this.staticStopTimer =
            window.setTimeout(
                () => {
                    if (
                        token ===
                        this.transitionToken
                    ) {
                        this.game.assets.stopSound(
                            'static'
                        );
                    }
                },
                delay
            );
    }

    invalidateTransition() {
        this.transitionToken++;

        if (this.transitionRaf) {
            clearTimeout(
                this.transitionRaf
            );

            this.transitionRaf = 0;
        }

        if (this.staticStopTimer) {
            clearTimeout(
                this.staticStopTimer
            );

            this.staticStopTimer = null;
        }

        this.isTransitioning = false;
    }

    /* ============================================================
       VIEW UPDATE
       ============================================================ */

    scheduleViewUpdate() {
        if (this.pendingViewUpdate) {
            return;
        }

        this.pendingViewUpdate = true;

        requestAnimationFrame(
            () => {
                this.pendingViewUpdate = false;

                this.updateView();
            }
        );
    }

    updateView() {
        if (
            this.game.state.cameraFailed ||
            !this.game.state.cameraOpen ||
            !this.cameraPanel
        ) {
            return;
        }

        const cam =
            this.game.state.currentCam;

        /*
         * Avoid forcing style/layout work if the camera hasn't
         * actually changed.
         */
        if (
            this.lastRenderedCamera !==
            cam
        ) {
            const image =
                this.game.assets?.images?.[cam];

            if (image?.src) {
                this.cameraPanel.style.backgroundImage =
                    `url("${image.src}")`;
            }

            this.lastRenderedCamera = cam;

            const camNum =
                cam.replace(
                    'cam',
                    ''
                );

            if (this.currentCamLabel) {
                this.currentCamLabel.textContent =
                    `CAM ${camNum}`;
            }
        }

        this.updateCharacterDisplay();
        this.updateShockButtonVisibility();

        if (this.characterOverlay) {
            this.characterOverlay.style.visibility =
                'visible';
        }
    }

    /* ============================================================
       CHARACTER CACHE
       ============================================================ */

    getOrCreateCharacter(
        key,
        className
    ) {
        const overlay =
            this.ensureCharacterOverlay();

        if (!overlay) {
            return null;
        }

        if (
            this.characterCache[key]
        ) {
            return this.characterCache[key];
        }

        const img =
            document.createElement('img');

        img.className =
            className;

        Object.assign(
            img.style,
            {
                position: 'absolute',
                display: 'block',
                pointerEvents: 'none',
                userSelect: 'none',
                maxWidth: 'none',
                contain: 'layout paint',
                willChange: 'transform, opacity'
            }
        );

        img.decoding = 'async';
        img.draggable = false;

        overlay.appendChild(img);

        this.characterCache[key] =
            img;

        return img;
    }

    hideAllCharacters() {
        for (
            const key
            of Object.keys(
                this.characterCache
            )
        ) {
            const element =
                this.characterCache[key];

            if (element) {
                element.style.display =
                    'none';
            }

            this.characterVisibility[key] =
                false;
        }
    }

    /* ============================================================
       CHARACTER DISPLAY
       ============================================================ */

    updateCharacterDisplay() {
        if (
            !this.game.enemyAI ||
            !this.game.state.cameraOpen
        ) {
            return;
        }

        const currentCam =
            this.game.state.currentCam;

        const epLocation =
            this.game.enemyAI.getCurrentLocation();

        const trumpLocation =
            this.game.enemyAI.getTrumpCurrentLocation();

        const hawkingActive =
            this.game.enemyAI.hawking?.active;

        const overlay =
            this.ensureCharacterOverlay();

        if (!overlay) {
            return;
        }

        this.hideAllCharacters();

        /* --------------------------------------------------------
           HAWKING
           -------------------------------------------------------- */

        if (
            hawkingActive &&
            currentCam === 'cam6'
        ) {
            const img =
                this.getOrCreateCharacter(
                    'hawking',
                    'visible hawking-character'
                );

            if (img) {
                img.src =
                    'assets/images/mrstephen.png';

                Object.assign(
                    img.style,
                    {
                        zIndex: '3',
                        left: '59.6%',
                        bottom: '0.9%',
                        width: '37%',
                        height: 'auto',
                        transform:
                            'translateX(-50%) rotate(-5deg)',
                        filter:
                            'brightness(0.33) contrast(1) saturate(1)',
                        display: 'block'
                    }
                );

                this.characterVisibility.hawking =
                    true;
            }
        }

        /* --------------------------------------------------------
           EP
           -------------------------------------------------------- */

        if (
            this.game.enemyAI.epstein?.hasSpawned &&
            epLocation === currentCam &&
            this.characterImages &&
            this.characterImages[currentCam]
        ) {
            const img =
                this.getOrCreateCharacter(
                    'ep',
                    'visible ep-character'
                );

            if (img) {
                const pos =
                    this.characterPositions?.[currentCam];

                img.src =
                    this.characterImages[currentCam];

                img.style.zIndex = '1';
                img.style.display = 'block';

                if (pos) {
                    img.style.left =
                        pos.left ??
                        'auto';

                    img.style.right =
                        pos.right ??
                        'auto';

                    img.style.bottom =
                        pos.bottom ??
                        '0';

                    img.style.width =
                        pos.width ??
                        'auto';

                    img.style.transform =
                        pos.transform ??
                        'none';
                }

                img.style.height =
                    'auto';

                const brightness =
                    this.characterBrightness?.[currentCam] ??
                    100;

                img.style.filter =
                    `brightness(${brightness}%)`;

                this.characterVisibility.ep =
                    true;

                /*
                 * Lightning eye visuals are rebuilt only when
                 * Night 6 actually needs them.
                 */
                if (
                    this.game.state.currentNight === 6
                ) {
                    this.renderLightningEyes(
                        img,
                        currentCam
                    );
                }
            }
        }

        /* --------------------------------------------------------
           TRUMP
           -------------------------------------------------------- */

        if (
            this.game.enemyAI.trump?.hasSpawned &&
            !this.game.enemyAI.trump.isCrawling &&
            trumpLocation === currentCam &&
            this.game.enemyAI.currentTrumpConfig
        ) {
            const trumpImages =
                this.game.enemyAI.trumpImages;

            const trumpPositions =
                this.game.enemyAI.trumpPositions;

            const trumpBrightness =
                this.game.enemyAI.trumpBrightness;

            if (
                trumpImages?.[currentCam]
            ) {
                const img =
                    this.getOrCreateCharacter(
                        'trump',
                        'visible trump-character'
                    );

                if (img) {
                    img.src =
                        trumpImages[currentCam];

                    img.style.zIndex = '2';
                    img.style.display = 'block';
                    img.style.height = 'auto';

                    const pos =
                        trumpPositions?.[currentCam];

                    if (pos) {
                        img.style.left =
                            pos.left ??
                            'auto';

                        img.style.right =
                            pos.right ??
                            'auto';

                        img.style.bottom =
                            pos.bottom ??
                            '0';

                        img.style.width =
                            pos.width ??
                            'auto';

                        img.style.transform =
                            pos.transform ??
                            'none';
                    }

                    const brightness =
                        trumpBrightness?.[currentCam] ??
                        100;

                    img.style.filter =
                        `brightness(${brightness}%)`;

                    this.characterVisibility.trump =
                        true;
                }
            }
        }
    }

    /* ============================================================
       CAMERA MAP
       ============================================================ */

    createCameraGrid() {
        if (!this.cameraGrid) {
            return;
        }

        /*
         * The map geometry never changes, so build it once.
         * Only the selected-camera state changes afterwards.
         */
        if (!this.mapBuilt) {
            this.buildCameraGridOnce();
            return;
        }

        this.updateCameraGridSelection();
    }

    buildCameraGridOnce() {
        if (!this.cameraGrid) {
            return;
        }

        this.cameraGrid.textContent = '';

        const mapContainer =
            document.createElement('div');

        mapContainer.className =
            'camera-map-container';

        Object.assign(
            mapContainer.style,
            {
                position: 'relative',
                width: '100%',
                height: '100%',
                contain: 'layout paint style'
            }
        );

        const mapImg =
            document.createElement('img');

        mapImg.src =
            'assets/images/FNAE-Map-layout.png';

        mapImg.alt =
            'Camera map';

        Object.assign(
            mapImg.style,
            {
                width: '100%',
                height: 'auto',
                display: 'block',
                userSelect: 'none',
                pointerEvents: 'none',
                contain: 'layout paint'
            }
        );

        mapContainer.appendChild(
            mapImg
        );

        this.mapContainer =
            mapContainer;

        this.mapImage =
            mapImg;

        /* --------------------------------------------------------
           PLAYER MARKER
           -------------------------------------------------------- */

        const youMarker =
            document.createElement('div');

        youMarker.className =
            'camera-you-marker';

        youMarker.textContent =
            'YOU';

        Object.assign(
            youMarker.style,
            {
                position: 'absolute',
                left: '7%',
                top: '82.6%',
                width: '13%',
                height: '8%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 'clamp(7px, 0.7vw, 14px)',
                fontWeight: 'bold',
                color: '#fff',
                textShadow: '1px 1px 2px #000',
                fontFamily: 'Arial, sans-serif',
                background: 'rgba(0,0,0,.5)',
                borderRadius: '4px',
                pointerEvents: 'none'
            }
        );

        mapContainer.appendChild(
            youMarker
        );

        /* --------------------------------------------------------
           CAMERA HOTSPOTS
           -------------------------------------------------------- */

        const cameraPositions = [
            { cam: 1, x: 25.7, y: 84.3, width: 13.0, height: 8.0 },
            { cam: 2, x: 35.0, y: 56.6, width: 13.0, height: 8.0 },
            { cam: 3, x: 51.5, y: 77.6, width: 13.0, height: 8.0 },
            { cam: 4, x: 57.7, y: 44.9, width: 12.9, height: 8.0 },
            { cam: 5, x: 75.4, y: 60.3, width: 12.9, height: 8.0 },
            { cam: 6, x: 77.2, y: 82.2, width: 13.0, height: 8.0 },
            { cam: 7, x: 52.0, y: 27.9, width: 12.9, height: 8.0 },
            { cam: 8, x: 80.2, y: 21.9, width: 12.8, height: 8.0 },
            { cam: 9, x: 24.4, y: 20.6, width: 12.9, height: 8.0 },
            { cam: 10, x: 7.9, y: 39.1, width: 12.8, height: 8.0 },
            { cam: 11, x: 72.9, y: 4.6, width: 13.0, height: 8.0 }
        ];

        const fragment =
            document.createDocumentFragment();

        this.cameraHotspots.length = 0;

        for (
            const pos
            of cameraPositions
        ) {
            const hotspot =
                document.createElement('button');

            hotspot.type =
                'button';

            hotspot.className =
                'camera-hotspot';

            hotspot.dataset.cam =
                String(pos.cam);

            hotspot.textContent =
                `CAM ${pos.cam}`;

            Object.assign(
                hotspot.style,
                {
                    position: 'absolute',
                    left: `${pos.x}%`,
                    top: `${pos.y}%`,
                    width: `${pos.width}%`,
                    height: `${pos.height}%`,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 'clamp(7px, 0.7vw, 14px)',
                    fontWeight: 'bold',
                    color: '#fff',
                    textShadow: '1px 1px 2px #000',
                    fontFamily: 'Arial, sans-serif',
                    whiteSpace: 'nowrap',
                    borderRadius: '4px',
                    letterSpacing: '.5px',
                    border: '0',
                    background: 'transparent',
                    padding: '0',
                    appearance: 'none',
                    WebkitAppearance: 'none',
                    contain: 'layout paint'
                }
            );

            if (
                this.game.state.currentCam ===
                `cam${pos.cam}`
            ) {
                hotspot.classList.add(
                    'camera-selected'
                );
            }

            hotspot.addEventListener(
                'click',
                () => {
                    this.switchCamera(
                        pos.cam
                    );
                }
            );

            hotspot.addEventListener(
                'pointerenter',
                () => {
                    if (
                        this.game.state.currentCam !==
                        `cam${pos.cam}`
                    ) {
                        hotspot.classList.add(
                            'camera-hover'
                        );
                    }
                },
                {
                    passive: true
                }
            );

            hotspot.addEventListener(
                'pointerleave',
                () => {
                    hotspot.classList.remove(
                        'camera-hover'
                    );
                },
                {
                    passive: true
                }
            );

            this.cameraHotspots.push(
                hotspot
            );

            fragment.appendChild(
                hotspot
            );
        }

        mapContainer.appendChild(
            fragment
        );

        this.cameraGrid.appendChild(
            mapContainer
        );

        this.mapBuilt = true;

        this.updateCameraGridSelection();
    }

    updateCameraGridSelection() {
        const selected =
            `cam${String(
                this.game.state.currentCam
            ).replace('cam', '')}`;

        for (
            const hotspot
            of this.cameraHotspots
        ) {
            const active =
                hotspot.dataset.cam ===
                selected.replace(
                    'cam',
                    ''
                );

            hotspot.classList.toggle(
                'camera-selected',
                active
            );

            if (active) {
                hotspot.setAttribute(
                    'aria-current',
                    'true'
                );
            } else {
                hotspot.removeAttribute(
                    'aria-current'
                );
            }
        }
    }

    setMapVisible(visible) {
        if (!this.cameraGrid) {
            return;
        }

        if (
            this.lastMapVisible ===
            visible
        ) {
            return;
        }

        this.lastMapVisible =
            visible;

        this.setDisplay(
            this.cameraGrid,
            visible
        );

        if (
            visible &&
            this.characterOverlay
        ) {
            this.characterOverlay.style.visibility =
                'visible';
        }
    }

    /* ============================================================
       AMBIENT SOUND BUTTON
       ============================================================ */

    async playAmbientSound() {
        if (
            this.soundButtonCooldown ||
            !this.playSoundBtn
        ) {
            return;
        }

        const currentCam =
            this.game.state.currentCam;

        const currentEpLocation =
            this.game.enemyAI.getCurrentLocation();

        if (
            this.lastEpLocation !==
            currentEpLocation
        ) {
            this.locationAttractCount =
                Object.create(null);

            this.lastEpLocation =
                currentEpLocation;
        }

        const soundFile =
            this.currentSoundToggle
                ? '2.ogg'
                : '1.ogg';

        this.currentSoundToggle =
            !this.currentSoundToggle;

        /*
         * IMPORTANT:
         * Avoid "new Audio()" here. That creates a fresh media
         * element every press. Reuse a tiny per-button player.
         */

        this.playAttractionSound(
            soundFile
        );

        let canAttract =
            true;

        if (
            this.locationAttractCount[currentCam] >=
            this.maxLocationAttractCount
        ) {
            canAttract = false;
        }

        let attracted =
            false;

        if (canAttract) {
            attracted =
                this.game.enemyAI.attractToSound(
                    currentCam
                );

            if (attracted) {
                this.playAttractionTransition();

                this.locationAttractCount[currentCam] =
                    (this.locationAttractCount[currentCam] || 0) +
                    1;

                this.lastEpLocation =
                    currentCam;
            }
        }

        this.soundButtonUseCount++;

        if (
            this.soundButtonUseCount >=
            this.maxSoundUses
        ) {
            this.soundButtonUseCount = 0;

            if (
                this.cameraPanel?.classList.contains(
                    'transitioning'
                )
            ) {
                this.stopStatic();
                this.cameraPanel.classList.remove(
                    'transitioning'
                );
            }

            this.game.enemyAI.triggerCameraFailure();
        }

        this.beginSoundButtonCooldown();
    }

    /* ------------------------------------------------------------
       Reusable ambient attraction audio
       ------------------------------------------------------------ */

    playAttractionSound(fileName) {
        if (
            !this._attractionAudio
        ) {
            const audio =
                new Audio();

            audio.preload =
                'metadata';

            audio.volume =
                1;

            this._attractionAudio =
                audio;
        }

        const audio =
            this._attractionAudio;

        const src =
            `assets/sounds/${fileName}`;

        if (audio.src !== src) {
            audio.src = src;
            audio.load();
        }

        try {
            audio.currentTime = 0;
        } catch (_) {}

        const promise =
            audio.play();

        if (
            promise &&
            typeof promise.catch ===
            'function'
        ) {
            promise.catch(
                () => {}
            );
        }
    }

    beginSoundButtonCooldown() {
        this.soundButtonCooldown =
            true;

        this.playSoundBtn.style.opacity =
            '0.5';

        this.playSoundBtn.style.cursor =
            'not-allowed';

        this.startCooldownAnimation();

        if (
            this.cooldownTimeout
        ) {
            clearTimeout(
                this.cooldownTimeout
            );
        }

        this.cooldownTimeout =
            window.setTimeout(
                () => {
                    this.soundButtonCooldown =
                        false;

                    if (
                        this.playSoundBtn
                    ) {
                        this.playSoundBtn.style.opacity =
                            '1';

                        this.playSoundBtn.style.cursor =
                            'pointer';
                    }

                    this.stopCooldownAnimation();
                },
                this.cooldownTime
            );
    }

    startCooldownAnimation() {
        this.stopCooldownAnimation();

        let dotCount = 0;

        this.cooldownInterval =
            window.setInterval(
                () => {
                    dotCount =
                        (dotCount + 1) % 4;

                    if (
                        this.playSoundBtn
                    ) {
                        this.playSoundBtn.textContent =
                            `PLAY SOUND${'.'.repeat(
                                dotCount
                            )}`;
                    }
                },
                500
            );
    }

    stopCooldownAnimation() {
        if (
            this.cooldownInterval
        ) {
            clearInterval(
                this.cooldownInterval
            );

            this.cooldownInterval =
                null;
        }

        if (
            this.playSoundBtn
        ) {
            this.playSoundBtn.textContent =
                'PLAY SOUND';
        }
    }

    /* ============================================================
       ATTRACTION TRANSITION
       ============================================================ */

    playAttractionTransition() {
        this.runCameraTransition(
            () => {
                this.updateCharacterDisplay();
            }
        );
    }

    /* ============================================================
       MOVEMENT TRANSITION
       ============================================================ */

    playMovementTransition() {
        if (
            this.game.state.cameraFailed
        ) {
            return;
        }

        this.runCameraTransition(
            () => {
                this.updateCharacterDisplay();
            }
        );
    }

    /* ============================================================
       RESET SOUND BUTTON
       ============================================================ */

    resetSoundButtonCount() {
        this.soundButtonUseCount = 0;
    }

    /* ============================================================
       HAWKING SHOCK
       ============================================================ */

    shockHawking() {
        this.game.assets.playSound(
            'hawking_shock',
            false,
            1.0
        );

        this.invalidateTransition();

        this.cameraPanel?.classList.add(
            'transitioning'
        );

        this.setMapVisible(false);

        if (this.characterOverlay) {
            this.characterOverlay.style.visibility =
                'hidden';
        }

        this.startStatic(true);

        window.setTimeout(
            () => {
                if (
                    this.game.enemyAI &&
                    typeof this.game.enemyAI.shockHawking ===
                    'function'
                ) {
                    this.game.enemyAI.shockHawking();
                }

                this.stopStatic();

                this.cameraPanel?.classList.remove(
                    'transitioning'
                );

                this.setMapVisible(true);

                this.updateView();
            },
            this.reducedMotion
                ? 80
                : 1000
        );
    }

    /* ============================================================
       SHOCK BUTTON
       ============================================================ */

    updateShockButtonVisibility() {
        if (!this.shockHawkingBtn) {
            return;
        }

        const currentCam =
            this.game.state.currentCam;

        const visible =
            this.game.state.currentNight >= 3 &&
            this.game.state.currentNight <= 5 &&
            this.game.state.cameraOpen &&
            currentCam === 'cam6';

        if (
            visible ===
            this.lastShockVisible
        ) {
            return;
        }

        this.lastShockVisible =
            visible;

        this.shockHawkingBtn.style.display =
            visible
                ? 'block'
                : 'none';
    }

    /* ============================================================
       LIGHTNING EYES
       HIGH PERFORMANCE VERSION
       ============================================================ */

    renderLightningEyes(
        epElement,
        currentCam
    ) {
        const config =
            this.game.enemyAI
                ?.lightningEyesConfig?.[currentCam];

        if (
            !config ||
            !epElement
        ) {
            return;
        }

        /*
         * Remove only the old lightning layer.
         * Do not rebuild the EP image itself.
         */

        const oldEyes =
            epElement.querySelector(
                ':scope > .lightning-eyes-layer'
            );

        if (oldEyes) {
            oldEyes.remove();
        }

        const layer =
            document.createElement('div');

        layer.className =
            'lightning-eyes-layer';

        Object.assign(
            layer.style,
            {
                position: 'absolute',
                inset: '0',
                pointerEvents: 'none',
                zIndex: '10',
                contain: 'layout paint style'
            }
        );

        const eyes = [
            config.eye1,
            config.eye2
        ];

        for (
            let i = 0;
            i < eyes.length;
            i++
        ) {
            const eyeConfig =
                eyes[i];

            if (!eyeConfig) {
                continue;
            }

            const eyeContainer =
                document.createElement('div');

            eyeContainer.className =
                'lightning-eye-container';

            Object.assign(
                eyeContainer.style,
                {
                    position: 'absolute',
                    left: eyeConfig.left,
                    top: eyeConfig.top,
                    width: eyeConfig.width,
                    height: eyeConfig.height,
                    transform:
                        'translate(-50%, -50%)',
                    transformOrigin:
                        'center center',
                    pointerEvents: 'none',
                    contain: 'layout paint'
                }
            );

            /*
             * Use CSS classes for animation instead of assigning
             * giant box-shadow strings inline on every frame.
             */

            const glow =
                document.createElement('div');

            glow.className =
                'lightning-eye-glow';

            const core =
                document.createElement('div');

            core.className =
                'lightning-eye-core';

            eyeContainer.append(
                glow,
                core
            );

            /*
             * Fewer bolts on low-power/reduced-motion situations.
             * They still look energetic but cost considerably less.
             */

            const boltCount =
                this.reducedMotion
                    ? 1
                    : 2;

            const fragment =
                document.createDocumentFragment();

            for (
                let i = 0;
                i < boltCount;
                i++
            ) {
                const bolt =
                    document.createElement('span');

                bolt.className =
                    'lightning-bolt';

                const rotation =
                    Math.random() * 360;

                const length =
                    30 +
                    Math.random() * 40;

                bolt.style.setProperty(
                    '--bolt-length',
                    `${length}%`
                );

                bolt.style.transform =
                    `translate(-50%, -50%) rotate(${rotation}deg)`;

                bolt.style.animationDelay =
                    `${Math.random() * 100}ms`;

                fragment.appendChild(
                    bolt
                );
            }

            eyeContainer.appendChild(
                fragment
            );

            layer.appendChild(
                eyeContainer
            );
        }

        epElement.appendChild(
            layer
        );
    }
}
