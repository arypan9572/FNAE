// ============================================================
// 游戏入口 - 初始化所有模块
// ============================================================

let game;
let staticNoise;

let dots = 1;

// ============================================================
// Loading text animation
// ============================================================

window.addEventListener("DOMContentLoaded", () => {
    const loadingText =
        document.getElementById("loading-text");

    setInterval(() => {
        dots++;

        if (dots > 3) {
            dots = 1;
        }

        if (loadingText) {
            loadingText.textContent =
                "LOADING" + ".".repeat(dots);
        }
    }, 400);
});

// ============================================================
// Disable browser defaults
// ============================================================

function disableBrowserDefaults() {
    // Disable right-click menu
    document.addEventListener(
        "contextmenu",
        (e) => {
            e.preventDefault();
            return false;
        },
        { capture: true }
    );

    // Disable dragging
    document.addEventListener(
        "dragstart",
        (e) => {
            e.preventDefault();
            return false;
        },
        { capture: true }
    );

    // Disable text selection
    document.addEventListener(
        "selectstart",
        (e) => {
            e.preventDefault();
            return false;
        },
        { capture: true }
    );

    // Disable copy
    document.addEventListener(
        "copy",
        (e) => {
            e.preventDefault();
            return false;
        },
        { capture: true }
    );

    // Disable cut
    document.addEventListener(
        "cut",
        (e) => {
            e.preventDefault();
            return false;
        },
        { capture: true }
    );

    // Disable certain browser shortcuts
    document.addEventListener(
        "keydown",
        (e) => {
            if (!e.ctrlKey) {
                return;
            }

            const key =
                String(e.key).toLowerCase();

            switch (key) {
                case "a": // Ctrl+A
                case "c": // Ctrl+C
                case "x": // Ctrl+X
                case "s": // Ctrl+S
                case "p": // Ctrl+P
                case "u": // Ctrl+U
                    e.preventDefault();
                    break;

                default:
                    break;
            }
        },
        { capture: true }
    );

    // Prevent multi-touch browser gestures
    document.addEventListener(
        "touchstart",
        (e) => {
            if (e.touches.length > 1) {
                e.preventDefault();
            }
        },
        {
            passive: false,
            capture: true
        }
    );

    document.addEventListener(
        "touchmove",
        (e) => {
            if (e.touches.length > 1) {
                e.preventDefault();
            }
        },
        {
            passive: false,
            capture: true
        }
    );

    // Prevent double-click text selection / dragging
    document.addEventListener(
        "mousedown",
        (e) => {
            // Allow buttons
            if (
                e.target.tagName === "BUTTON" ||
                (
                    e.target.closest &&
                    e.target.closest("button")
                )
            ) {
                return true;
            }

            if (e.detail > 1) {
                e.preventDefault();
                return false;
            }

            return true;
        },
        { capture: true }
    );
}

// ============================================================
// Start game after page load
// ============================================================

window.addEventListener(
    "DOMContentLoaded",
    async () => {
        // Disable browser defaults
        disableBrowserDefaults();

        // ----------------------------------------------------
        // Loading screen
        // ----------------------------------------------------

        setTimeout(() => {
            const loadingScreen =
                document.getElementById(
                    "loading-screen"
                );

            const gameContainer =
                document.getElementById(
                    "game-container"
                );

            const mainMenu =
                document.getElementById(
                    "main-menu"
                );

            if (loadingScreen) {
                loadingScreen.style.display =
                    "none";
            }

            if (gameContainer) {
                gameContainer.classList.add(
                    "fade-in"
                );
            }

            if (mainMenu) {
                mainMenu.classList.add(
                    "animate-in"
                );
            }
        }, 1500);

        // ----------------------------------------------------
        // Initialize game
        // ----------------------------------------------------

        game = new Game();
        staticNoise = new StaticNoise();

        game.updateContinueButton();

        const mainMenu =
            document.getElementById(
                "main-menu"
            );

        // ----------------------------------------------------
        // Autostart parameter
        // ----------------------------------------------------

        const urlParams =
            new URLSearchParams(
                window.location.search
            );

        const autostart =
            urlParams.get("autostart");

        // ----------------------------------------------------
        // Menu music
        // ----------------------------------------------------

        const menuMusic =
            document.getElementById(
                "menu-music"
            );

        if (menuMusic) {
            menuMusic.volume = 0.5;

            if (autostart === "1") {
                menuMusic
                    .play()
                    .catch(() => {
                        setupManualPlayback();
                    });
            } else {
                setupManualPlayback();
            }

            function setupManualPlayback() {
                const playMusic = () => {
                    if (
                        mainMenu &&
                        !mainMenu.classList.contains(
                            "hidden"
                        )
                    ) {
                        menuMusic
                            .play()
                            .catch(() => {});
                    }

                    document.removeEventListener(
                        "click",
                        playMusic
                    );

                    document.removeEventListener(
                        "keydown",
                        playMusic
                    );
                };

                document.addEventListener(
                    "click",
                    playMusic
                );

                document.addEventListener(
                    "keydown",
                    playMusic
                );
            }
        }

        // ----------------------------------------------------
        // Main menu visual effects
        // ----------------------------------------------------

        const observer =
            new MutationObserver(() => {
                if (
                    mainMenu &&
                    !mainMenu.classList.contains(
                        "hidden"
                    )
                ) {
                    startScaryFaceFlicker();

                    if (
                        staticNoise &&
                        typeof staticNoise.start ===
                            "function"
                    ) {
                        staticNoise.start();
                    }
                } else {
                    stopScaryFaceFlicker();

                    if (
                        staticNoise &&
                        typeof staticNoise.stop ===
                            "function"
                    ) {
                        staticNoise.stop();
                    }
                }
            });

        if (mainMenu) {
            observer.observe(
                mainMenu,
                {
                    attributes: true,
                    attributeFilter: ["class"]
                }
            );

            if (
                !mainMenu.classList.contains(
                    "hidden"
                )
            ) {
                startScaryFaceFlicker();

                if (
                    staticNoise &&
                    typeof staticNoise.start ===
                        "function"
                ) {
                    staticNoise.start();
                }
            }
        }

        // ----------------------------------------------------
        // New Game button
        // ----------------------------------------------------

        const startBtn =
            document.getElementById(
                "start-game"
            );

        const cutscene =
            document.getElementById(
                "cutscene"
            );

        if (startBtn && cutscene) {
            startBtn.addEventListener(
                "click",
                () => {
                    startCutscene();
                }
            );
        }
    }
);

// ============================================================
// Parent page / iframe communication
// ============================================================

window.addEventListener(
    "message",
    (event) => {
        if (
            !event.data ||
            event.data.type !==
                "USER_CLICKED_PLAY"
        ) {
            return;
        }

        const menuMusic =
            document.getElementById(
                "menu-music"
            );

        if (!menuMusic) {
            return;
        }

        menuMusic.volume = 0.5;

        menuMusic
            .play()
            .catch(() => {});
    }
);


    // --------------------------------------------------------
    // Remove keyboard listener
    // --------------------------------------------------------

    if (
        cutsceneState.keyHandler
    ) {
        document.removeEventListener(
            "keydown",
            cutsceneState.keyHandler
        );
    }

    // --------------------------------------------------------
    // Clear timers
    // --------------------------------------------------------

    if (
        cutsceneState.continueTimeout !==
        null
    ) {
        clearTimeout(
            cutsceneState.continueTimeout
        );
    }

    if (
        cutsceneState.fadeTimeout !==
        null
    ) {
        clearTimeout(
            cutsceneState.fadeTimeout
        );
    }

    // --------------------------------------------------------
    // Reset state
    // --------------------------------------------------------

    cutsceneState.active = false;
    cutsceneState.canContinue = false;

    cutsceneState.continueTimeout =
        null;

    cutsceneState.fadeTimeout =
        null;

    cutsceneState.cutsceneElement =
        null;

    cutsceneState.clickHandler =
        null;

    cutsceneState.keyHandler =
        null;
}
