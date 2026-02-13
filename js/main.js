// 游戏入口 - 初始化所有模块
let game;
let staticNoise;

let dots = 1;

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

// 禁用浏览器默认行为，提升游戏体验
function disableBrowserDefaults() {
    // 禁用右键菜单
    document.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        return false;
    }, { capture: true });
    
    // 禁用拖拽
    document.addEventListener('dragstart', (e) => {
        e.preventDefault();
        return false;
    }, { capture: true });
    
    // 禁用选择文本（双击、长按等）
    document.addEventListener('selectstart', (e) => {
        e.preventDefault();
        return false;
    }, { capture: true });
    
    // 禁用复制
    document.addEventListener('copy', (e) => {
        e.preventDefault();
        return false;
    }, { capture: true });
    
    // 禁用剪切
    document.addEventListener('cut', (e) => {
        e.preventDefault();
        return false;
    }, { capture: true });
    
    // 禁用某些快捷键
    document.addEventListener('keydown', (e) => {
        // 禁用 Ctrl+A (全选)
        if (e.ctrlKey && e.key === 'a') {
            e.preventDefault();
            return false;
        }
        // 禁用 Ctrl+C (复制)
        if (e.ctrlKey && e.key === 'c') {
            e.preventDefault();
            return false;
        }
        // 禁用 Ctrl+X (剪切)
        if (e.ctrlKey && e.key === 'x') {
            e.preventDefault();
            return false;
        }
        // 禁用 Ctrl+S (保存)
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            return false;
        }
        // 禁用 Ctrl+P (打印)
        if (e.ctrlKey && e.key === 'p') {
            e.preventDefault();
            return false;
        }
        // 禁用 Ctrl+U (查看源代码)
        if (e.ctrlKey && e.key === 'u') {
            e.preventDefault();
            return false;
        }
    }, { capture: true });
    
    // 禁用触摸设备的长按菜单
    document.addEventListener('touchstart', (e) => {
        if (e.touches.length > 1) {
            e.preventDefault();
        }
    }, { passive: false, capture: true });
    
    // 禁用双指缩放
    document.addEventListener('touchmove', (e) => {
        if (e.touches.length > 1) {
            e.preventDefault();
        }
    }, { passive: false, capture: true });
    
    // 阻止鼠标选择文本
    document.addEventListener('mousedown', (e) => {
        // 允许按钮点击
        if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
            return true;
        }
        // 阻止其他元素的鼠标按下（防止拖拽选择）
        if (e.detail > 1) { // 双击或多击
            e.preventDefault();
            return false;
        }
    }, { capture: true });
    
    // console.log('Browser defaults disabled for better game experience');
}





// 页面加载完成后启动
window.addEventListener('DOMContentLoaded', async () => {
    // 禁用浏览器默认行为
    disableBrowserDefaults();
    
  // hide loading screen after short delay
setTimeout(() => {
  const loadingScreen = document.getElementById("loading-screen");
  const gameContainer = document.getElementById("game-container");

  if (loadingScreen) loadingScreen.style.display = "none";

  if (gameContainer) {
    gameContainer.classList.add("fade-in");
  }
}, 1500);


    
    // 初始化游戏
    game = new Game();
    staticNoise = new StaticNoise();
    
    // 更新Continue按钮显示
    game.updateContinueButton();
    
    const mainMenu = document.getElementById('main-menu');
    
    // 检查是否从外部页面启动（带autostart参数）
    const urlParams = new URLSearchParams(window.location.search);
    const autostart = urlParams.get('autostart');
    
    // 启动菜单音乐
    const menuMusic = document.getElementById('menu-music');
    if (menuMusic) {
        menuMusic.volume = 0.5;
        
        // 如果是autostart，立即尝试播放
        if (autostart === '1') {
            // console.log('检测到autostart参数，尝试自动播放音乐...');
            menuMusic.play().then(() => {
                // console.log('✅ 音乐自动播放成功！');
            }).catch(e => {
                // console.log('❌ 自动播放失败，等待用户交互:', e);
                // 失败则等待用户点击
                setupManualPlayback();
            });
        } else {
            // 正常流程：等待用户点击
            setupManualPlayback();
        }
        
        function setupManualPlayback() {
            const playMusic = () => {
                if (mainMenu && !mainMenu.classList.contains('hidden')) {
                    menuMusic.play().catch(e => {/* console.log('音乐播放需要用户交互') */});
                }
                document.removeEventListener('click', playMusic);
                document.removeEventListener('keydown', playMusic);
            };
            
            document.addEventListener('click', playMusic);
            document.addEventListener('keydown', playMusic);
        }
    }
    
    // 监听主菜单显示/隐藏，控制雪花和鬼脸效果
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
        
        if (!mainMenu.classList.contains('hidden')) {
            startScaryFaceFlicker();
            staticNoise.start();
        }
    }
  const cutscene = document.getElementById("cutscene");

if (cutscene) {
  cutscene.addEventListener("click", () => {
    cutscene.classList.add("hidden");
  });
}

});

// 监听来自父页面的消息（iframe 通信）
window.addEventListener('message', (event) => {
    if (event.data.type === 'USER_CLICKED_PLAY') {
        // console.log('收到父页面的用户点击事件');
        const menuMusic = document.getElementById('menu-music');
        if (menuMusic) {
            // 立即尝试播放音乐
            menuMusic.volume = 0.5;
            menuMusic.play().then(() => {
                // console.log('✅ 音乐自动播放成功！');
            }).catch(e => {
                // console.log('❌ 音乐播放失败:', e);
                // 如果失败，等待用户在游戏内点击
            });
        }
    }
});
