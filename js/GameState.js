// ============================================================
// EFRAIN'S HOUSE — ULTRA GAME STATE
// Lightweight, validated, allocation-friendly game state.
// ============================================================

class GameState {

    constructor() {

        /*
         * --------------------------------------------------------
         * CORE NIGHT STATE
         * --------------------------------------------------------
         */

        this.currentNight = 1;

        /*
         * Current normal version has Nights 1–5.
         * Night 6 is the special night.
         */
        this.maxNights = 5;

        /*
         * 0 = 12 AM
         * 1 = 1 AM
         * ...
         * 6 = 6 AM
         */
        this.currentTime = 0;

        /*
         * Oxygen replaces traditional FNaF power.
         */
        this.oxygen = 100;

        /*
         * Main simulation switch.
         */
        this.isGameRunning = false;

        /*
         * UI/tutorial state.
         */
        this.tutorialActive = false;

        /*
         * Current scene.
         */
        this.currentScene = 'office';

        /*
         * Camera state.
         */
        this.cameraOpen = false;
        this.currentCam = 'cam11';
        this.cameraFailed = false;
        this.cameraRestarting = false;

        /*
         * Vent state.
         */
        this.ventsClosed = false;
        this.ventsToggling = false;

        /*
         * Control panel lock.
         */
        this.controlPanelBusy = false;

        /*
         * --------------------------------------------------------
         * PERFORMANCE FLAGS
         * --------------------------------------------------------
         *
         * These are deliberately simple booleans.
         * Reading them is extremely cheap.
         */

        this.pageHidden = false;

        this.isTransitioning = false;

        this.gameOver = false;

        /*
         * Used by optimized rendering systems to avoid doing
         * unnecessary work while the player cannot see it.
         */

        this.visualsDirty = true;

        this.uiDirty = true;

        this.cameraDirty = true;

        /*
         * Used by input / animation systems.
         */

        this.inputLocked = false;

        this.animationBusy = false;
    }

    // ========================================================
    // RESET
    // ========================================================

    reset() {

        /*
         * Keep currentNight intact.
         *
         * This is important because Game.initGame() sets the
         * desired night before calling state.reset().
         */

        this.currentTime = 0;

        this.oxygen = 100;

        this.isGameRunning = true;

        this.tutorialActive = false;

        this.currentScene = 'office';

        this.cameraOpen = false;

        this.ventsClosed = false;

        this.ventsToggling = false;

        this.currentCam = 'cam11';

        this.cameraFailed = false;

        this.cameraRestarting = false;

        this.controlPanelBusy = false;

        /*
         * Performance state.
         */

        this.pageHidden =
            document.hidden;

        this.isTransitioning = false;

        this.gameOver = false;

        this.visualsDirty = true;

        this.uiDirty = true;

        this.cameraDirty = true;

        this.inputLocked = false;

        this.animationBusy = false;
    }

    // ========================================================
    // NIGHT HELPERS
    // ========================================================

    isSpecialNight() {

        return (
            this.currentNight > this.maxNights
        );
    }

    isNormalNight() {

        return (
            this.currentNight >= 1 &&
            this.currentNight <= this.maxNights
        );
    }

    isNight(number) {

        return (
            this.currentNight === number
        );
    }

    // ========================================================
    // TIME HELPERS
    // ========================================================

    isAtMorning() {

        return (
            this.currentTime >= 6
        );
    }

    isAfter4AM() {

        return (
            this.currentTime >= 4
        );
    }

    isAfter5AM() {

        return (
            this.currentTime >= 5
        );
    }

    getHour() {

        return this.currentTime;
    }

    // ========================================================
    // OXYGEN HELPERS
    // ========================================================

    setOxygen(value) {

        /*
         * Clamp once here so every system receives a valid value.
         */

        const next =
            Number.isFinite(value)
                ? value
                : 0;

        const clamped =
            Math.max(
                0,
                Math.min(
                    100,
                    next
                )
            );

        if (
            this.oxygen !== clamped
        ) {

            this.oxygen =
                clamped;

            this.uiDirty =
                true;
        }

        return this.oxygen;
    }

    addOxygen(amount) {

        return this.setOxygen(
            this.oxygen + amount
        );
    }

    removeOxygen(amount) {

        return this.setOxygen(
            this.oxygen - amount
        );
    }

    hasOxygen() {

        return (
            this.oxygen > 0
        );
    }

    isOxygenCritical() {

        return (
            this.oxygen <= 20
        );
    }

    // ========================================================
    // CAMERA HELPERS
    // ========================================================

    setCamera(cam) {

        if (
            typeof cam !== 'string'
        ) {

            return false;
        }

        /*
         * Prevent pointless writes.
         */

        if (
            this.currentCam === cam
        ) {

            return false;
        }

        this.currentCam =
            cam;

        this.cameraDirty =
            true;

        this.visualsDirty =
            true;

        return true;
    }

    openCamera() {

        if (
            this.cameraFailed
        ) {

            return false;
        }

        if (
            this.cameraOpen
        ) {

            return false;
        }

        this.cameraOpen =
            true;

        this.cameraDirty =
            true;

        this.visualsDirty =
            true;

        return true;
    }

    closeCamera() {

        if (
            !this.cameraOpen
        ) {

            return false;
        }

        this.cameraOpen =
            false;

        this.cameraDirty =
            true;

        this.visualsDirty =
            true;

        return true;
    }

    failCamera() {

        this.cameraFailed =
            true;

        this.cameraDirty =
            true;

        this.visualsDirty =
            true;
    }

    repairCamera() {

        this.cameraFailed =
            false;

        this.cameraRestarting =
            false;

        this.cameraDirty =
            true;

        this.visualsDirty =
            true;
    }

    // ========================================================
    // VENT HELPERS
    // ========================================================

    beginVentToggle() {

        if (
            this.ventsToggling ||
            this.controlPanelBusy
        ) {

            return false;
        }

        this.ventsToggling =
            true;

        this.controlPanelBusy =
            true;

        this.uiDirty =
            true;

        this.visualsDirty =
            true;

        return true;
    }

    finishVentToggle(
        closed
    ) {

        this.ventsClosed =
            Boolean(closed);

        this.ventsToggling =
            false;

        this.controlPanelBusy =
            false;

        this.uiDirty =
            true;

        this.visualsDirty =
            true;
    }

    // ========================================================
    // CONTROL PANEL
    // ========================================================

    lockControls() {

        this.controlPanelBusy =
            true;

        this.inputLocked =
            true;
    }

    unlockControls() {

        this.controlPanelBusy =
            false;

        this.inputLocked =
            false;
    }

    // ========================================================
    // TRANSITION STATE
    // ========================================================

    beginTransition() {

        this.isTransitioning =
            true;

        this.animationBusy =
            true;

        this.visualsDirty =
            true;
    }

    endTransition() {

        this.isTransitioning =
            false;

        this.animationBusy =
            false;

        this.visualsDirty =
            true;
    }

    // ========================================================
    // GAME FLOW
    // ========================================================

    start() {

        this.isGameRunning =
            true;

        this.gameOver =
            false;

        this.inputLocked =
            false;

        this.visualsDirty =
            true;

        this.uiDirty =
            true;
    }

    stop() {

        this.isGameRunning =
            false;

        this.inputLocked =
            true;

        this.animationBusy =
            false;
    }

    endGame() {

        this.isGameRunning =
            false;

        this.gameOver =
            true;

        this.inputLocked =
            true;

        this.animationBusy =
            false;

        this.visualsDirty =
            true;

        this.uiDirty =
            true;
    }

    // ========================================================
    // PAGE VISIBILITY
    // ========================================================

    setPageHidden(hidden) {

        const next =
            Boolean(hidden);

        /*
         * Avoid unnecessary writes.
         */

        if (
            this.pageHidden === next
        ) {

            return false;
        }

        this.pageHidden =
            next;

        this.visualsDirty =
            true;

        return true;
    }

    // ========================================================
    // DIRTY FLAGS
    // ========================================================

    markUIReady() {

        this.uiDirty =
            false;
    }

    markCameraReady() {

        this.cameraDirty =
            false;
    }

    markVisualsReady() {

        this.visualsDirty =
            false;
    }

    markUIChanged() {

        this.uiDirty =
            true;
    }

    markCameraChanged() {

        this.cameraDirty =
            true;
    }

    markVisualsChanged() {

        this.visualsDirty =
            true;
    }

    // ========================================================
    // QUICK STATUS CHECKS
    // ========================================================

    canUpdateGameplay() {

        return (
            this.isGameRunning &&
            !this.gameOver &&
            !this.pageHidden
        );
    }

    canUpdateCamera() {

        return (
            this.isGameRunning &&
            !this.gameOver &&
            this.cameraOpen &&
            !this.cameraFailed &&
            !this.pageHidden
        );
    }

    canAcceptInput() {

        return (
            this.isGameRunning &&
            !this.gameOver &&
            !this.inputLocked &&
            !this.controlPanelBusy &&
            !this.pageHidden
        );
    }
}
