// ============================================================
// Input Handler
// Optimized for:
// - Low input latency
// - Low CPU overhead
// - Mouse + touch + pen through Pointer Events
// - Smooth mobile swiping
// - Edge-triggered camera rotation
// - Reusable cheat notification
// - Cached DOM references
// - requestAnimationFrame input processing
// - Safe cleanup / destroy support
// ============================================================

class InputHandler {
    // ========================================================
    // Configuration
    // ========================================================

    static EDGE_THRESHOLD = 100;
    static TOUCH_VERTICAL_THRESHOLD = 50;
    static TOUCH_SENSITIVITY = 0.002;

    // Maximum number of milliseconds allowed between
    // input-frame updates before resetting accumulated touch input.
    static INPUT_FRAME_MAX_DELTA = 100;

    constructor(game) {
        this.game = game;

        // ----------------------------------------------------
        // Cached DOM
        // ----------------------------------------------------

        this.gameScreen = document.getElementById('game-screen');

        // ----------------------------------------------------
        // Touch / pointer state
        // ----------------------------------------------------

        this.touchStartX = 0;
        this.touchStartY = 0;

        this.lastTouchX = 0;
        this.lastTouchY = 0;

        this.isTouching = false;
        this.activePointerId = null;

        // Determines whether this gesture has been
        // classified as horizontal.
        this.isHorizontalGesture = false;

        // Accumulated horizontal movement.
        //
        // Pointer events can arrive much faster than the
        // browser renders. Instead of modifying the game
        // hundreds of times per second, we collect movement
        // here and consume it once per animation frame.
        this.pendingTouchDelta = 0;

        // ----------------------------------------------------
        // Mouse state
        // ----------------------------------------------------

        this.mouseX = 0;
        this.mouseY = 0;

        this.hasMousePosition = false;

        // ----------------------------------------------------
        // Animation frame state
        // ----------------------------------------------------

        this.inputFrameId = null;
        this.lastInputFrameTime = 0;
        this.isDestroyed = false;

        // ----------------------------------------------------
        // Cheat notification state
        // ----------------------------------------------------

        this.cheatNotification = null;
        this.cheatNotificationTimeout = null;

        // ----------------------------------------------------
        // Event binding
        // ----------------------------------------------------

        this.bindHandlers();

        // ----------------------------------------------------
        // Initialize
        // ----------------------------------------------------

        this.bindEvents();
        this.createCheatNotification();
        this.startInputFrame();
    }

    // ========================================================
    // Event binding
    // ========================================================

    bindHandlers() {
        // Keep stable references so listeners can be removed
        // later in destroy().
        this.boundHandleKeyPress = this.handleKeyPress.bind(this);

        this.boundHandlePointerMove = this.handlePointerMove.bind(this);
        this.boundHandlePointerDown = this.handlePointerDown.bind(this);
        this.boundHandlePointerUp = this.handlePointerUp.bind(this);
        this.boundHandlePointerCancel = this.handlePointerCancel.bind(this);

        // Compatibility aliases for existing code.
        this.boundHandleMouseMove = this.handleMouseMove.bind(this);
        this.boundHandleTouchStart = this.handleTouchStart.bind(this);
        this.boundHandleTouchMove = this.handleTouchMove.bind(this);
        this.boundHandleTouchEnd = this.handleTouchEnd.bind(this);

        this.boundInputFrame = this.processInputFrame.bind(this);
    }

    // ========================================================
    // Bind events
    // ========================================================

    bindEvents() {
        // ----------------------------------------------------
        // Safety check
        // ----------------------------------------------------

        if (!this.gameScreen) {
            console.error(
                'InputHandler: #game-screen was not found.'
            );
            return;
        }

        // ----------------------------------------------------
        // Keyboard
        // ----------------------------------------------------

        document.addEventListener(
            'keydown',
            this.boundHandleKeyPress
        );

        // ----------------------------------------------------
        // Pointer Events
        //
        // Pointer Events unify mouse, touch, and stylus input.
        // ----------------------------------------------------

        this.gameScreen.addEventListener(
            'pointermove',
            this.boundHandlePointerMove,
            {
                passive: true
            }
        );

        this.gameScreen.addEventListener(
            'pointerdown',
            this.boundHandlePointerDown,
            {
                passive: false
            }
        );

        this.gameScreen.addEventListener(
            'pointerup',
            this.boundHandlePointerUp,
            {
                passive: true
            }
        );

        this.gameScreen.addEventListener(
            'pointercancel',
            this.boundHandlePointerCancel,
            {
                passive: true
            }
        );

        // ----------------------------------------------------
        // Tell the browser that this area belongs to the game.
        //
        // This is especially useful for touch devices because
        // the browser knows the element is not intended to
        // behave like ordinary page scrolling.
        // ----------------------------------------------------

        this.applyTouchAction();
    }

    // ========================================================
    // Touch action
    // ========================================================

    applyTouchAction() {
        if (!this.gameScreen) return;

        // Save previous value so destroy() can restore it.
        this.previousTouchAction =
            this.gameScreen.style.touchAction;

        // The game uses its own horizontal touch gesture.
        this.gameScreen.style.touchAction = 'none';
    }

    // ========================================================
    // Input frame
    //
    // Pointer events can arrive much more frequently than the
    // browser paints. requestAnimationFrame lets us consume
    // pending movement at the display's normal frame cadence.
    // ========================================================

    startInputFrame() {
        if (this.isDestroyed) return;

        this.lastInputFrameTime = performance.now();

        if (this.inputFrameId !== null) {
            return;
        }

        this.inputFrameId = requestAnimationFrame(
            this.boundInputFrame
        );
    }

    processInputFrame(timestamp) {
        this.inputFrameId = null;

        if (this.isDestroyed) {
            return;
        }

        const elapsed =
            timestamp - this.lastInputFrameTime;

        this.lastInputFrameTime = timestamp;

        // ----------------------------------------------------
        // Reset stale touch data
        // ----------------------------------------------------

        if (
            elapsed >
            InputHandler.INPUT_FRAME_MAX_DELTA
        ) {
            this.pendingTouchDelta = 0;
        }

        // ----------------------------------------------------
        // Apply accumulated touch movement
        // ----------------------------------------------------

        if (
            this.pendingTouchDelta !== 0 &&
            this.isTouching
        ) {
            this.applyTouchMovement(
                this.pendingTouchDelta
            );

            this.pendingTouchDelta = 0;
        }

        // ----------------------------------------------------
        // Keep edge rotation state synchronized
        // ----------------------------------------------------

        this.updateMouseEdgeRotation();

        // ----------------------------------------------------
        // Continue the input loop
        // ----------------------------------------------------

        this.inputFrameId = requestAnimationFrame(
            this.boundInputFrame
        );
    }

    // ========================================================
    // Utility
    // ========================================================

    isGameRunning() {
        return !!(
            this.game &&
            this.game.state &&
            this.game.state.isGameRunning
        );
    }

    isCameraOpen() {
        return !!(
            this.game &&
            this.game.state &&
            this.game.state.cameraOpen
        );
    }

    isInputBlocked() {
        return (
            !this.isGameRunning() ||
            this.isCameraOpen()
        );
    }

    // ========================================================
    // Pointer target filtering
    // ========================================================

    isUIElementTarget(target) {
        if (!target || !target.closest) {
            return false;
        }

        return !!target.closest(
            [
                '.hotspot',
                '.control-panel-button',
                '.camera-button',
                '#control-panel-popup'
            ].join(',')
        );
    }

    // ========================================================
    // Keyboard controls
    // ========================================================

    handleKeyPress(e) {
        if (this.isDestroyed) return;

        const game = this.game;

        if (!game || !game.state) {
            return;
        }

        // ====================================================
        // Cheat keys
        // ====================================================

        // F9: Skip current night
        if (e.key === 'F9') {
            e.preventDefault();

            if (game.state.isGameRunning) {
                console.log(
                    '🎮 CHEAT: Skipping current night...'
                );

                this.showCheatNotification(
                    'Skipping Night ' +
                    game.state.currentNight
                );

                // Keep the original 500ms delay so this
                // behavior remains unchanged.
                setTimeout(() => {
                    if (
                        !this.isDestroyed &&
                        game &&
                        typeof game.winNight === 'function'
                    ) {
                        game.winNight();
                    }
                }, 500);
            }

            return;
        }

        // F10: Unlock special night
        if (e.key === 'F10') {
            e.preventDefault();

            console.log(
                '🎮 CHEAT: Unlocking Special Night...'
            );

            try {
                localStorage.setItem(
                    'night6Unlocked',
                    'true'
                );
            } catch (error) {
                console.warn(
                    'InputHandler: Unable to access localStorage.',
                    error
                );
            }

            this.showCheatNotification(
                'Special Night Unlocked!'
            );

            // Update main menu if available.
            if (
                game.mainMenu &&
                !game.mainMenu.classList.contains('hidden') &&
                typeof game.updateContinueButton === 'function'
            ) {
                game.updateContinueButton();
            }

            return;
        }

        /*
        // ====================================================
        // F7: Time acceleration
        // ====================================================

        if (e.key === 'F7') {
            e.preventDefault();

            if (game.state.isGameRunning) {
                game.state.currentTime += 1;

                if (
                    game.ui &&
                    typeof game.ui.update === 'function'
                ) {
                    game.ui.update();
                }

                this.showCheatNotification(
                    `Time: ${game.state.currentTime} AM`
                );

                if (game.state.currentTime >= 6) {
                    game.winNight();
                }
            }

            return;
        }

        // ====================================================
        // Number keys: Jump to night
        // ====================================================

        if (e.key >= '1' && e.key <= '6') {
            if (
                game.mainMenu &&
                !game.mainMenu.classList.contains('hidden')
            ) {
                e.preventDefault();

                const night = Number(e.key);

                console.log(
                    `🎮 CHEAT: Jumping to Night ${night}...`
                );

                game.state.currentNight = night;

                this.showCheatNotification(
                    `Starting Night ${night}`
                );

                if (night === 6) {
                    try {
                        localStorage.setItem(
                            'night6Unlocked',
                            'true'
                        );
                    } catch (error) {
                        console.warn(
                            'InputHandler: Unable to access localStorage.',
                            error
                        );
                    }

                    setTimeout(() => {
                        if (
                            !this.isDestroyed &&
                            typeof game.startSpecialNight === 'function'
                        ) {
                            game.startSpecialNight();
                        }
                    }, 500);
                } else {
                    setTimeout(() => {
                        if (
                            !this.isDestroyed &&
                            typeof game.initGame === 'function'
                        ) {
                            game.initGame();
                        }
                    }, 500);
                }

                game.mainMenu.classList.add('hidden');

                const menuMusic =
                    document.getElementById('menu-music');

                if (menuMusic) {
                    menuMusic.pause();
                    menuMusic.currentTime = 0;
                }
            }

            return;
        }
        */

        // ====================================================
        // Normal gameplay controls
        // ====================================================

        if (!game.state.isGameRunning) {
            return;
        }

        const key = String(e.key).toLowerCase();

        switch (key) {
            case 'v':
                if (
                    typeof game.toggleVents === 'function'
                ) {
                    game.toggleVents();
                }
                break;

            case ' ':
                e.preventDefault();

                if (
                    typeof game.toggleCamera === 'function'
                ) {
                    game.toggleCamera();
                }
                break;

            default:
                break;
        }
    }

    // ========================================================
    // Cheat notification
    // ========================================================

    createCheatNotification() {
        if (this.cheatNotification) {
            return;
        }

        const notification =
            document.createElement('div');

        notification.className =
            'input-handler-cheat-notification';

        // Use CSS if the page already supplies it.
        // Inline values below keep this class self-contained.
        Object.assign(notification.style, {
            position: 'fixed',
            top: '10px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(255, 215, 0, 0.9)',
            color: '#000',
            padding: '10px 20px',
            fontSize: '20px',
            fontWeight: 'bold',
            fontFamily: 'Arial, sans-serif',
            borderRadius: '5px',
            zIndex: '99999',
            boxShadow:
                '0 0 20px rgba(255, 215, 0, 0.8)',
            opacity: '0',
            visibility: 'hidden',
            pointerEvents: 'none',
            transition:
                'opacity 120ms ease-out',
            willChange: 'opacity'
        });

        document.body.appendChild(notification);

        this.cheatNotification = notification;
    }

    showCheatNotification(message) {
        if (this.isDestroyed) return;

        // Make absolutely sure the element exists.
        if (!this.cheatNotification) {
            this.createCheatNotification();
        }

        const notification =
            this.cheatNotification;

        if (!notification) return;

        // Clear previous removal timer.
        if (this.cheatNotificationTimeout !== null) {
            clearTimeout(
                this.cheatNotificationTimeout
            );

            this.cheatNotificationTimeout = null;
        }

        notification.textContent =
            '🎮 CHEAT: ' + message;

        notification.style.visibility = 'visible';
        notification.style.opacity = '1';

        this.cheatNotificationTimeout =
            setTimeout(() => {
                if (
                    this.isDestroyed ||
                    !this.cheatNotification
                ) {
                    return;
                }

                this.cheatNotification.style.opacity = '0';

                // Give the opacity transition time to finish.
                this.cheatNotificationTimeout =
                    setTimeout(() => {
                        if (
                            this.cheatNotification &&
                            !this.isDestroyed
                        ) {
                            this.cheatNotification.style.visibility =
                                'hidden';
                        }

                        this.cheatNotificationTimeout = null;
                    }, 140);
            }, 860);
    }

    // ========================================================
    // Pointer movement
    // ========================================================

    handlePointerMove(e) {
        if (this.isDestroyed) return;

        // ----------------------------------------------------
        // Mouse / pen hover
        // ----------------------------------------------------

        if (
            e.pointerType === 'mouse' ||
            e.pointerType === 'pen'
        ) {
            this.mouseX = e.clientX;
            this.mouseY = e.clientY;
            this.hasMousePosition = true;

            return;
        }

        // ----------------------------------------------------
        // Touch movement
        // ----------------------------------------------------

        if (
            e.pointerType === 'touch' &&
            this.isTouching &&
            e.pointerId === this.activePointerId
        ) {
            this.handleTouchMove(e);
        }
    }

    // ========================================================
    // Legacy-compatible mouse handler
    // ========================================================

    handleMouseMove(e) {
        if (this.isDestroyed) return;

        if (this.isInputBlocked()) {
            this.stopMouseRotation();
            return;
        }

        this.mouseX = e.clientX;
        this.mouseY = e.clientY;
        this.hasMousePosition = true;
    }

    // ========================================================
    // Update mouse edge rotation
    // ========================================================

    updateMouseEdgeRotation() {
        const game = this.game;

        if (!game) {
            return;
        }

        if (this.isInputBlocked()) {
            this.stopMouseRotation();
            return;
        }

        if (!this.hasMousePosition) {
            return;
        }

        const screenWidth = window.innerWidth;

        if (screenWidth <= 0) {
            return;
        }

        const edgeThreshold =
            Math.min(
                InputHandler.EDGE_THRESHOLD,
                screenWidth / 3
            );

        const mouseX = this.mouseX;

        // ----------------------------------------------------
        // Left edge
        // ----------------------------------------------------

        if (mouseX < edgeThreshold) {
            game.isRotatingLeft = true;
            game.isRotatingRight = false;

            return;
        }

        // ----------------------------------------------------
        // Right edge
        // ----------------------------------------------------

        if (
            mouseX >
            screenWidth - edgeThreshold
        ) {
            game.isRotatingRight = true;
            game.isRotatingLeft = false;

            return;
        }

        // ----------------------------------------------------
        // Middle
        // ----------------------------------------------------

        this.stopMouseRotation();
    }

    stopMouseRotation() {
        if (!this.game) return;

        this.game.isRotatingLeft = false;
        this.game.isRotatingRight = false;
    }

    // ========================================================
    // Pointer down
    // ========================================================

    handlePointerDown(e) {
        if (this.isDestroyed) return;

        // Only primary touch pointer should control the game.
        if (
            e.pointerType === 'touch' &&
            !e.isPrimary
        ) {
            return;
        }

        // ----------------------------------------------------
        // UI elements must remain interactive
        // ----------------------------------------------------

        if (this.isUIElementTarget(e.target)) {
            return;
        }

        // ----------------------------------------------------
        // Mouse
        // ----------------------------------------------------

        if (e.pointerType === 'mouse') {
            this.mouseX = e.clientX;
            this.mouseY = e.clientY;
            this.hasMousePosition = true;
            return;
        }

        // ----------------------------------------------------
        // Touch
        // ----------------------------------------------------

        if (e.pointerType === 'touch') {
            this.handleTouchStart(e);
        }
    }

    // ========================================================
    // Touch start
    // ========================================================

    handleTouchStart(e) {
        if (this.isDestroyed) return;

        if (this.isInputBlocked()) {
            return;
        }

        // Don't interfere with game UI.
        if (this.isUIElementTarget(e.target)) {
            return;
        }

        // Only one active gesture.
        if (this.isTouching) {
            return;
        }

        // Prevent page scrolling / browser gestures.
        e.preventDefault();

        const touchX = e.clientX;
        const touchY = e.clientY;

        this.touchStartX = touchX;
        this.touchStartY = touchY;

        this.lastTouchX = touchX;
        this.lastTouchY = touchY;

        this.isTouching = true;
        this.activePointerId = e.pointerId;

        this.isHorizontalGesture = false;
        this.pendingTouchDelta = 0;

        // Pointer capture guarantees subsequent pointer
        // events continue to reach the game screen even if
        // the finger leaves the original hit target.
        if (
            this.gameScreen &&
            typeof this.gameScreen.setPointerCapture ===
                'function'
        ) {
            try {
                this.gameScreen.setPointerCapture(
                    e.pointerId
                );
            } catch (error) {
                // Ignore unsupported / invalid pointer capture.
            }
        }
    }

    // ========================================================
    // Touch move
    // ========================================================

    handleTouchMove(e) {
        if (this.isDestroyed) return;

        if (
            !this.isTouching ||
            e.pointerId !== this.activePointerId
        ) {
            return;
        }

        if (this.isInputBlocked()) {
            this.endTouch(e);
            return;
        }

        // Keep UI controls usable.
        if (this.isUIElementTarget(e.target)) {
            return;
        }

        e.preventDefault();

        const currentX = e.clientX;
        const currentY = e.clientY;

        const totalDeltaX =
            currentX - this.touchStartX;

        const totalDeltaY =
            currentY - this.touchStartY;

        // ----------------------------------------------------
        // Gesture classification
        //
        // Don't immediately treat tiny movements as horizontal.
        // Once the gesture clearly becomes horizontal, keep it
        // horizontal for the rest of the gesture.
        // ----------------------------------------------------

        if (!this.isHorizontalGesture) {
            const absX = Math.abs(totalDeltaX);
            const absY = Math.abs(totalDeltaY);

            // Not enough movement to classify yet.
            if (
                absX < 2 &&
                absY < 2
            ) {
                this.lastTouchX = currentX;
                this.lastTouchY = currentY;
                return;
            }

            // Vertical movement wins.
            if (
                absY > InputHandler.TOUCH_VERTICAL_THRESHOLD &&
                absY > absX
            ) {
                this.lastTouchX = currentX;
                this.lastTouchY = currentY;
                return;
            }

            // Horizontal movement wins.
            if (absX > absY) {
                this.isHorizontalGesture = true;
            } else {
                this.lastTouchX = currentX;
                this.lastTouchY = currentY;
                return;
            }
        }

        // ----------------------------------------------------
        // Accumulate movement
        //
        // We DO NOT update the UI directly here.
        // This handler stays intentionally tiny.
        // ----------------------------------------------------

        const deltaX =
            currentX - this.lastTouchX;

        if (deltaX !== 0) {
            this.pendingTouchDelta += deltaX;
        }

        this.lastTouchX = currentX;
        this.lastTouchY = currentY;
    }

    // ========================================================
    // Apply touch movement
    // ========================================================

    applyTouchMovement(deltaX) {
        const game = this.game;

        if (!game || !game.state) {
            return;
        }

        if (
            !game.state.isGameRunning ||
            game.state.cameraOpen
        ) {
            return;
        }

        if (
            typeof game.viewPosition !== 'number'
        ) {
            return;
        }

        // Original behavior:
        // swipe right = view right
        // swipe left = view left
        //
        // Original code used:
        // const movement = -deltaX * 0.002;
        //
        // Preserve that exact direction.
        const movement =
            -deltaX *
            InputHandler.TOUCH_SENSITIVITY;

        let nextPosition =
            game.viewPosition + movement;

        // Clamp to original range.
        if (nextPosition < 0) {
            nextPosition = 0;
        } else if (nextPosition > 1) {
            nextPosition = 1;
        }

        // Avoid unnecessary writes / UI work.
        if (
            nextPosition ===
            game.viewPosition
        ) {
            return;
        }

        game.viewPosition = nextPosition;

        // Update UI once per animation frame instead
        // of once for every touchmove event.
        if (
            game.ui &&
            typeof game.ui.updateViewPosition ===
                'function'
        ) {
            game.ui.updateViewPosition(
                game.viewPosition
            );
        }
    }

    // ========================================================
    // Pointer up
    // ========================================================

    handlePointerUp(e) {
        if (this.isDestroyed) return;

        if (
            e.pointerType === 'touch' &&
            e.pointerId === this.activePointerId
        ) {
            this.handleTouchEnd(e);
        }
    }

    // ========================================================
    // Pointer cancel
    // ========================================================

    handlePointerCancel(e) {
        if (this.isDestroyed) return;

        if (
            e.pointerType === 'touch' &&
            e.pointerId === this.activePointerId
        ) {
            this.endTouch(e);
        }
    }

    // ========================================================
    // Touch end
    // ========================================================

    handleTouchEnd(e) {
        if (this.isDestroyed) return;

        if (
            this.activePointerId !== null &&
            e &&
            typeof e.pointerId === 'number' &&
            e.pointerId !== this.activePointerId
        ) {
            return;
        }

        // Any last tiny movement that arrived before
        // pointerup is applied immediately.
        if (this.pendingTouchDelta !== 0) {
            this.applyTouchMovement(
                this.pendingTouchDelta
            );

            this.pendingTouchDelta = 0;
        }

        this.endTouch(e);
    }

    // ========================================================
    // End touch / reset gesture state
    // ========================================================

    endTouch(e) {
        if (this.gameScreen && e) {
            if (
                typeof this.gameScreen.hasPointerCapture ===
                    'function' &&
                this.gameScreen.hasPointerCapture(
                    e.pointerId
                )
            ) {
                try {
                    this.gameScreen.releasePointerCapture(
                        e.pointerId
                    );
                } catch (error) {
                    // Ignore pointer-capture release errors.
                }
            }
        }

        this.isTouching = false;
        this.activePointerId = null;
        this.isHorizontalGesture = false;

        this.touchStartX = 0;
        this.touchStartY = 0;

        this.lastTouchX = 0;
        this.lastTouchY = 0;

        this.pendingTouchDelta = 0;

        // Touch should never leave mouse-style edge rotation
        // accidentally enabled.
        this.stopMouseRotation();
    }

    // ========================================================
    // Cleanup
    //
    // Call this if the game creates a new InputHandler.
    // ========================================================

    destroy() {
        if (this.isDestroyed) {
            return;
        }

        this.isDestroyed = true;

        // ----------------------------------------------------
        // Stop input animation frame
        // ----------------------------------------------------

        if (this.inputFrameId !== null) {
            cancelAnimationFrame(
                this.inputFrameId
            );

            this.inputFrameId = null;
        }

        // ----------------------------------------------------
        // Remove keyboard
        // ----------------------------------------------------

        document.removeEventListener(
            'keydown',
            this.boundHandleKeyPress
        );

        // ----------------------------------------------------
        // Remove pointer events
        // ----------------------------------------------------

        if (this.gameScreen) {
            this.gameScreen.removeEventListener(
                'pointermove',
                this.boundHandlePointerMove
            );

            this.gameScreen.removeEventListener(
                'pointerdown',
                this.boundHandlePointerDown
            );

            this.gameScreen.removeEventListener(
                'pointerup',
                this.boundHandlePointerUp
            );

            this.gameScreen.removeEventListener(
                'pointercancel',
                this.boundHandlePointerCancel
            );

            // Restore previous touch-action value.
            this.gameScreen.style.touchAction =
                this.previousTouchAction || '';
        }

        // ----------------------------------------------------
        // Clear cheat notification timer
        // ----------------------------------------------------

        if (
            this.cheatNotificationTimeout !== null
        ) {
            clearTimeout(
                this.cheatNotificationTimeout
            );

            this.cheatNotificationTimeout = null;
        }

        // ----------------------------------------------------
        // Remove notification element
        // ----------------------------------------------------

        if (
            this.cheatNotification &&
            this.cheatNotification.parentNode
        ) {
            this.cheatNotification.parentNode.removeChild(
                this.cheatNotification
            );
        }

        this.cheatNotification = null;

        // ----------------------------------------------------
        // Stop rotation
        // ----------------------------------------------------

        this.stopMouseRotation();

        // ----------------------------------------------------
        // Clear references
        // ----------------------------------------------------

        this.gameScreen = null;
        this.game = null;
    }
}
