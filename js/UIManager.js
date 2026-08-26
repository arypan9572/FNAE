// ============================================================
// UI Manager
// Optimized for:
// - Low CPU / DOM overhead
// - Cached DOM references
// - Fewer redundant style / text updates
// - Reusable timers and animations
// - No document click-listener leaks
// - No repeated interval creation for camera restarts
// - Preserved public method names and game behavior
// ============================================================

class UIManager {
    constructor(game) {
        this.game = game;

        // ----------------------------------------------------
        // Cached DOM references
        // ----------------------------------------------------

        this.powerValue = null;
        this.timeValue = null;
        this.nightValue = null;
        this.currentSceneImg = null;

        this.hotspotsContainer = null;
        this.ventsBtn = null;
        this.cameraBtn = null;
        this.controlPanelPopup = null;
        this.controlOptions = null;

        this.optionVents = null;
        this.optionCameras = null;

        this.ventsDots = null;
        this.cameraDots = null;
        this.cameraStatus = null;

        this.tooltip = null;

        // ----------------------------------------------------
        // Cached state
        // ----------------------------------------------------

        this.lastOxygen = null;
        this.lastTime = null;
        this.lastNight = null;
        this.lastCameraOpen = null;
        this.lastVentsWarning = null;

        this.lastViewPosition = null;
        this.lastVentsHotspotVisible = null;
        this.lastCameraHotspotVisible = null;

        this.lastSelectedControlOption = null;
        this.lastVentsText = null;

        this.lastCameraRestarting = null;
        this.lastCameraFailed = null;

        this.lastCameraArrowState = null;
        this.lastControlArrowState = null;

        // ----------------------------------------------------
        // Timer / animation management
        // ----------------------------------------------------

        this.cameraRestartInterval = null;
        this.controlPanelArrowTimeout = null;
        this.cameraButtonArrowTimeout = null;

        this.loadingDotAnimations = new WeakMap();

        // ----------------------------------------------------
        // Stable bound handlers
        // ----------------------------------------------------

        this.boundHandleDocumentClick =
            this.handleDocumentClick.bind(this);

        // ----------------------------------------------------
        // Initialize
        // ----------------------------------------------------

        this.initElements();
        this.bindDocumentEvents();
    }

    // ========================================================
    // DOM initialization
    // ========================================================

    initElements() {
        this.powerValue =
            document.getElementById('power-value');

        this.timeValue =
            document.getElementById('time-value');

        this.nightValue =
            document.getElementById('night-value');

        this.currentSceneImg =
            document.getElementById('current-scene');

        this.hotspotsContainer =
            document.getElementById('hotspots');

        this.cacheExistingDynamicElements();
    }

    cacheExistingDynamicElements() {
        this.ventsBtn =
            document.getElementById('vents-btn');

        this.cameraBtn =
            document.getElementById('camera-btn');

        this.controlPanelPopup =
            document.getElementById(
                'control-panel-popup'
            );

        if (this.controlPanelPopup) {
            this.cacheControlPanelElements(
                this.controlPanelPopup
            );
        }

        this.tooltip =
            document.getElementById('game-tooltip');
    }

    cacheControlPanelElements(popup) {
        if (!popup) return;

        this.controlPanelPopup = popup;

        this.controlOptions =
            popup.querySelector('#control-options');

        this.optionVents =
            popup.querySelector('#option-vents');

        this.optionCameras =
            popup.querySelector('#option-cameras');

        this.ventsDots =
            popup.querySelector('#vents-dots');

        this.cameraDots =
            popup.querySelector('#camera-dots');

        this.cameraStatus =
            popup.querySelector('#camera-status');
    }

    bindDocumentEvents() {
        // One global listener, rather than adding another
        // document click listener every time the popup is made.
        document.addEventListener(
            'click',
            this.boundHandleDocumentClick
        );
    }

    // ========================================================
    // Main UI update
    // ========================================================

    update() {
        if (!this.game || !this.game.state) {
            return;
        }

        const state = this.game.state;

        // ----------------------------------------------------
        // Power / oxygen
        // ----------------------------------------------------

        const oxygen = Math.floor(
            Number(state.oxygen) || 0
        );

        if (
            this.powerValue &&
            oxygen !== this.lastOxygen
        ) {
            this.powerValue.textContent = oxygen;
            this.lastOxygen = oxygen;
        }

        // ----------------------------------------------------
        // Time
        // ----------------------------------------------------

        const currentTime =
            state.currentTime === 0
                ? 12
                : state.currentTime;

        const timeText =
            `${currentTime} AM`;

        if (
            this.timeValue &&
            timeText !== this.lastTime
        ) {
            this.timeValue.textContent = timeText;
            this.lastTime = timeText;
        }

        // ----------------------------------------------------
        // Night
        // ----------------------------------------------------

        const nightText =
            String(state.currentNight);

        if (
            this.nightValue &&
            nightText !== this.lastNight
        ) {
            this.nightValue.textContent = nightText;
            this.lastNight = nightText;
        }

        // ----------------------------------------------------
        // Scene image
        //
        // Only touch the image when the camera is closed,
        // and only assign src when it actually changed.
        // ----------------------------------------------------

        if (!state.cameraOpen) {
            this.updateOfficeScene();
        }

        // ----------------------------------------------------
        // Oxygen warning
        // ----------------------------------------------------

        const warningActive =
            state.oxygen <= 40 &&
            state.ventsClosed;

        if (
            this.powerValue &&
            warningActive !== this.lastVentsWarning
        ) {
            this.powerValue.classList.toggle(
                'flicker',
                warningActive
            );

            this.lastVentsWarning =
                warningActive;
        }

        // ----------------------------------------------------
        // Camera status
        // ----------------------------------------------------

        this.updateCameraStatus();
    }

    updateOfficeScene() {
        if (!this.currentSceneImg) {
            return;
        }

        const images =
            this.game.assets &&
            this.game.assets.images;

        const sceneImage =
            images && images.office;

        if (!sceneImage) {
            return;
        }

        if (
            this.currentSceneImg.src !==
            sceneImage.src
        ) {
            this.currentSceneImg.src =
                sceneImage.src;
        }

        if (
            this.currentSceneImg.style.display !==
            'block'
        ) {
            this.currentSceneImg.style.display =
                'block';
        }
    }

    // ========================================================
    // Hotspots
    // ========================================================

    createHotspots() {
        const hotspotsContainer =
            this.getHotspotsContainer();

        if (!hotspotsContainer) {
            return;
        }

        // Clear existing generated hotspot buttons.
        hotspotsContainer.replaceChildren();

        // Reset cached references.
        this.ventsBtn = null;
        this.cameraBtn = null;

        // Create controls.
        this.createControlPanelButton();
        this.createCameraButton();

        // Close camera button was intentionally removed in
        // the original implementation.
        this.bindCloseCameraButton();
    }

    getHotspotsContainer() {
        if (
            this.hotspotsContainer &&
            this.hotspotsContainer.isConnected
        ) {
            return this.hotspotsContainer;
        }

        this.hotspotsContainer =
            document.getElementById('hotspots');

        return this.hotspotsContainer;
    }

    // ========================================================
    // Control panel button
    // ========================================================

    createControlPanelButton() {
        const hotspotsContainer =
            this.getHotspotsContainer();

        if (!hotspotsContainer) {
            return;
        }

        const controlBtn =
            document.createElement('div');

        controlBtn.id = 'vents-btn';
        controlBtn.className =
            'control-panel-button';

        Object.assign(controlBtn.style, {
            position: 'absolute',
            left: '0',
            bottom: '0',
            width: '25vw',
            height: '10vh',
            background: 'rgba(0, 0, 0, 0.7)',
            border: '2px solid rgba(255, 255, 255, 0.3)',
            borderLeft: 'none',
            borderBottom: 'none',
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            opacity: '0',
            transition: 'opacity 0.3s, background 0.3s',
            padding: '0 1.5vw',
            pointerEvents: 'none'
        });

        // ----------------------------------------------------
        // Left arrows
        // ----------------------------------------------------

        const leftArrows =
            this.createArrowGroup(
                'horizontal',
                '▲',
                2,
                0.8
            );

        controlBtn.appendChild(leftArrows);

        // ----------------------------------------------------
        // Text
        // ----------------------------------------------------

        const text =
            document.createElement('div');

        text.textContent =
            'CONTROL PANEL';

        Object.assign(text.style, {
            color: '#fff',
            fontSize: '1.8vw',
            fontWeight: 'bold',
            fontFamily: 'Arial, sans-serif',
            letterSpacing: '0.15vw',
            whiteSpace: 'nowrap',
            flex: '1',
            textAlign: 'center'
        });

        controlBtn.appendChild(text);

        // ----------------------------------------------------
        // Right arrows
        // ----------------------------------------------------

        const rightArrows =
            this.createArrowGroup(
                'horizontal',
                '▲',
                2,
                0.8
            );

        controlBtn.appendChild(rightArrows);

        // ----------------------------------------------------
        // Hover
        // ----------------------------------------------------

        controlBtn.addEventListener(
            'mouseenter',
            () => {
                controlBtn.style.background =
                    'rgba(0, 0, 0, 0.9)';
            }
        );

        controlBtn.addEventListener(
            'mouseleave',
            () => {
                controlBtn.style.background =
                    'rgba(0, 0, 0, 0.7)';
            }
        );

        // ----------------------------------------------------
        // Click
        // ----------------------------------------------------

        controlBtn.addEventListener(
            'click',
            () => {
                this.toggleControlPanel();

                if (
                    this.controlPanelArrowTimeout !==
                    null
                ) {
                    clearTimeout(
                        this.controlPanelArrowTimeout
                    );
                }

                this.controlPanelArrowTimeout =
                    setTimeout(() => {
                        this.controlPanelArrowTimeout =
                            null;

                        this.updateControlPanelArrows();
                    }, 50);
            }
        );

        hotspotsContainer.appendChild(
            controlBtn
        );

        this.ventsBtn = controlBtn;
    }

    createArrowGroup(
        direction,
        symbol,
        count,
        gap
    ) {
        const group =
            document.createElement('div');

        group.className =
            'control-arrows';

        if (direction === 'vertical') {
            Object.assign(group.style, {
                display: 'flex',
                flexDirection: 'column',
                gap: `${gap}vh`
            });
        } else {
            Object.assign(group.style, {
                display: 'flex',
                gap: `${gap}vw`,
                flexShrink: '0'
            });
        }

        for (let i = 0; i < count; i++) {
            const arrow =
                document.createElement('div');

            arrow.textContent = symbol;

            Object.assign(arrow.style, {
                color: '#fff',
                fontSize: '2vw',
                lineHeight: '1'
            });

            group.appendChild(arrow);
        }

        return group;
    }

    // ========================================================
    // Control panel arrows
    // ========================================================

    updateControlPanelArrows() {
        const controlBtn =
            this.ventsBtn &&
            this.ventsBtn.isConnected
                ? this.ventsBtn
                : document.getElementById(
                    'vents-btn'
                );

        if (!controlBtn) {
            return;
        }

        this.ventsBtn = controlBtn;

        const panel =
            this.controlPanelPopup &&
            this.controlPanelPopup.isConnected
                ? this.controlPanelPopup
                : document.getElementById(
                    'control-panel-popup'
                );

        if (!panel) {
            return;
        }

        this.controlPanelPopup = panel;

        const isOpen =
            !panel.classList.contains(
                'hidden'
            );

        // Avoid rewriting arrow text unless state changed.
        if (
            isOpen ===
            this.lastControlArrowState
        ) {
            return;
        }

        this.lastControlArrowState =
            isOpen;

        const arrows =
            controlBtn.querySelectorAll(
                '.control-arrows div'
            );

        const symbol =
            isOpen
                ? '▼'
                : '▲';

        arrows.forEach((arrow) => {
            if (arrow.textContent !== symbol) {
                arrow.textContent = symbol;
            }
        });
    }

    // ========================================================
    // Toggle control panel
    // ========================================================

    toggleControlPanel() {
        if (!this.game || !this.game.state) {
            return;
        }

        let panel =
            this.controlPanelPopup &&
            this.controlPanelPopup.isConnected
                ? this.controlPanelPopup
                : document.getElementById(
                    'control-panel-popup'
                );

        // ----------------------------------------------------
        // Create popup if it doesn't exist
        // ----------------------------------------------------

        if (!panel) {
            this.createControlPanelPopup();

            panel =
                this.controlPanelPopup;

            this.game.isRotatingLeft =
                false;

            this.game.isRotatingRight =
                false;

            this.game.state.controlPanelOpen =
                true;

            this.updateControlPanelArrows();

            return;
        }

        this.controlPanelPopup = panel;

        const wasHidden =
            panel.classList.contains(
                'hidden'
            );

        // ----------------------------------------------------
        // Prevent closing while busy
        // ----------------------------------------------------

        if (
            !wasHidden &&
            this.game.state.controlPanelBusy
        ) {
            return;
        }

        // ----------------------------------------------------
        // Toggle
        // ----------------------------------------------------

        panel.classList.toggle(
            'hidden'
        );

        if (wasHidden) {
            // Open panel
            this.game.isRotatingLeft =
                false;

            this.game.isRotatingRight =
                false;

            this.game.state.controlPanelOpen =
                true;
        } else {
            // Close panel
            this.game.state.controlPanelOpen =
                false;
        }

        this.lastControlArrowState =
            null;

        this.updateControlPanelArrows();
    }

    // ========================================================
    // Create control panel popup
    // ========================================================

    createControlPanelPopup() {
        // Reuse existing popup if it exists.
        const existing =
            document.getElementById(
                'control-panel-popup'
            );

        if (existing) {
            this.controlPanelPopup =
                existing;

            this.cacheControlPanelElements(
                existing
            );

            return existing;
        }

        const popup =
            document.createElement('div');

        popup.id =
            'control-panel-popup';

        Object.assign(popup.style, {
            position: 'fixed',
            top: '10vh',
            left: '10vw',
            width: '70vw',
            minHeight: '60vh',
            background: '#000',
            border: '4px solid #0f0',
            padding: '4vh 4vw',
            zIndex: '100',
            fontFamily: "'Courier New', monospace",
            color: '#0f0'
        });

        // ----------------------------------------------------
        // Title
        // ----------------------------------------------------

        const title =
            document.createElement('div');

        title.textContent =
            '/// Control Panel';

        Object.assign(title.style, {
            fontSize: '2.5vw',
            fontWeight: 'bold',
            marginBottom: '5vh'
        });

        popup.appendChild(title);

        // ----------------------------------------------------
        // Options container
        // ----------------------------------------------------

        const optionsContainer =
            document.createElement('div');

        optionsContainer.id =
            'control-options';

        // ----------------------------------------------------
        // Option 1: Air Vents
        // ----------------------------------------------------

        const option1 =
            document.createElement('div');

        option1.id =
            'option-vents';

        Object.assign(option1.style, {
            fontSize: '2.5vw',
            marginBottom: '4vh',
            cursor: 'pointer',
            padding: '1.5vh 0',
            display: 'flex',
            alignItems: 'center',
            direction: 'ltr'
        });

        const ventsArrow =
            this.createOptionArrow();

        const ventsText =
            document.createElement('span');

        ventsText.className =
            'option-label';

        const ventsDots =
            document.createElement('span');

        ventsDots.id =
            'vents-dots';

        Object.assign(ventsDots.style, {
            marginLeft: '1vw',
            direction: 'ltr',
            fontFamily:
                "'Courier New', monospace"
        });

        option1.appendChild(
            ventsArrow
        );

        option1.appendChild(
            ventsText
        );

        option1.appendChild(
            ventsDots
        );

        option1.addEventListener(
            'click',
            () => {
                this.game.toggleVents();
                // Game logic updates the UI afterward.
            }
        );

        optionsContainer.appendChild(
            option1
        );

        // ----------------------------------------------------
        // Option 2: Restart Cameras
        // ----------------------------------------------------

        const option2 =
            document.createElement('div');

        option2.id =
            'option-cameras';

        Object.assign(option2.style, {
            fontSize: '2.5vw',
            cursor: 'pointer',
            padding: '1.5vh 0',
            display: 'flex',
            alignItems: 'center',
            direction: 'ltr'
        });

        const camerasArrow =
            this.createOptionArrow();

        // Camera option is not selected initially.
        camerasArrow.style.color =
            'transparent';

        const camerasText =
            document.createElement('span');

        camerasText.className =
            'option-label';

        camerasText.textContent =
            'Restart Cameras';

        const cameraDots =
            document.createElement('span');

        cameraDots.id =
            'camera-dots';

        Object.assign(cameraDots.style, {
            marginLeft: '1vw',
            direction: 'ltr',
            fontFamily:
                "'Courier New', monospace"
        });

        const cameraStatus =
            document.createElement('span');

        cameraStatus.id =
            'camera-status';

        Object.assign(cameraStatus.style, {
            marginLeft: 'auto',
            paddingRight: '2vw',
            direction: 'ltr'
        });

        option2.appendChild(
            camerasArrow
        );

        option2.appendChild(
            camerasText
        );

        option2.appendChild(
            cameraDots
        );

        option2.appendChild(
            cameraStatus
        );

        option2.addEventListener(
            'click',
            () => {
                this.selectControlOption(
                    'cameras'
                );

                this.handleRestartCamera();
            }
        );

        optionsContainer.appendChild(
            option2
        );

        popup.appendChild(
            optionsContainer
        );

        document.body.appendChild(
            popup
        );

        // Cache everything.
        this.cacheControlPanelElements(
            popup
        );

        // Set initial values.
        this.selectControlOption(
            'vents'
        );

        this.updateControlPanelOptions();

        return popup;
    }

    createOptionArrow() {
        const arrow =
            document.createElement('span');

        arrow.className =
            'option-arrow';

        arrow.textContent =
            '>';

        Object.assign(arrow.style, {
            color: '#0f0',
            marginRight: '1.5vw',
            width: '2vw'
        });

        return arrow;
    }

    // ========================================================
    // Global click handler
    // ========================================================

    handleDocumentClick(e) {
        const popup =
            this.controlPanelPopup &&
            this.controlPanelPopup.isConnected
                ? this.controlPanelPopup
                : document.getElementById(
                    'control-panel-popup'
                );

        if (!popup) {
            return;
        }

        this.controlPanelPopup = popup;

        const target = e.target;

        const clickedVentsButton =
            target &&
            (
                target.id === 'vents-btn' ||
                (
                    target.closest &&
                    target.closest('#vents-btn')
                )
            );

        if (
            popup.contains(target) ||
            clickedVentsButton
        ) {
            return;
        }

        if (
            this.game.state.controlPanelBusy
        ) {
            return;
        }

        popup.classList.add('hidden');

        this.game.state.controlPanelOpen =
            false;

        this.lastControlArrowState =
            null;

        this.updateControlPanelArrows();
    }

    // ========================================================
    // Select control option
    // ========================================================

    selectControlOption(option) {
        const option1 =
            this.optionVents &&
            this.optionVents.isConnected
                ? this.optionVents
                : document.getElementById(
                    'option-vents'
                );

        const option2 =
            this.optionCameras &&
            this.optionCameras.isConnected
                ? this.optionCameras
                : document.getElementById(
                    'option-cameras'
                );

        if (!option1 || !option2) {
            return;
        }

        this.optionVents = option1;
        this.optionCameras = option2;

        // ----------------------------------------------------
        // Vents selected
        // ----------------------------------------------------

        if (option === 'vents') {
            const arrow1 =
                option1.querySelector(
                    '.option-arrow'
                );

            const arrow2 =
                option2.querySelector(
                    '.option-arrow'
                );

            if (arrow1) {
                arrow1.style.color =
                    '#0f0';
            }

            if (arrow2) {
                arrow2.style.color =
                    'transparent';
            }

            const text1 =
                option1.querySelector(
                    '.option-label'
                );

            if (text1) {
                const newText =
                    this.game.state.ventsClosed
                        ? 'Open Air Vents'
                        : 'Close Air Vents';

                if (
                    text1.textContent !==
                    newText
                ) {
                    text1.textContent =
                        newText;
                }

                this.lastVentsText =
                    newText;
            }

            this.lastSelectedControlOption =
                'vents';

            return;
        }

        // ----------------------------------------------------
        // Cameras selected
        // ----------------------------------------------------

        const arrow1 =
            option1.querySelector(
                '.option-arrow'
            );

        const arrow2 =
            option2.querySelector(
                '.option-arrow'
            );

        if (arrow1) {
            arrow1.style.color =
                'transparent';
        }

        if (arrow2) {
            arrow2.style.color =
                '#0f0';
        }

        this.lastSelectedControlOption =
            'cameras';
    }

    // ========================================================
    // Update control panel
    // ========================================================

    updateControlPanelOptions() {
        this.selectControlOption(
            'vents'
        );

        this.updateCameraStatus();
        this.updateVentsStatus();
    }

    // ========================================================
    // Vents status
    // ========================================================

    updateVentsStatus() {
        const dotsSpan =
            this.ventsDots &&
            this.ventsDots.isConnected
                ? this.ventsDots
                : document.getElementById(
                    'vents-dots'
                );

        if (!dotsSpan) {
            return;
        }

        this.ventsDots =
            dotsSpan;

        if (
            this.game.state.ventsToggling
        ) {
            // Ensure green color.
            if (
                dotsSpan.style.color !==
                '#0f0'
            ) {
                dotsSpan.style.color =
                    '#0f0';
            }

            if (
                !dotsSpan.dataset.animating
            ) {
                dotsSpan.dataset.animating =
                    'true';

                this.animateLoadingDots(
                    dotsSpan
                );
            }
        } else {
            this.stopLoadingDots(
                dotsSpan
            );
        }
    }

    // ========================================================
    // Camera status
    // ========================================================

    updateCameraStatus() {
        const statusSpan =
            this.cameraStatus &&
            this.cameraStatus.isConnected
                ? this.cameraStatus
                : document.getElementById(
                    'camera-status'
                );

        if (!statusSpan) {
            return;
        }

        this.cameraStatus =
            statusSpan;

        const dotsSpan =
            this.cameraDots &&
            this.cameraDots.isConnected
                ? this.cameraDots
                : document.getElementById(
                    'camera-dots'
                );

        this.cameraDots =
            dotsSpan;

        const restarting =
            !!this.game.state.cameraRestarting;

        const failed =
            !!this.game.state.cameraFailed;

        // ----------------------------------------------------
        // Restarting
        // ----------------------------------------------------

        if (restarting) {
            if (dotsSpan) {
                if (
                    dotsSpan.style.color !==
                    '#0f0'
                ) {
                    dotsSpan.style.color =
                        '#0f0';
                }

                if (
                    !dotsSpan.dataset.animating
                ) {
                    dotsSpan.dataset.animating =
                        'true';

                    this.animateLoadingDots(
                        dotsSpan
                    );
                }
            }

            // ERR is shown only if the camera is actually
            // failed, matching the original behavior.
            if (failed) {
                if (
                    statusSpan.style.color !==
                    '#f00'
                ) {
                    statusSpan.style.color =
                        '#f00';
                }

                if (
                    statusSpan.textContent !==
                    'ERR'
                ) {
                    statusSpan.textContent =
                        'ERR';
                }
            } else if (
                statusSpan.textContent !== ''
            ) {
                statusSpan.textContent = '';
            }

            this.lastCameraRestarting =
                restarting;

            this.lastCameraFailed =
                failed;

            return;
        }

        // ----------------------------------------------------
        // Not restarting
        // ----------------------------------------------------

        if (dotsSpan) {
            this.stopLoadingDots(
                dotsSpan
            );
        }

        if (failed) {
            if (
                statusSpan.style.color !==
                '#f00'
            ) {
                statusSpan.style.color =
                    '#f00';
            }

            if (
                statusSpan.textContent !==
                'ERR'
            ) {
                statusSpan.textContent =
                    'ERR';
            }
        } else {
            if (
                statusSpan.textContent !== ''
            ) {
                statusSpan.textContent =
                    '';
            }
        }

        this.lastCameraRestarting =
            restarting;

        this.lastCameraFailed =
            failed;
    }

    // ========================================================
    // Loading dots
    // ========================================================

    animateLoadingDots(element) {
        if (!element) {
            return;
        }

        // Don't create a second animation for the same element.
        const existing =
            this.loadingDotAnimations.get(
                element
            );

        if (existing) {
            return;
        }

        const states = [
            '.',
            '..',
            '...'
        ];

        let index = 0;
        let timeoutId = null;

        const animate = () => {
            // Stop if element is no longer marked active.
            if (
                !element.dataset.animating ||
                !element.isConnected
            ) {
                if (
                    timeoutId !== null
                ) {
                    clearTimeout(
                        timeoutId
                    );
                }

                this.loadingDotAnimations.delete(
                    element
                );

                return;
            }

            const nextText =
                states[index];

            if (
                element.textContent !==
                nextText
            ) {
                element.textContent =
                    nextText;
            }

            index =
                (index + 1) %
                states.length;

            timeoutId =
                setTimeout(
                    animate,
                    500
                );
        };

        const animationData = {
            stop: () => {
                if (
                    timeoutId !== null
                ) {
                    clearTimeout(
                        timeoutId
                    );

                    timeoutId = null;
                }

                this.loadingDotAnimations.delete(
                    element
                );
            }
        };

        this.loadingDotAnimations.set(
            element,
            animationData
        );

        animate();
    }

    stopLoadingDots(element) {
        if (!element) {
            return;
        }

        const animation =
            this.loadingDotAnimations.get(
                element
            );

        if (animation) {
            animation.stop();
        }

        element.textContent = '';

        delete element.dataset.animating;
    }

    // ========================================================
    // Deprecated compatibility method
    // ========================================================

    animateLoadingDotsWithERR(element) {
        // Intentionally kept for compatibility.
        // The original implementation marked this method
        // deprecated and moved to animateLoadingDots().
        return;
    }

    // ========================================================
    // Restart camera
    // ========================================================

    handleRestartCamera() {
        if (
            !this.game ||
            !this.game.state ||
            !this.game.camera
        ) {
            return;
        }

        if (
            !this.game.state.cameraRestarting &&
            !this.game.state.controlPanelBusy
        ) {
            // Restart camera using existing game API.
            if (
                typeof this.game.camera.restartCamera ===
                'function'
            ) {
                this.game.camera.restartCamera();
            }

            // Update immediately.
            this.updateCameraStatus();

            // Clear any old watcher before creating a new one.
            this.clearCameraRestartInterval();

            // Check status every 100ms while restarting.
            this.cameraRestartInterval =
                setInterval(() => {
                    if (
                        !this.game ||
                        !this.game.state
                    ) {
                        this.clearCameraRestartInterval();
                        return;
                    }

                    this.updateCameraStatus();

                    if (
                        !this.game.state.cameraRestarting
                    ) {
                        this.clearCameraRestartInterval();
                    }
                }, 100);
        }
    }

    clearCameraRestartInterval() {
        if (
            this.cameraRestartInterval !== null
        ) {
            clearInterval(
                this.cameraRestartInterval
            );

            this.cameraRestartInterval =
                null;
        }
    }

    // ========================================================
    // Camera button
    // ========================================================

    createCameraButton() {
        const hotspotsContainer =
            this.getHotspotsContainer();

        if (!hotspotsContainer) {
            return;
        }

        const cameraBtn =
            document.createElement('div');

        cameraBtn.id =
            'camera-btn';

        cameraBtn.className =
            'camera-button';

        Object.assign(cameraBtn.style, {
            position: 'absolute',
            right: '0',
            top: '25%',
            width: '6vw',
            height: '45vh',
            background: 'rgba(0, 0, 0, 0.7)',
            border: '2px solid rgba(255, 255, 255, 0.3)',
            borderRight: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            opacity: '0',
            transition: 'opacity 0.3s, background 0.3s',
            padding: '2vh 0',
            pointerEvents: 'none'
        });

        // ----------------------------------------------------
        // Top arrows
        // ----------------------------------------------------

        const topArrows =
            this.createCameraArrowGroup();

        cameraBtn.appendChild(
            topArrows
        );

        // ----------------------------------------------------
        // Camera text
        // ----------------------------------------------------

        const text =
            document.createElement('div');

        text.textContent =
            'CAMERA';

        Object.assign(text.style, {
            color: '#fff',
            fontSize: '1.3vw',
            fontWeight: 'bold',
            fontFamily: 'Arial, sans-serif',
            transform: 'rotate(-90deg)',
            letterSpacing: '0.2vw',
            whiteSpace: 'nowrap'
        });

        cameraBtn.appendChild(
            text
        );

        // ----------------------------------------------------
        // Bottom arrows
        // ----------------------------------------------------

        const bottomArrows =
            this.createCameraArrowGroup();

        cameraBtn.appendChild(
            bottomArrows
        );

        // ----------------------------------------------------
        // Hover
        // ----------------------------------------------------

        cameraBtn.addEventListener(
            'mouseenter',
            () => {
                cameraBtn.style.background =
                    'rgba(0, 0, 0, 0.9)';
            }
        );

        cameraBtn.addEventListener(
            'mouseleave',
            () => {
                cameraBtn.style.background =
                    'rgba(0, 0, 0, 0.7)';
            }
        );

        // ----------------------------------------------------
        // Click
        // ----------------------------------------------------

        cameraBtn.addEventListener(
            'click',
            () => {
                if (
                    typeof this.game.toggleCamera ===
                    'function'
                ) {
                    this.game.toggleCamera();
                }

                if (
                    this.cameraButtonArrowTimeout !==
                    null
                ) {
                    clearTimeout(
                        this.cameraButtonArrowTimeout
                    );
                }

                this.cameraButtonArrowTimeout =
                    setTimeout(() => {
                        this.cameraButtonArrowTimeout =
                            null;

                        this.updateCameraButtonArrows();
                    }, 50);
            }
        );

        hotspotsContainer.appendChild(
            cameraBtn
        );

        this.cameraBtn =
            cameraBtn;
    }

    createCameraArrowGroup() {
        const group =
            document.createElement('div');

        Object.assign(group.style, {
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5vh'
        });

        for (let i = 0; i < 2; i++) {
            const arrow =
                document.createElement('div');

            arrow.textContent =
                '◄';

            arrow.className =
                'camera-arrow';

            Object.assign(arrow.style, {
                color: '#fff',
                fontSize: '1.8vw',
                transform: 'rotate(0deg)',
                lineHeight: '1'
            });

            group.appendChild(
                arrow
            );
        }

        return group;
    }

    // ========================================================
    // Camera close button
    // ========================================================

    bindCloseCameraButton() {
        // Close button intentionally removed in the original.
    }

    // ========================================================
    // Camera button arrows
    // ========================================================

    updateCameraButtonArrows() {
        const cameraBtn =
            this.cameraBtn &&
            this.cameraBtn.isConnected
                ? this.cameraBtn
                : document.getElementById(
                    'camera-btn'
                );

        if (!cameraBtn) {
            return;
        }

        this.cameraBtn =
            cameraBtn;

        const isOpen =
            !!this.game.state.cameraOpen;

        if (
            isOpen ===
            this.lastCameraArrowState
        ) {
            return;
        }

        this.lastCameraArrowState =
            isOpen;

        const rotation =
            isOpen
                ? 'rotate(180deg)'
                : 'rotate(0deg)';

        const arrows =
            cameraBtn.querySelectorAll(
                '.camera-arrow'
            );

        arrows.forEach((arrow) => {
            if (
                arrow.style.transform !==
                rotation
            ) {
                arrow.style.transform =
                    rotation;
            }
        });
    }

    // ========================================================
    // Hotspot visibility
    // ========================================================

    updateHotspotVisibility(viewPosition) {
        if (
            typeof viewPosition !==
            'number' ||
            !Number.isFinite(viewPosition)
        ) {
            return;
        }

        // ----------------------------------------------------
        // Vents button
        // ----------------------------------------------------

        const ventsVisible =
            viewPosition < 0.15;

        if (
            ventsVisible !==
            this.lastVentsHotspotVisible
        ) {
            const ventsBtn =
                this.ventsBtn &&
                this.ventsBtn.isConnected
                    ? this.ventsBtn
                    : document.getElementById(
                        'vents-btn'
                    );

            if (ventsBtn) {
                this.ventsBtn =
                    ventsBtn;

                const opacity =
                    ventsVisible
                        ? '1'
                        : '0';

                const pointerEvents =
                    ventsVisible
                        ? 'auto'
                        : 'none';

                if (
                    ventsBtn.style.opacity !==
                    opacity
                ) {
                    ventsBtn.style.opacity =
                        opacity;
                }

                if (
                    ventsBtn.style.pointerEvents !==
                    pointerEvents
                ) {
                    ventsBtn.style.pointerEvents =
                        pointerEvents;
                }
            }

            this.lastVentsHotspotVisible =
                ventsVisible;
        }

        // ----------------------------------------------------
        // Camera button
        // ----------------------------------------------------

        const cameraVisible =
            viewPosition > 0.85;

        if (
            cameraVisible !==
            this.lastCameraHotspotVisible
        ) {
            const cameraBtn =
                this.cameraBtn &&
                this.cameraBtn.isConnected
                    ? this.cameraBtn
                    : document.getElementById(
                        'camera-btn'
                    );

            if (cameraBtn) {
                this.cameraBtn =
                    cameraBtn;

                const opacity =
                    cameraVisible
                        ? '1'
                        : '0';

                const pointerEvents =
                    cameraVisible
                        ? 'auto'
                        : 'none';

                if (
                    cameraBtn.style.opacity !==
                    opacity
                ) {
                    cameraBtn.style.opacity =
                        opacity;
                }

                if (
                    cameraBtn.style.pointerEvents !==
                    pointerEvents
                ) {
                    cameraBtn.style.pointerEvents =
                        pointerEvents;
                }
            }

            this.lastCameraHotspotVisible =
                cameraVisible;
        }
    }

    // ========================================================
    // Tooltip
    // ========================================================

    showTooltip(event, text) {
        if (!event) {
            return;
        }

        let tooltip =
            this.tooltip &&
            this.tooltip.isConnected
                ? this.tooltip
                : document.getElementById(
                    'game-tooltip'
                );

        if (!tooltip) {
            tooltip =
                document.createElement('div');

            tooltip.id =
                'game-tooltip';

            Object.assign(tooltip.style, {
                position: 'fixed',
                background:
                    'rgba(0, 0, 0, 0.8)',
                color: 'white',
                padding: '8px 12px',
                borderRadius: '4px',
                fontSize: '14px',
                pointerEvents: 'none',
                zIndex: '10000',
                whiteSpace: 'nowrap'
            });

            document.body.appendChild(
                tooltip
            );
        }

        this.tooltip =
            tooltip;

        if (
            tooltip.textContent !==
            text
        ) {
            tooltip.textContent =
                text;
        }

        if (
            tooltip.style.display !==
            'block'
        ) {
            tooltip.style.display =
                'block';
        }

        const left =
            `${event.clientX + 10}px`;

        const top =
            `${event.clientY + 10}px`;

        if (
            tooltip.style.left !==
            left
        ) {
            tooltip.style.left =
                left;
        }

        if (
            tooltip.style.top !==
            top
        ) {
            tooltip.style.top =
                top;
        }
    }

    hideTooltip() {
        const tooltip =
            this.tooltip &&
            this.tooltip.isConnected
                ? this.tooltip
                : document.getElementById(
                    'game-tooltip'
                );

        if (!tooltip) {
            return;
        }

        this.tooltip =
            tooltip;

        if (
            tooltip.style.display !==
            'none'
        ) {
            tooltip.style.display =
                'none';
        }
    }

    // ========================================================
    // View position
    // ========================================================

    updateViewPosition(viewPosition) {
        if (
            !this.currentSceneImg ||
            typeof viewPosition !==
            'number' ||
            !Number.isFinite(viewPosition)
        ) {
            return;
        }

        // Avoid doing unnecessary DOM writes when the exact
        // same position arrives repeatedly.
        if (
            viewPosition !==
            this.lastViewPosition
        ) {
            const offset =
                -viewPosition * 50;

            const leftValue =
                `${offset}%`;

            if (
                this.currentSceneImg.style.left !==
                leftValue
            ) {
                this.currentSceneImg.style.left =
                    leftValue;
            }

            this.lastViewPosition =
                viewPosition;
        }

        this.updateHotspotVisibility(
            viewPosition
        );
    }

    // ========================================================
    // Cleanup
    // ========================================================

    destroy() {
        // ----------------------------------------------------
        // Timers
        // ----------------------------------------------------

        if (
            this.controlPanelArrowTimeout !==
            null
        ) {
            clearTimeout(
                this.controlPanelArrowTimeout
            );

            this.controlPanelArrowTimeout =
                null;
        }

        if (
            this.cameraButtonArrowTimeout !==
            null
        ) {
            clearTimeout(
                this.cameraButtonArrowTimeout
            );

            this.cameraButtonArrowTimeout =
                null;
        }

        this.clearCameraRestartInterval();

        // ----------------------------------------------------
        // Loading dot animations
        // ----------------------------------------------------

        const dotElements = [
            this.ventsDots,
            this.cameraDots
        ];

        dotElements.forEach((element) => {
            if (element) {
                this.stopLoadingDots(
                    element
                );
            }
        });

        // ----------------------------------------------------
        // Document listener
        // ----------------------------------------------------

        document.removeEventListener(
            'click',
            this.boundHandleDocumentClick
        );

        // ----------------------------------------------------
        // Reset references
        // ----------------------------------------------------

        this.powerValue = null;
        this.timeValue = null;
        this.nightValue = null;
        this.currentSceneImg = null;

        this.hotspotsContainer = null;
        this.ventsBtn = null;
        this.cameraBtn = null;
        this.controlPanelPopup = null;
        this.controlOptions = null;

        this.optionVents = null;
        this.optionCameras = null;

        this.ventsDots = null;
        this.cameraDots = null;
        this.cameraStatus = null;

        this.tooltip = null;
        this.game = null;
    }
}
