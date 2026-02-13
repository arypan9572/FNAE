// =============================
// GAME ENTRY
// =============================
let game;
let staticNoise;
let dots = 1;

// =============================
// LOADING TEXT
// =============================
window.addEventListener("DOMContentLoaded", () => {
  const loadingText = document.getElementById("loading-text");

  setInterval(() => {
    dots++;
    if (dots > 3) dots = 1;
    if (loadingText) {
      loadingText.textContent = "LOADING" + ".".repeat(dots);
    }
  }, 400);
});

// =============================
// DISABLE BROWSER DEFAULTS
// =============================
function disableBrowserDefaults() {
  document.addEventListener('contextmenu', e => e.preventDefault(), { capture: true });
  document.addEventListener('dragstart', e => e.preventDefault(), { capture: true });
  document.addEventListener('selectstart', e => e.preventDefault(), { capture: true });
  document.addEventListener('copy', e => e.preventDefault(), { capture: true });
  document.addEventListener('cut', e => e.preventDefault(), { capture: true });

  document.addEventListener('keydown', e => {
    if (e.ctrlKey && ['a','c','x','s','p','u'].includes(e.key.toLowerCase())) {
      e.preventDefault();
    }
  }, { capture: true });
}

// =============================
// MAIN START
// =============================
window.addEventListener("DOMContentLoaded", () => {

  disableBrowserDefaults();

  const loadingScreen = document.getElementById("loading-screen");
  const cutscene = document.getElementById("cutscene");
  const mainMenu = document.getElementById("main-menu");

  // force correct initial states
  if (cutscene) cutscene.classList.add("hidden");
  if (mainMenu) mainMenu.classList.add("hidden");

  // init game
  game = new Game();
  staticNoise = new StaticNoise();
  game.updateContinueButton();

  // =============================
  // AFTER LOADING → SHOW CUTSCENE
  // =============================
  setTimeout(() => {

    if (loadingScreen) loadingScreen.style.display = "none";

    if (cutscene) {
      cutscene.classList.remove("hidden");
      cutscene.classList.add("show");
    }

  }, 1500);

  // =============================
  // CUTSCENE CLICK → SHOW MENU
  // =============================
  if (cutscene) {
    cutscene.addEventListener("click", () => {

      cutscene.classList.remove("show");

      setTimeout(() => {
        cutscene.classList.add("hidden");

        if (mainMenu) {
          mainMenu.classList.remove("hidden");
          startMenuAnimation();
        }

      }, 1000);

    });
  }

  // =============================
  // MENU MUSIC
  // =============================
  const menuMusic = document.getElementById("menu-music");
  if (menuMusic) {
    menuMusic.volume = 0.5;

    document.addEventListener("click", () => {
      menuMusic.play().catch(()=>{});
    }, { once: true });
  }

  // =============================
  // STATIC + SCARY FACE
  // =============================
  const observer = new MutationObserver(() => {
    if (mainMenu && !mainMenu.classList.contains("hidden")) {
      startScaryFaceFlicker();
      staticNoise.start();
    } else {
      stopScaryFaceFlicker();
      staticNoise.stop();
    }
  });

  if (mainMenu) {
    observer.observe(mainMenu, { attributes: true, attributeFilter: ["class"] });
  }

});

// =============================
// MENU TEXT ANIMATION
// =============================
function startMenuAnimation() {
  const title = document.querySelector("#main-menu h1");
  const buttons = document.querySelectorAll("#main-menu button");

  const elements = [title, ...buttons];

  elements.forEach((el, index) => {
    if (!el) return;

    el.classList.remove("menu-animate");

    setTimeout(() => {
      el.classList.add("menu-animate");
    }, index * 400);
  });
}

// =============================
// IFRAME MESSAGE
// =============================
window.addEventListener("message", (event) => {
  if (event.data.type === "USER_CLICKED_PLAY") {
    const menuMusic = document.getElementById("menu-music");
    if (menuMusic) {
      menuMusic.volume = 0.5;
      menuMusic.play().catch(()=>{});
    }
  }
});
