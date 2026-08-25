// ============================================================================
// GameState - Centralized, fast, predictable game-state management
// Preserves the original public properties and reset() API.
// ============================================================================

class GameState {
    constructor() {
        // --------------------------------------------------------------------
        // Core progression
        // --------------------------------------------------------------------
        this.currentNight = 1;
        this.maxNights = 5; // Night 1-5; Night 6 remains a special level.
        this.currentTime = 0; // 0-6 (12 AM -> 6 AM)

        // --------------------------------------------------------------------
        // Resources
        // --------------------------------------------------------------------
        this.oxygen = 100; // Oxygen replaces power.

        // --------------------------------------------------------------------
        // Game/UI state
        // --------------------------------------------------------------------
        this.isGameRunning = false;
        this.tutorialActive = false;
        this.currentScene = 'office';

        // --------------------------------------------------------------------
        // Camera state
        // --------------------------------------------------------------------
        this.cameraOpen = false;
        this.currentCam = 'cam11';
        this.cameraFailed = false;
        this.cameraRestarting = false;

        // --------------------------------------------------------------------
        // Vent state
        // --------------------------------------------------------------------
        this.ventsClosed = false;
        this.ventsToggling = false;

        // --------------------------------------------------------------------
        // Control panel state
        // --------------------------------------------------------------------
        this.controlPanelBusy = false;

        // --------------------------------------------------------------------
        // Lightweight internal bookkeeping.
        // These are additive and do not replace any original public state.
        // --------------------------------------------------------------------
        this._resetVersion = 0;
        this._lastResetAt = 0;
    }

    /**
     * Reset the per-night runtime state.
     *
     * Important:
     * - currentNight is intentionally preserved.
     * - maxNights is intentionally preserved.
     * - All original runtime defaults remain identical.
     * - A reset version is incremented so async systems can detect stale work.
     */
    reset() {
        this.currentTime = 0;
        this.oxygen = 100;
        this.isGameRunning = true;
        this.tutorialActive = false;
        this.currentScene = 'office';

        this.cameraOpen = false;
        this.currentCam = 'cam11';
        this.cameraFailed = false;
        this.cameraRestarting = false;

        this.ventsClosed = false;
        this.ventsToggling = false;

        this.controlPanelBusy = false;

        // Internal generation counter for safe async/timer coordination.
        this._resetVersion++;
        this._lastResetAt = performance.now ? performance.now() : Date.now();
    }

    /**
     * Return an immutable snapshot of the important runtime state.
     * Useful for debugging/UI without exposing the original state object.
     */
    getSnapshot() {
        return {
            currentNight: this.currentNight,
            maxNights: this.maxNights,
            currentTime: this.currentTime,
            oxygen: this.oxygen,
            isGameRunning: this.isGameRunning,
            tutorialActive: this.tutorialActive,
            currentScene: this.currentScene,
            cameraOpen: this.cameraOpen,
            ventsClosed: this.ventsClosed,
            ventsToggling: this.ventsToggling,
            currentCam: this.currentCam,
            cameraFailed: this.cameraFailed,
            cameraRestarting: this.cameraRestarting,
            controlPanelBusy: this.controlPanelBusy
        };
    }

    /**
     * Check whether a previously captured reset generation is still current.
     * This is useful for delayed cutscenes, animations, and callbacks.
     */
    isGenerationCurrent(generation) {
        return generation === this._resetVersion;
    }

    /**
     * Return the current reset generation.
     */
    getGeneration() {
        return this._resetVersion;
    }

    /**
     * Clamp and set oxygen safely.
     * Keeps oxygen in the same 0-100 range used by the original controller.
     */
    setOxygen(value) {
        const next = Number(value);

        if (!Number.isFinite(next)) {
            return this.oxygen;
        }

        this.oxygen = Math.max(0, Math.min(100, next));
        return this.oxygen;
    }

    /**
     * Change oxygen by a delta while preserving the same 0-100 limits.
     */
    changeOxygen(delta) {
        const amount = Number(delta);

        if (!Number.isFinite(amount)) {
            return this.oxygen;
        }

        return this.setOxygen(this.oxygen + amount);
    }

    /**
     * Advance the in-game hour while keeping it in the expected range.
     * The original game uses 0-6.
     */
    advanceTime(amount = 1) {
        const step = Number(amount);

        if (!Number.isFinite(step)) {
            return this.currentTime;
        }

        this.currentTime = Math.max(0, Math.min(6, this.currentTime + step));
        return this.currentTime;
    }

    /**
     * Explicitly set the current camera.
     * Invalid/empty values are ignored.
     */
    setCamera(cameraName) {
        if (typeof cameraName !== 'string' || cameraName.length === 0) {
            return this.currentCam;
        }

        this.currentCam = cameraName;
        return this.currentCam;
    }

    /**
     * Mark whether the camera is open.
     */
    setCameraOpen(isOpen) {
        this.cameraOpen = Boolean(isOpen);
        return this.cameraOpen;
    }

    /**
     * Mark whether the vents are closed.
     */
    setVentsClosed(isClosed) {
        this.ventsClosed = Boolean(isClosed);
        return this.ventsClosed;
    }

    /**
     * Toggle vent state synchronously.
     * The controller can still handle animated/toggling states separately.
     */
    toggleVentsState() {
        this.ventsClosed = !this.ventsClosed;
        return this.ventsClosed;
    }

    /**
     * Mark the runtime as stopped.
     * Provided as a convenience for systems that only own GameState.
     */
    stop() {
        this.isGameRunning = false;
    }

    /**
     * Mark the runtime as running.
     */
    start() {
        this.isGameRunning = true;
    }
}
