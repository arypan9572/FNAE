// ============================================================
// 恐怖脸闪烁效果 / Scary Face Flicker
// Optimized for:
// - Low CPU usage
// - Minimal DOM/style work
// - No overlapping flicker timers
// - Cached DOM references
// - Safe start/stop
// - Preloaded images
// - Preserved original behavior
// ============================================================

// ============================================================
// Base path
// ============================================================

const getBasePath = () => {
    const currentPath = window.location.pathname;

    return currentPath.includes('/FNAE-HTML5-1.1.5/')
        ? '/FNAE-HTML5-1.1.5/'
        : './';
};

const basePath = getBasePath();

// ============================================================
// Background paths
// ============================================================

const normalBackground =
    `${basePath}assets/images/menubackground.png`;

const scaryBackgrounds = [
    `${basePath}assets/images/scaryhawk.png`,
    `${basePath}assets/images/scaryep.png`,
    `${basePath}assets/images/scarytrump.png`
];

// ============================================================
// State
// ============================================================

let scaryFaceInterval = null;
let scaryFaceHideTimeout = null;

let mainMenuElement = null;
let scaryFaceRunning = false;

// Preloaded image cache
const preloadedImages = Object.create(null);

// ============================================================
// Background style constants
// ============================================================

const SCARY_FACE_BACKGROUND_SIZE = '50%';
const SCARY_FACE_BACKGROUND_POSITION = 'right bottom';
const SCARY_FACE_BACKGROUND_REPEAT = 'no-repeat';

// ============================================================
// Get main menu
//
// Cached after the first lookup so we don't repeatedly query
// the DOM every time the effect fires.
// ============================================================

function getMainMenuElement() {
    if (
        mainMenuElement &&
        mainMenuElement.isConnected
    ) {
        return mainMenuElement;
    }

    mainMenuElement =
        document.getElementById('main-menu');

    return mainMenuElement;
}

// ============================================================
// Apply static background properties
//
// These values never change during the effect, so there is no
// reason to repeatedly write them every flicker.
// ============================================================

function configureMainMenuBackground() {
    const mainMenu = getMainMenuElement();

    if (!mainMenu) {
        return null;
    }

    mainMenu.style.backgroundSize =
        SCARY_FACE_BACKGROUND_SIZE;

    mainMenu.style.backgroundPosition =
        SCARY_FACE_BACKGROUND_POSITION;

    mainMenu.style.backgroundRepeat =
        SCARY_FACE_BACKGROUND_REPEAT;

    return mainMenu;
}

// ============================================================
// Set normal background
// ============================================================

function setNormalBackground() {
    const mainMenu = configureMainMenuBackground();

    if (!mainMenu) {
        return;
    }

    mainMenu.style.backgroundImage =
        `url("${normalBackground}")`;
}

// ============================================================
// Set scary background
// ============================================================

function setScaryBackground(backgroundPath) {
    const mainMenu = configureMainMenuBackground();

    if (!mainMenu) {
        return;
    }

    mainMenu.style.backgroundImage =
        `url("${backgroundPath}")`;
}

// ============================================================
// Preload a single image
// ============================================================

function preloadImage(key, src) {
    // Don't create the image again if already cached.
    if (preloadedImages[key]) {
        return preloadedImages[key];
    }

    const img = new Image();

    // Decode asynchronously when supported.
    if (typeof img.decode === 'function') {
        img.src = src;

        img.decode().catch(() => {
            // Ignore decode failures.
            // The browser can still use the image normally.
        });
    } else {
        img.src = src;
    }

    preloadedImages[key] = img;

    return img;
}

// ============================================================
// Preload all background images
// ============================================================

function preloadBackgrounds() {
    // Normal background
    preloadImage(
        'normal',
        normalBackground
    );

    // Scary backgrounds
    for (let i = 0; i < scaryBackgrounds.length; i++) {
        preloadImage(
            `scary-${i}`,
            scaryBackgrounds[i]
        );
    }
}

// ============================================================
// Perform one scary flicker
// ============================================================

function triggerScaryFaceFlicker() {
    // Don't do anything if the effect has been stopped.
    if (!scaryFaceRunning) {
        return;
    }

    const mainMenu = configureMainMenuBackground();

    if (!mainMenu) {
        return;
    }

    // Original probability:
    // 10% chance every 100ms.
    if (Math.random() >= 0.1) {
        return;
    }

    // Choose one of the three scary images.
    const bgIndex = Math.floor(
        Math.random() * scaryBackgrounds.length
    );

    const scaryBg =
        scaryBackgrounds[bgIndex];

    // Show scary face.
    setScaryBackground(scaryBg);

    // --------------------------------------------------------
    // Clear any existing hide timer.
    //
    // This prevents multiple timeouts from stacking up if
    // another flicker happens before the previous timeout
    // finishes.
    // --------------------------------------------------------

    if (scaryFaceHideTimeout !== null) {
        clearTimeout(scaryFaceHideTimeout);
        scaryFaceHideTimeout = null;
    }

    // Original range:
    // 50ms - 200ms
    const hideDelay =
        50 + Math.random() * 150;

    scaryFaceHideTimeout = setTimeout(() => {
        scaryFaceHideTimeout = null;

        // The effect might have been stopped while the
        // scary image was visible.
        if (!scaryFaceRunning) {
            return;
        }

        setNormalBackground();
    }, hideDelay);
}

// ============================================================
// Start scary face flicker
// ============================================================

function startScaryFaceFlicker() {
    // --------------------------------------------------------
    // Prevent duplicate intervals.
    // --------------------------------------------------------

    if (scaryFaceRunning) {
        return;
    }

    const mainMenu = getMainMenuElement();

    if (!mainMenu) {
        return;
    }

    scaryFaceRunning = true;

    // --------------------------------------------------------
    // Configure static styles once.
    // --------------------------------------------------------

    configureMainMenuBackground();

    // Make sure the normal background is visible before
    // starting the effect.
    setNormalBackground();

    // --------------------------------------------------------
    // Make sure images are already loaded.
    // --------------------------------------------------------

    preloadBackgrounds();

    // --------------------------------------------------------
    // Run the effect.
    //
    // 100ms is preserved from your original code.
    // --------------------------------------------------------

    scaryFaceInterval = setInterval(
        triggerScaryFaceFlicker,
        100
    );
}

// ============================================================
// Stop scary face flicker
// ============================================================

function stopScaryFaceFlicker() {
    scaryFaceRunning = false;

    // --------------------------------------------------------
    // Stop recurring interval.
    // --------------------------------------------------------

    if (scaryFaceInterval !== null) {
        clearInterval(scaryFaceInterval);
        scaryFaceInterval = null;
    }

    // --------------------------------------------------------
    // Stop currently scheduled hide operation.
    // --------------------------------------------------------

    if (scaryFaceHideTimeout !== null) {
        clearTimeout(scaryFaceHideTimeout);
        scaryFaceHideTimeout = null;
    }

    // --------------------------------------------------------
    // Restore normal background.
    // --------------------------------------------------------

    const mainMenu = getMainMenuElement();

    if (mainMenu) {
        setNormalBackground();
    }
}

// ============================================================
// Optional cleanup
//
// Useful if your game destroys/recreates the menu.
// ============================================================

function destroyScaryFaceFlicker() {
    stopScaryFaceFlicker();

    mainMenuElement = null;

    // Keep the image cache intact.
    // The browser can reuse the loaded images if the effect
    // is started again.
}

// ============================================================
// Initial preload
//
// This can safely run once when the script loads.
// ============================================================

preloadBackgrounds();
