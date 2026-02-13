// 游戏入口 - 初始化所有模块
let game;
let staticNoise;

let dots = 1;

// LOADING TEXT ANIMATION
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

// 禁用浏览器默认行为
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
window.addEventListener('DOMContentLoaded', async () => {

  disableBrowserDefaults();

  const loadingScreen = document.getElementById("loading-screen");
  const gameContainer = document.getElementById("game-container");
  const cutscene = document.getElementById("cutscene");
  const mainMenu = document.getElementById("main-menu");

  // hide game & menu at first
  if (gameContainer) gameContainer.style.opacity = "0";
  if (mainMenu) mainMenu.style.opacity = "0";

  // INIT GAME
  game = new Game();
  staticNoise = new StaticNoise();
  game.updateContinueButton();

  // AFTER LOADING → SHOW CUTSCENE
  setTimeout(() => {
    if (loadingScreen) loadingScreen.style.display = "none";

    if (cutscene) {
      cutscene.classList.remove("hidden");
      cutscene.classList.add("show");
    }
  }, 1500);

  // CUTSCENE WAIT FOR CLICK
  if (cutscene) {
    cutscene.addEventListener("click", () => {

      // fade out cutscene
      cutscene.classList.remove("show");

      setTimeout(() => {
        cutscene.classList.add("hidden");

        // fade in game
        if (gameContainer) {
          gameContainer.style.opacity = "1";
        }

        // show menu
        if (mainMenu) {
          mainMenu.style.opacity = "1";
          startMenuAnimation();
        }

      }, 1000); // wait for fade
    });
  }

  // MENU MUSIC
  const menuMusic = document.getElementById('menu-music');
  if (menuMusic) {
    menuMusic.volume = 0.5;
    document.addEventListener("click", () => {
      menuMusic.play().catch(()=>{});
    }, { once: true });
  }

  // scary face & static
  const observer = new MutationObserver(() => {
    if (mainMenu && !mainMenu.classList.contains('hidden')) {
      startScaryFaceFlicker();
      staticNoise.start();
    } else {
      stopScaryFaceFlicker();
      staticNoise.stop();
    }
  });

  if (mainMenu) {
    observer.observe(mainMenu, { attributes: true, attributeFilter: ['class'] });
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

    setTimeout(() => {
      el.classList.add("menu-animate");
    }, index * 400);
  });
}

// iframe message
window.addEventListener('message', (event) => {
  if (event.data.type === 'USER_CLICKED_PLAY') {
    const menuMusic = document.getElementById('menu-music');
    if (menuMusic) {
      menuMusic.volume = 0.5;
      menuMusic.play().catch(()=>{});
    }
  }
});
