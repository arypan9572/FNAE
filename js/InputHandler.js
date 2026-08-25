/* ============================================================
   EFRAIN'S HOUSE — ULTRA INPUT HANDLER
   ============================================================

   FEATURES
   ------------------------------------------------------------
   • Keyboard controls
   • Mouse edge-view control
   • Smooth mobile swipe control
   • requestAnimationFrame touch rendering
   • High-refresh-rate friendly
   • Minimal DOM queries
   • Cached interactive-element checks
   • No unnecessary layout work
   • Automatic cleanup
   • Visibility-aware
   • Prevents stuck rotation states
   • Supports pointer/mouse/touch devices
   • Keeps original V / SPACE / F9 / F10 behavior
   ============================================================ */

class InputHandler {

    constructor(game) {

        this.game = game;

        /* --------------------------------------------------------
           TOUCH STATE
           -------------------------------------------------------- */

        this.touchStartX = 0;
        this.touchStartY = 0;

        this.lastTouchX = 0;
        this.lastTouchY = 0;

        this.isTouching = false;

        /*
         * Tracks whether the current gesture should control
         * camera/office rotation.
         */

        this.touchControlsActive = false;

        /*
         * Prevents repeated updates within the same browser frame.
         */

        this.touchFramePending = false;

        this.touchFrame =
            0;

        this.pendingTouchDelta = 0;

        /* --------------------------------------------------------
           MOUSE STATE
           -------------------------------------------------------- */

        this.mouseX = 0;

        this.screenWidth =
            window.innerWidth;

        this.edgeThreshold = 100;

        this.mouseRotationActive =
            false;

        /* --------------------------------------------------------
           CLEANUP STATE
           -------------------------------------------------------- */

        this.destroyed = false;

        this.boundEvents = [];

        /* --------------------------------------------------------
           DOM CACHE
           -------------------------------------------------------- */

        this.gameScreen =
            document.getElementById(
                'game-screen'
            );

        this.mainMenu =
            document.getElementById(
                'main-menu'
            );

        this.controlPanel =
            document.getElementById(
                'control-panel-popup'
            );

        /* --------------------------------------------------------
           MOBILE PERFORMANCE
           -------------------------------------------------------- */

        this.isCoarsePointer =
            window.matchMedia
                ? window.matchMedia(
                    '(pointer: coarse)'
                ).matches
                : false;

        this.reducedMotion =
            window.matchMedia
                ? window.matchMedia(
                    '(prefers-reduced-motion: reduce)'
                ).matches
                : false;

        /* --------------------------------------------------------
           BIND
           -------------------------------------------------------- */

        this.bindEvents();

        /* --------------------------------------------------------
           VISIBILITY
           -------------------------------------------------------- */

        this.bindVisibility();
    }

    /* ============================================================
       EVENT HELPER
       ============================================================ */

    addListener(
        target,
        type,
        handler,
        options
    ) {

        if (!target) {
            return;
        }

        target.addEventListener(
            type,
            handler,
            options
        );

        this.boundEvents.push({
            target,
            type,
            handler,
            options
        });
    }

    /* ============================================================
       EVENT BINDING
       ============================================================ */

    bindEvents() {

        /*
         * Keyboard controls
         */

        this.addListener(
            document,
            'keydown',
            e =>
                this.handleKeyPress(e),
            {
                passive: false
            }
        );

        /*
         * Window resize.
         */

        this.addListener(
            window,
            'resize',
            () =>
                this.handleResize(),
            {
                passive: true
            }
        );

        /*
         * Mouse movement.
         */

        if (this.gameScreen) {

            this.addListener(
                this.gameScreen,
                'mousemove',
                e =>
                    this.handleMouseMove(e),
                {
                    passive: true
                }
            );

            /*
             * Touch events.
             *
             * We intentionally keep passive:false because the game
             * needs to prevent browser scrolling during swipes.
             */

            this.addListener(
                this.gameScreen,
                'touchstart',
                e =>
                    this.handleTouchStart(e),
                {
                    passive: false
                }
            );

            this.addListener(
                this.gameScreen,
                'touchmove',
                e =>
                    this.handleTouchMove(e),
                {
                    passive: false
                }
            );

            this.addListener(
                this.gameScreen,
                'touchend',
                e =>
                    this.handleTouchEnd(e),
                {
                    passive: false
                }
            );

            this.addListener(
                this.gameScreen,
                'touchcancel',
                e =>
                    this.handleTouchCancel(e),
                {
                    passive: false
                }
            );
        }
    }

    /* ============================================================
       VISIBILITY
       ============================================================ */

    bindVisibility() {

        this.addListener(
            document,
            'visibilitychange',
            () => {

                if (
                    document.hidden
                ) {

                    this.resetInputState();
                }

            },
            {
                passive: true
            }
        );

        /*
         * Also reset input if the window loses focus.
         *
         * This prevents the classic:
         * "I held the mouse at the edge, switched tabs,
         * came back, and the camera kept spinning."
         */

        this.addListener(
            window,
            'blur',
            () => {

                this.resetInputState();

            },
            {
                passive: true
            }
        );
    }

    /* ============================================================
       RESIZE
       ============================================================ */

    handleResize() {

        this.screenWidth =
            window.innerWidth;

        /*
         * Scale edge threshold with viewport size while keeping
         * sensible minimum/maximum values.
         */

        this.edgeThreshold =
            Math.max(
                55,
                Math.min(
                    140,
                    this.screenWidth * 0.075
                )
            );
    }

    /* ============================================================
       GAME RUNNING CHECK
       ============================================================ */

    canControl() {

        const state =
            this.game?.state;

        if (!state) {
            return false;
        }

        if (
            !state.isGameRunning ||
            state.gameOver
        ) {

            return false;
        }

        if (
            state.pageHidden ||
            document.hidden
        ) {

            return false;
        }

        /*
         * Camera opening disables office rotation.
         */

        if (
            state.cameraOpen
        ) {

            return false;
        }

        return true;
    }

    /* ============================================================
       INTERACTIVE ELEMENT DETECTION
       ============================================================ */

    isInteractiveTarget(
        target
    ) {

        if (
            !target ||
            !target.closest
        ) {

            return false;
        }

        /*
         * These match the interactive elements from the existing
         * game implementation.
         */

        return !!target.closest(
            [
                '.hotspot',
                '.control-panel-button',
                '.camera-button',
                '.camera-hotspot',
                '#control-panel-popup',
                '#camera-panel',
                'button',
                'input',
                'select',
                'textarea',
                'a'
            ].join(',')
        );
    }

    /* ============================================================
       KEYBOARD
       ============================================================ */

    handleKeyPress(e) {

        if (
            this.destroyed
        ) {

            return;
        }

        /*
         * Ignore keyboard shortcuts when typing into text fields.
         */

        const target =
            e.target;

        const typing =
            target &&
            (
                target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.tagName === 'SELECT' ||
                target.isContentEditable
            );

        if (typing) {
            return;
        }

        const key =
            String(
                e.key
            ).toLowerCase();

        /* ========================================================
           F9 — SKIP NIGHT
           ======================================================== */

        if (
            e.key === 'F9'
        ) {

            e.preventDefault();

            if (
                !this.game.state.isGameRunning
            ) {

                return;
            }

            this.showCheatNotification(
                'Skipping Night ' +
                this.game.state.currentNight
            );

            /*
             * Small delay keeps the notification visible while
             * avoiding a separate long-lived timeout.
             */

            window.setTimeout(
                () => {

                    if (
                        this.game?.state
                            ?.isGameRunning
                    ) {

                        this.game.winNight();
                    }

                },
                500
            );

            return;
        }

        /* ========================================================
           F10 — UNLOCK NIGHT 6
           ======================================================== */

        if (
            e.key === 'F10'
        ) {

            e.preventDefault();

            localStorage.setItem(
                'night6Unlocked',
                'true'
            );

            this.showCheatNotification(
                'Special Night Unlocked!'
            );

            if (
                this.game.mainMenu &&
                !this.game.mainMenu.classList.contains(
                    'hidden'
                )
            ) {

                this.game.updateContinueButton();
            }

            return;
        }

        /* ========================================================
           NORMAL GAME INPUT
           ======================================================== */

        if (
            !this.game.state.isGameRunning
        ) {

            return;
        }

        /*
         * Don't accept gameplay input while controls are locked.
         */

        if (
            this.game.state.inputLocked
        ) {

            return;
        }

        switch (
            key
        ) {

            case 'v':

                /*
                 * Don't spam the vent toggle while the previous
                 * toggle operation is still running.
                 */

                if (
                    !this.game.state
                        .controlPanelBusy
                ) {

                    this.game.toggleVents();
                }

                break;

            case ' ':

                e.preventDefault();

                /*
                 * Space toggles camera.
                 */

                if (
                    !this.game.state
                        .controlPanelBusy
                ) {

                    this.game.toggleCamera();
                }

                break;

            default:

                break;
        }
    }

    /* ============================================================
       CHEAT NOTIFICATION
       ============================================================ */

    showCheatNotification(
        message
    ) {

        /*
         * Reuse an existing notification if one exists.
         * This avoids creating a growing collection of DOM nodes
         * if debug keys are spammed.
         */

        let notification =
            document.getElementById(
                'fnae-cheat-notification'
            );

        if (!notification) {

            notification =
                document.createElement(
                    'div'
                );

            notification.id =
                'fnae-cheat-notification';

            Object.assign(
                notification.style,
                {
                    position: 'fixed',
                    top: '10px',
                    left: '50%',
                    transform:
                        'translate3d(-50%,0,0)',
                    background:
                        'rgba(255,215,0,.9)',
                    color: '#000',
                    padding:
                        '10px 20px',
                    fontSize:
                        'clamp(13px,2vw,20px)',
                    fontWeight:
                        'bold',
                    fontFamily:
                        'Arial,sans-serif',
                    borderRadius:
                        '5px',
                    zIndex:
                        '99999',
                    boxShadow:
                        '0 0 20px rgba(255,215,0,.8)',
                    pointerEvents:
                        'none',
                    contain:
                        'layout paint',
                    willChange:
                        'opacity, transform'
                }
            );

            document.body.appendChild(
                notification
            );
        }

        notification.textContent =
            '🎮 CHEAT: ' +
            message;

        notification.style.opacity =
            '1';

        /*
         * Clear previous removal timer.
         */

        if (
            this.cheatNotificationTimer
        ) {

            clearTimeout(
                this.cheatNotificationTimer
            );
        }

        this.cheatNotificationTimer =
            window.setTimeout(
                () => {

                    if (
                        notification
                    ) {

                        notification.style.opacity =
                            '0';
                    }

                },
                1000
            );
    }

    /* ============================================================
       MOUSE EDGE ROTATION
       ============================================================ */

    handleMouseMove(
        e
    ) {

        if (
            this.destroyed
        ) {

            return;
        }

        /*
         * Cache mouse position.
         */

        this.mouseX =
            e.clientX;

        /*
         * No need to do anything if game isn't controllable.
         */

        if (
            !this.canControl()
        ) {

            this.stopMouseRotation();

            return;
        }

        const threshold =
            this.edgeThreshold;

        const width =
            this.screenWidth ||
            window.innerWidth;

        const x =
            this.mouseX;

        /*
         * Left edge.
         */

        if (
            x <= threshold
        ) {

            this.game.isRotatingLeft =
                true;

            this.game.isRotatingRight =
                false;

            this.mouseRotationActive =
                true;

            return;
        }

        /*
         * Right edge.
         */

        if (
            x >=
            width - threshold
        ) {

            this.game.isRotatingRight =
                true;

            this.game.isRotatingLeft =
                false;

            this.mouseRotationActive =
                true;

            return;
        }

        /*
         * Center area.
         */

        this.stopMouseRotation();
    }

    /* ============================================================
       STOP MOUSE ROTATION
       ============================================================ */

    stopMouseRotation() {

        this.game.isRotatingLeft =
            false;

        this.game.isRotatingRight =
            false;

        this.mouseRotationActive =
            false;
    }

    /* ============================================================
       TOUCH START
       ============================================================ */

    handleTouchStart(
        e
    ) {

        if (
            this.destroyed
        ) {

            return;
        }

        if (
            !this.canControl()
        ) {

            return;
        }

        if (
            !e.touches ||
            !e.touches.length
        ) {

            return;
        }

        const target =
            e.target;

        /*
         * Do not steal gestures from game controls.
         */

        if (
            this.isInteractiveTarget(
                target
            )
        ) {

            this.touchControlsActive =
                false;

            this.isTouching =
                false;

            return;
        }

        const touch =
            e.touches[0];

        this.touchStartX =
            touch.clientX;

        this.touchStartY =
            touch.clientY;

        this.lastTouchX =
            touch.clientX;

        this.lastTouchY =
            touch.clientY;

        this.pendingTouchDelta =
            0;

        this.isTouching =
            true;

        this.touchControlsActive =
            true;

        /*
         * Prevent browser scrolling once the gesture has been
         * identified as a game gesture.
         */

        e.preventDefault();
    }

    /* ============================================================
       TOUCH MOVE
       ============================================================ */

    handleTouchMove(
        e
    ) {

        if (
            this.destroyed ||
            !this.isTouching ||
            !this.touchControlsActive
        ) {

            return;
        }

        if (
            !this.canControl()
        ) {

            this.resetTouchState();

            return;
        }

        if (
            !e.touches ||
            !e.touches.length
        ) {

            return;
        }

        const touch =
            e.touches[0];

        /*
         * Calculate movement from the previous point rather than
         * from the original start point.

         * This creates smooth continuous dragging.
         */

        const deltaX =
            touch.clientX -
            this.lastTouchX;

        const totalDeltaY =
            touch.clientY -
            this.touchStartY;

        /*
         * Ignore mostly-vertical gestures.
         */

        if (
            Math.abs(
                totalDeltaY
            ) >= 50
        ) {

            return;
        }

        /*
         * Preserve the original game's direction:
         * swipe right -> view right
         * swipe left -> view left
         */

        const sensitivity =
            this.reducedMotion
                ? 0.0015
                : 0.002;

        this.pendingTouchDelta +=
            -deltaX *
            sensitivity;

        this.lastTouchX =
            touch.clientX;

        this.lastTouchY =
            touch.clientY;

        /*
         * Prevent the page from scrolling.
         */

        e.preventDefault();

        /*
         * Render at most once per animation frame.
         */

        this.queueTouchRender();
    }

    /* ============================================================
       QUEUE TOUCH RENDER
       ============================================================ */

    queueTouchRender() {

        if (
            this.touchFramePending
        ) {

            return;
        }

        this.touchFramePending =
            true;

        this.touchFrame =
            requestAnimationFrame(
                () => {

                    this.touchFramePending =
                        false;

                    this.touchFrame =
                        0;

                    if (
                        !this.canControl() ||
                        !this.isTouching
                    ) {

                        this.pendingTouchDelta =
                            0;

                        return;
                    }

                    const delta =
                        this.pendingTouchDelta;

                    this.pendingTouchDelta =
                        0;

                    if (
                        delta === 0
                    ) {

                        return;
                    }

                    const oldPosition =
                        this.game.viewPosition;

                    const nextPosition =
                        Math.max(
                            0,
                            Math.min(
                                1,
                                oldPosition +
                                delta
                            )
                        );

                    /*
                     * Don't call into the UI if there is literally
                     * no movement.
                     */

                    if (
                        nextPosition ===
                        oldPosition
                    ) {

                        return;
                    }

                    this.game.viewPosition =
                        nextPosition;

                    /*
                     * One UI update per frame maximum.
                     */

                    if (
                        this.game.ui
                            ?.updateViewPosition
                    ) {

                        this.game.ui
                            .updateViewPosition(
                                nextPosition
                            );
                    }

                }
            );
    }

    /* ============================================================
       TOUCH END
       ============================================================ */

    handleTouchEnd(
        e
    ) {

        if (
            this.destroyed
        ) {

            return;
        }

        if (
            e.cancelable
        ) {

            /*
             * The game owns the gesture.
             */
            e.preventDefault();
        }

        this.resetTouchState();
    }

    /* ============================================================
       TOUCH CANCEL
       ============================================================ */

    handleTouchCancel(
        e
    ) {

        if (
            e.cancelable
        ) {

            e.preventDefault();
        }

        this.resetTouchState();
    }

    /* ============================================================
       RESET TOUCH STATE
       ============================================================ */

    resetTouchState() {

        this.isTouching =
            false;

        this.touchControlsActive =
            false;

        this.pendingTouchDelta =
            0;

        this.touchStartX =
            0;

        this.touchStartY =
            0;

        this.lastTouchX =
            0;

        this.lastTouchY =
            0;

        /*
         * The RAF can safely finish, but cancel it when there is
         * no work left.
         */

        if (
            this.touchFrame
        ) {

            cancelAnimationFrame(
                this.touchFrame
            );

            this.touchFrame =
                0;

            this.touchFramePending =
                false;
        }

        /*
         * Touch input should never leave edge rotation active.
         */

        this.stopMouseRotation();
    }

    /* ============================================================
       RESET EVERYTHING
       ============================================================ */

    resetInputState() {

        this.stopMouseRotation();

        this.resetTouchState();

        this.mouseX =
            0;
    }

    /* ============================================================
       CLEANUP
       ============================================================ */

    destroy() {

        if (
            this.destroyed
        ) {

            return;
        }

        this.destroyed =
            true;

        this.resetInputState();

        if (
            this.cheatNotificationTimer
        ) {

            clearTimeout(
                this.cheatNotificationTimer
            );

            this.cheatNotificationTimer =
                null;
        }

        /*
         * Remove every registered listener.
         */

        for (
            const entry
            of this.boundEvents
        ) {

            try {

                entry.target.removeEventListener(
                    entry.type,
                    entry.handler,
                    entry.options
                );

            } catch (_) {}
        }

        this.boundEvents.length =
            0;

        /*
         * Remove debug notification if it exists.
         */

        const notification =
            document.getElementById(
                'fnae-cheat-notification'
            );

        if (
            notification
        ) {

            notification.remove();
        }
    }
}
