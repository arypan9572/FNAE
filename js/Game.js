// Main game class
class Game {
    constructor() {
        this.state = new GameState();
        this.assets = new AssetManager();
        this.ui = new UIManager(this);
        this.camera = new CameraSystem(this);
        this.enemyAI = new EnemyAI(this);
        this.input = new InputHandler(this);
        
        // Initialize CameraSystem's EP config (from EnemyAI)
        this.camera.initEPConfig();
        
        // Centralized lifecycle/performance state.
        this.timeInterval = null;
        this.powerInterval = null;
        this.rotationFrame = null;
        this.gameSessionId = 0;
        this.cutsceneTimer = null;
        this.cutsceneEndHandler = null;
        this.nightIntroTimers = [];
        this.nightIntroResolve = null;
        this.gameplayTimers = new Set();
        this.sceneTimers = new Set();
        this.ventAnimationTimers = [];
        this.victoryAnimationContainer = null;
        this.goldenStephenOverlay = null;
        this.lastRotationTimestamp = 0;
        this.powerAccumulator = 0;
        this.uiUpdateQueued = false;
        this.lastRenderedOxygen = null;
        this.lastRenderedTime = null;

        this.viewPosition = 0.25;
        this.isRotatingLeft = false;
        this.isRotatingRight = false;
        this.rotationSpeed = 0.015;

        this.initElements();
        this.bindEvents();
    }

    initElements() {
        this.mainMenu = document.getElementById('main-menu');
        this.gameScreen = document.getElementById('game-screen');
        this.gameOverElement = document.getElementById('game-over');
        this.gameOverText = document.getElementById('game-over-text');
        this.tutorialOverlay = document.getElementById('tutorial-overlay');
        this.tutorialGotItBtn = document.getElementById('tutorial-got-it');
        
        this.startBtn = document.getElementById('start-game');
        this.continueBtn = document.getElementById('continue-game');
        this.specialNightBtn = document.getElementById('special-night-btn');
        this.starIcon = document.getElementById('star-icon');
        this.starIcon2 = document.getElementById('star-icon-2');
        this.restartBtn = document.getElementById('restart');
        this.mainMenuBtn = document.getElementById('main-menu-btn');

        // Hot DOM references are cached once instead of being queried repeatedly.
        this.cutscene = document.getElementById('cutscene');
        this.menuMusic = document.getElementById('menu-music');
        this.cameraPanel = document.getElementById('camera-panel');
        this.controlPanel = document.getElementById('control-panel');
        this.characterOverlay = document.getElementById('character-overlay');
        this.gameOverStatic = document.getElementById('game-over-static');
        this.gameOverSubtitle = document.getElementById('game-over-subtitle');
        this.tutorialContent = document.getElementById('tutorial-content');
        this.nightIntro = document.getElementById('night-intro');
        this.nightIntroText = document.getElementById('night-intro-text');
        this.ventIcon = document.querySelector('.vent-icon');
    }

    // ==================== Performance & lifecycle helpers ====================

    safePlaySound(name, loop = false, volume = 1) {
        try {
            this.assets.playSound(name, loop, volume);
        } catch (error) {
            console.warn(`Sound "${name}" failed:`, error);
        }
    }

    safeStopSound(name) {
        try {
            this.assets.stopSound(name);
        } catch (error) {
            console.warn(`Sound "${name}" stop failed:`, error);
        }
    }

    scheduleGameplay(callback, delay) {
        const timer = setTimeout(() => {
            this.gameplayTimers.delete(timer);
            callback();
        }, Math.max(0, delay));
        this.gameplayTimers.add(timer);
        return timer;
    }

    scheduleScene(callback, delay) {
        const timer = setTimeout(() => {
            this.sceneTimers.delete(timer);
            callback();
        }, Math.max(0, delay));
        this.sceneTimers.add(timer);
        return timer;
    }

    stopRotationLoop() {
        if (this.rotationFrame !== null) {
            cancelAnimationFrame(this.rotationFrame);
            this.rotationFrame = null;
        }
        this.lastRotationTimestamp = 0;
    }

    clearGameplayTimers() {
        for (const timer of this.gameplayTimers) clearTimeout(timer);
        this.gameplayTimers.clear();

        for (const timer of this.ventAnimationTimers) clearTimeout(timer);
        this.ventAnimationTimers.length = 0;

        this.stopRotationLoop();
    }

    clearSceneTimers() {
        for (const timer of this.sceneTimers) clearTimeout(timer);
        this.sceneTimers.clear();

        for (const timer of this.nightIntroTimers) clearTimeout(timer);
        this.nightIntroTimers.length = 0;

        if (this.cutsceneTimer) {
            clearTimeout(this.cutsceneTimer);
            this.cutsceneTimer = null;
        }

        if (this.cutscene && this.cutsceneEndHandler) {
            this.cutscene.removeEventListener('click', this.cutsceneEndHandler);
            this.cutsceneEndHandler = null;
        }

        if (this.nightIntroResolve) {
            const resolve = this.nightIntroResolve;
            this.nightIntroResolve = null;
            resolve();
        }
    }

    resetTransientControllerState() {
        this.isRotatingLeft = false;
        this.isRotatingRight = false;
        this.powerAccumulator = 0;
        this.lastRenderedOxygen = null;
        this.lastRenderedTime = null;
        this.state.controlPanelBusy = false;
        this.state.ventsToggling = false;
    }

    queueUIUpdate() {
        if (this.uiUpdateQueued) return;
        this.uiUpdateQueued = true;

        requestAnimationFrame(() => {
            this.uiUpdateQueued = false;
            if (this.state.isGameRunning) this.ui.update();
        });
    }

    cleanupOverlays() {
        if (this.goldenStephenOverlay) {
            this.goldenStephenOverlay.remove();
            this.goldenStephenOverlay = null;
        }

        if (this.victoryAnimationContainer) {
            this.victoryAnimationContainer.remove();
            this.victoryAnimationContainer = null;
        }
    }

    setCameraPanelHidden(hidden) {
        if (!this.cameraPanel) return;
        this.cameraPanel.classList.toggle('hidden', hidden);

        if (hidden) {
            this.cameraPanel.classList.remove('show', 'closing');
        }
    }

    createFullscreenAnimationContainer() {
        this.cleanupOverlays();

        const container = document.createElement('div');
        container.className = 'fnae-victory-overlay';

        Object.assign(container.style, {
            position: 'fixed',
            inset: '0',
            backgroundColor: '#000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: '10000',
            opacity: '0',
            transition: 'opacity 0.5s',
            contain: 'strict',
            willChange: 'opacity'
        });

        document.body.appendChild(container);
        this.victoryAnimationContainer = container;
        return container;
    }

    bindEvents() {
        const on = (element, event, handler) => {
            if (element) element.addEventListener(event, handler);
        };

        on(this.startBtn, 'click', () => this.startGame());
        on(this.continueBtn, 'click', () => this.continueGame());
        on(this.specialNightBtn, 'click', () => this.startSpecialNight());
        on(this.restartBtn, 'click', () => this.restartGame());
        on(this.mainMenuBtn, 'click', () => this.showMainMenu());
        on(this.tutorialGotItBtn, 'click', () => this.closeTutorial());
    }
    
    // 加载保存的进度
    loadProgress() {
        const savedNight = localStorage.getItem('fnae_current_night');
        if (savedNight) {
            const night = parseInt(savedNight);
            if (night > 1 && night <= this.state.maxNights) {
                this.state.currentNight = night;
                return true;
            }
        }
        return false;
    }
    
    // 保存进度
    saveProgress() {
        if (this.state.currentNight > 1) {
            localStorage.setItem('fnae_current_night', this.state.currentNight.toString());
        }
    }
    
    // 清除进度
    clearProgress() {
        localStorage.removeItem('fnae_current_night');
    }
    
    // 更新Continue按钮显示
    updateContinueButton() {
        if (this.loadProgress()) {
            this.continueBtn.classList.remove('hidden');
            this.continueBtn.textContent = `CONTINUE (NIGHT ${this.state.currentNight})`;
        } else {
            this.continueBtn.classList.add('hidden');
        }
        
        // 检查是否解锁特殊夜晚
        const night6Unlocked = localStorage.getItem('night6Unlocked');
        if (night6Unlocked === 'true') {
            this.specialNightBtn.classList.remove('hidden');
            this.starIcon.classList.remove('hidden');
        } else {
            this.specialNightBtn.classList.add('hidden');
            this.starIcon.classList.add('hidden');
        }
        
        // 检查是否通关Night 6
        const night6Completed = localStorage.getItem('night6Completed');
        if (night6Completed === 'true') {
            this.starIcon2.classList.remove('hidden');
        } else {
            this.starIcon2.classList.add('hidden');
        }
        
        // 恢复到Night 1（不影响按钮显示）
        this.state.currentNight = 1;
    }
    
    // Continue游戏（从保存的关卡开始）
    async continueGame() {
        this.gameSessionId += 1;
        const sessionId = this.gameSessionId;

        this.stopGame();
        this.clearSceneTimers();
        this.cleanupOverlays();

        if (this.loadProgress()) {
            this.mainMenu.classList.add('hidden');
            
            if (this.menuMusic) {
                this.menuMusic.pause();
                this.menuMusic.currentTime = 0;
                this.menuMusic.loop = false;
            }
            
            // 重置敌人AI状态
            this.enemyAI.reset();
            
            // 直接开始游戏，不播放过场动画
            await this.initGame();
        }
    }
    
    // 开始特殊夜晚（Night 6）
    async startSpecialNight() {
        this.gameSessionId += 1;
        const sessionId = this.gameSessionId;

        this.stopGame();
        this.clearSceneTimers();
        this.cleanupOverlays();
        this.resetTransientControllerState();

        this.state.currentNight = 6;
        this.clearProgress();
        
        this.mainMenu.classList.add('hidden');
        
        const menuMusic = this.menuMusic || document.getElementById('menu-music');
        if (menuMusic) {
            menuMusic.pause();
            menuMusic.currentTime = 0;
            menuMusic.loop = false;
        }
        
        // 重置敌人AI状态
        this.enemyAI.reset();
        
        // 直接开始游戏，不播放过场动画
        await this.initGame();
    }

    async startGame() {
        this.gameSessionId += 1;
        const sessionId = this.gameSessionId;

        this.stopGame();
        this.clearSceneTimers();
        this.cleanupOverlays();
        this.resetTransientControllerState();

        this.state.currentNight = 1;
        this.clearProgress();

        if (this.mainMenu) this.mainMenu.classList.add('hidden');

        if (this.menuMusic) {
            this.menuMusic.pause();
            this.menuMusic.currentTime = 0;
            this.menuMusic.loop = false;
        }

        if (this.enemyAI && typeof this.enemyAI.reset === 'function') {
            this.enemyAI.reset();
        }

        const cutscene = this.cutscene;
        if (!cutscene) {
            await this.initGame();
            return;
        }

        cutscene.classList.remove('hidden', 'fade-out', 'fade-in');

        let ended = false;

        const endCutscene = () => {
            if (ended || sessionId !== this.gameSessionId) return;
            ended = true;

            cutscene.classList.remove('fade-in');
            cutscene.classList.add('fade-out');

            this.scheduleScene(() => {
                cutscene.classList.add('hidden');
                cutscene.classList.remove('fade-out');
                this.initGame();
            }, 3000);

            cutscene.removeEventListener('click', endCutscene);
            this.cutsceneTimer = null;
        };

        this.cutsceneEndHandler = endCutscene;
        cutscene.addEventListener('click', endCutscene);
        this.scheduleScene(() => {
            if (sessionId === this.gameSessionId) cutscene.classList.add('fade-in');
        }, 50);
        this.cutsceneTimer = this.scheduleScene(endCutscene, 3000);
    }

    async initGame() {
        const sessionId = this.gameSessionId;

        if (!this.assets.loaded) {
            await this.assets.loadAssets();
        }

        this.clearGameplayTimers();
        this.stopGame();
        this.resetTransientControllerState();

        this.state.reset();
        this.camera.resetSoundButtonCount();

        if (this.cameraPanel) {
            this.cameraPanel.style.display = '';
            this.cameraPanel.classList.remove('show', 'closing');
        }

        await this.showNightIntro();

        if (sessionId !== this.gameSessionId || !this.gameScreen) return;

        this.gameScreen.classList.add('active');

        if (this.ui.currentSceneImg) {
            this.ui.currentSceneImg.src = this.assets.images.office.src;
            this.ui.currentSceneImg.style.display = 'block';
        }

        this.viewPosition = 0.25;
        this.ui.updateViewPosition(this.viewPosition);
        this.ui.update();
        this.ui.createHotspots();

        this.initVentFanAnimation();
        this.startGameLoop();
        this.startViewRotation();
        this.enemyAI.start();

        this.safePlaySound('vents', true);

        if (this.state.currentNight === 1) {
            this.showTutorial('night1');
        } else if (this.state.currentNight === 2) {
            this.showTutorial('night2');
        } else if (this.state.currentNight === 3) {
            this.showTutorial('night3');
        }

        if (this.state.currentNight === 5) {
            this.scheduleGameplay(() => this.showGoldenStephen(), 1000);
        }
    }

    // 初始化风扇动画状态
    initVentFanAnimation() {
        const ventIcon = document.querySelector('.vent-icon');
        if (ventIcon) {
            if (this.state.ventsClosed) {
                // 通风口关闭，风扇停止
                ventIcon.classList.add('stopped');
                ventIcon.style.animation = 'none';
            } else {
                // 通风口打开，风扇快速旋转
                ventIcon.classList.remove('stopped', 'slowing', 'speeding-up');
                ventIcon.style.animation = 'spin-fast 0.333s linear infinite';
            }
        }
    }
    
    showTutorial(type = 'night1') {
        const tutorialContent = document.getElementById('tutorial-content');
        if (!tutorialContent) return;
        
        if (type === 'night2') {
            // Night 2 教程：Trump
            tutorialContent.innerHTML = `
                <h2>DEFEND YOURSELF AGAINST TRUMP</h2>
                <p>
                    TRUMP WILL TRY TO ATTACK YOU THROUGH THE VENTS IN CAM 1 AND CAM 2, SO IF YOU HEAR BANGING IN THE VENTS HEAD OVER TO THE CONTROL PANEL AND CLOSE THEM. 
                    AFTER CLOSING THEM YOU WILL HEAR BANGING AGAIN AFTER A FEW SECONDS WHICH MEANS HE LEFT THE VENTS. YOU MUST OPEN THE VENTS OTHERWISE YOU WILL DIE FROM LACK OF OXYGEN. 
                    TRUMP CAN BE LURED WITH THE AUDIOS BUT YOUR MAIN PRIORITY WITH THE AUDIO LURES SHOULD BE EPSTEIN.
                </p>
                <button id="tutorial-got-it">GOT IT</button>
            `;
            // 重新绑定按钮事件
            const gotItBtn = document.getElementById('tutorial-got-it');
            if (gotItBtn) {
                gotItBtn.addEventListener('click', () => this.closeTutorial());
            }
        } else if (type === 'night3') {
            // Night 3 教程：霍金
            tutorialContent.innerHTML = `
                <h2>DEFEND YOURSELF AGAINST STEPHEN HAWKING</h2>
                <p>
                    STEPHEN HAWKING ALWAYS STAYS AT CAM 6 AND HE IS NOT AFFECTED BY THE AUDIO LURES. 
                    ELECTROCUTE STEPHEN HAWKING EVERY ONCE IN A WHILE TO PREVENT HIM FROM LEAVING CAM 6.
                </p>
                <button id="tutorial-got-it">GOT IT</button>
            `;
            // 重新绑定按钮事件
            const gotItBtn = document.getElementById('tutorial-got-it');
            if (gotItBtn) {
                gotItBtn.addEventListener('click', () => this.closeTutorial());
            }
        } else {
            // Night 1 教程：EP
            tutorialContent.innerHTML = `
                <h2>DEFEND YOURSELF AGAINST EPSTEIN</h2>
                <p>
                    EPSTEIN ALWAYS STARTS AT CAM 11. USE THE CAMERA'S AUDIO LURE TO KEEP EPSTEIN FAR AWAY FROM YOU. 
                    MAKE SURE THE CAMERA YOU'RE PLAYING THE SOUND IN IS NEXT TO THE CAMERA WHERE EPSTEIN IS. 
                    PLAYING SOUND IN ONLY ONE SPOT WILL NOT WORK IF YOU DO IT TWICE OR MORE IN A ROW. 
                    USING THE AUDIO LURE TOO MUCH WILL LEAD TO THE CAMERAS BREAKING. 
                    TO FIX THEM HEAD TO THE CONTROL PANEL AND RESTART THE CAMERAS LIKE YOU JUST DID. 
                    EPSTEIN DOES NOT ATTACK THROUGH THE VENTS SO DON'T BOTHER CLOSING THEM FOR THIS NIGHT.
                </p>
                <button id="tutorial-got-it">GOT IT</button>
            `;
            // 重新绑定按钮事件
            const gotItBtn = document.getElementById('tutorial-got-it');
            if (gotItBtn) {
                gotItBtn.addEventListener('click', () => this.closeTutorial());
            }
        }
        
        this.tutorialOverlay.classList.remove('hidden');
        // Mark tutorial as active (but don't pause game, allow view rotation)
        this.state.tutorialActive = true;
    }
    
    closeTutorial() {
        this.tutorialOverlay.classList.add('hidden');
        // Close tutorial
        this.state.tutorialActive = false;
    }
    
    // Golden 霍金彩蛋效果
    showGoldenStephen() {
        console.log('🌟 Golden Stephen Hawking appears!');
        
        // 创建全屏金色霍金图层
        const goldenOverlay = document.createElement('div');
        goldenOverlay.id = 'golden-stephen-overlay';
        goldenOverlay.style.position = 'fixed';
        goldenOverlay.style.top = '0';
        goldenOverlay.style.left = '0';
        goldenOverlay.style.width = '100%';
        goldenOverlay.style.height = '100%';
        goldenOverlay.style.zIndex = '9999';
        goldenOverlay.style.pointerEvents = 'none';
        goldenOverlay.style.background = 'rgba(0, 0, 0, 0.3)';
        
        // 创建金色霍金图片
        const goldenImg = document.createElement('img');
        goldenImg.src = '/FNAE-HTML5-1.1.5/assets/images/goldenstephen.png';
        goldenImg.style.position = 'absolute';
        goldenImg.style.top = '50%';
        goldenImg.style.left = '50%';
        goldenImg.style.transform = 'translate(-50%, -50%)';
        goldenImg.style.width = '80%';
        goldenImg.style.height = '80%';
        goldenImg.style.objectFit = 'contain';
        goldenImg.style.opacity = '0';
        goldenImg.style.animation = 'golden-flicker 2s ease-in-out';
        
        goldenOverlay.appendChild(goldenImg);
        document.body.appendChild(goldenOverlay);
        
        // 播放音效
        this.assets.playSound('goldenstephenscare', false, 1.0);
        
        // 2秒后移除
        setTimeout(() => {
            goldenOverlay.remove();
        }, 2000);
    }
    
    showNightIntro() {
        return new Promise((resolve) => {
            this.nightIntroResolve = resolve;
            const nightIntro = document.getElementById('night-intro');
            const nightIntroText = document.getElementById('night-intro-text');
            
            // Update night number text
            nightIntroText.textContent = `NIGHT ${this.state.currentNight}`;
            
            // Show scene
            nightIntro.classList.remove('hidden');
            
            // Fade in effect (1.5s)
            setTimeout(() => {
                nightIntro.classList.add('fade-in');
            }, 50);
            
            // 1.5s fade in + 2s display then start fade out
            setTimeout(() => {
                nightIntro.classList.remove('fade-in');
                nightIntro.classList.add('fade-out');
                
                // After 1.5s fade out complete, hide and continue game
                setTimeout(() => {
                    nightIntro.classList.add('hidden');
                    nightIntro.classList.remove('fade-out');
                    resolve();
                }, 1500);
            }, 3500); // 1500ms fade in + 2000ms display
        });
    }
    
    startViewRotation() {
        this.stopRotationLoop();

        const rotationLoop = (timestamp) => {
            if (!this.state.isGameRunning) {
                this.rotationFrame = null;
                return;
            }

            this.rotationFrame = requestAnimationFrame(rotationLoop);

            const last = this.lastRotationTimestamp || timestamp;
            const delta = Math.min(50, Math.max(0, timestamp - last));
            this.lastRotationTimestamp = timestamp;

            if (this.state.controlPanelOpen || this.state.cameraOpen) return;
            if (!this.isRotatingLeft && !this.isRotatingRight) return;

            const movement = this.rotationSpeed * (delta / 16.667);
            let changed = false;

            if (this.isRotatingLeft && this.viewPosition > 0) {
                const next = Math.max(0, this.viewPosition - movement);
                changed = changed || next !== this.viewPosition;
                this.viewPosition = next;
            }

            if (this.isRotatingRight && this.viewPosition < 1) {
                const next = Math.min(1, this.viewPosition + movement);
                changed = changed || next !== this.viewPosition;
                this.viewPosition = next;
            }

            if (changed) this.ui.updateViewPosition(this.viewPosition);
        };

        this.rotationFrame = requestAnimationFrame(rotationLoop);
    }

    stopRotationLoop() {
        if (this.rotationFrame !== null) {
            cancelAnimationFrame(this.rotationFrame);
            this.rotationFrame = null;
        }
        this.lastRotationTimestamp = 0;
    }

    startGameLoop() {
        this.stopGameLoopTimers();

        // A single 1-second clock replaces the original two independent
        // intervals.  Gameplay timing remains the same.
        let elapsedSeconds = 0;

        this.powerInterval = setInterval(() => {
            if (!this.state.isGameRunning) return;

            elapsedSeconds += 1;

            if (elapsedSeconds >= 60) {
                elapsedSeconds = 0;
                this.state.currentTime += 1;

                if (this.state.currentTime >= 6) {
                    this.winNight();
                    return;
                }
            }

            this.updatePower();
        }, 1000);

        // Keep the legacy property available for compatibility.
        this.timeInterval = this.powerInterval;
    }

    stopGameLoopTimers() {
        if (this.powerInterval) {
            clearInterval(this.powerInterval);
            this.powerInterval = null;
        }
        this.timeInterval = null;
    }

    updatePower() {
        const previousOxygen = this.state.oxygen;
        const previousTime = this.lastRenderedTime;

        if (this.state.ventsClosed) {
            this.state.oxygen -= 1.5;
        } else if (this.state.oxygen < 100) {
            this.state.oxygen += 2;
        }

        this.state.oxygen = Math.max(0, Math.min(100, this.state.oxygen));

        this.lastRenderedOxygen = this.state.oxygen;
        this.lastRenderedTime = this.state.currentTime;

        // Only enqueue the full UI render when visible state changed.
        if (previousOxygen !== this.state.oxygen || previousTime !== this.state.currentTime) {
            this.queueUIUpdate();
        }

        if (this.state.oxygen <= 0) this.oxygenOut();
    }

    toggleVents() {
        if (this.state.controlPanelBusy || this.state.ventsToggling) return;

        this.state.controlPanelBusy = true;
        this.state.ventsToggling = true;

        this.safePlaySound('ekg', false, 0.8);

        const ventIcon = this.ventIcon || document.querySelector('.vent-icon');

        for (const timer of this.ventAnimationTimers) clearTimeout(timer);
        this.ventAnimationTimers.length = 0;

        if (ventIcon) {
            if (this.state.ventsClosed) {
                ventIcon.classList.remove('stopped', 'slowing');
                ventIcon.classList.add('speeding-up');
                ventIcon.style.animation = 'spin-slow 2s linear infinite';

                this.ventAnimationTimers.push(
                    this.scheduleGameplay(() => {
                        ventIcon.style.animation = 'spin-slow 1.5s linear infinite';
                    }, 1000),
                    this.scheduleGameplay(() => {
                        ventIcon.style.animation = 'spin-fast 0.333s linear infinite';
                        ventIcon.classList.remove('speeding-up');
                    }, 2000)
                );
            } else {
                ventIcon.classList.remove('speeding-up');
                ventIcon.classList.add('slowing');
                ventIcon.style.animation = 'spin-slow 1.5s linear infinite';

                this.ventAnimationTimers.push(
                    this.scheduleGameplay(() => {
                        ventIcon.style.animation = 'spin-slow 2s linear infinite';
                    }, 1000),
                    this.scheduleGameplay(() => {
                        ventIcon.style.animation = 'spin-slow 3s linear infinite';
                    }, 2000),
                    this.scheduleGameplay(() => {
                        ventIcon.style.animation = 'none';
                        ventIcon.classList.remove('slowing');
                        ventIcon.classList.add('stopped');
                    }, 3000)
                );
            }
        }

        this.ui.updateVentsStatus();

        // The old 100ms polling loop was unnecessary.  Vent UI is updated
        // immediately and once the state transition completes.
        this.scheduleGameplay(() => {
            this.state.ventsClosed = !this.state.ventsClosed;

            this.enemyAI.onVentsChanged(this.state.ventsClosed);

            this.state.ventsToggling = false;
            this.state.controlPanelBusy = false;

            this.ui.update();
            this.ui.updateVentsStatus();
            this.ui.updateControlPanelOptions();
        }, 4000);
    }

    toggleCamera() {
        // console.log('🎮 Game.toggleCamera() called');
        // console.log('🎮 Current state - cameraOpen:', this.state.cameraOpen, 'tutorialActive:', this.state.tutorialActive);
        this.camera.toggle();
    }

    oxygenOut() {
        this.stopGame();
        this.safeStopSound('ambient');
        // Oxygen depleted triggers jumpscare
        this.enemyAI.triggerJumpscare();
    }
    
    gameOver(message) {
        this.stopGame();
        this.safeStopSound('ambient');
        
        // 立即隐藏游戏画面
        this.gameScreen.classList.remove('active');
        
        // 关闭摄像头面板
        if (this.state.cameraOpen) {
            this.camera.close();
        }
        
        // 隐藏摄像头面板
        const cameraPanel = this.cameraPanel || document.getElementById('camera-panel');
        if (cameraPanel) {
            cameraPanel.classList.add('hidden');
            cameraPanel.classList.remove('show');
        }
        
        // 清理角色图层
        const characterOverlay = this.characterOverlay || document.getElementById('character-overlay');
        if (characterOverlay) {
            characterOverlay.replaceChildren();
        }
        
        // 隐藏控制面板
        const controlPanel = this.controlPanel || document.getElementById('control-panel');
        if (controlPanel) {
            controlPanel.classList.add('hidden');
        }
        
        this.gameOverScreen(message);
    }

    winNight() {
        this.stopGame();
        this.safeStopSound('ambient');
        
        // 关闭摄像头（如果打开）
        if (this.state.cameraOpen) {
            this.camera.close();
        }
        
        // 强制隐藏摄像头面板，防止闪现
        const cameraPanel = this.cameraPanel || document.getElementById('camera-panel');
        if (cameraPanel) {
            cameraPanel.classList.add('hidden');
            cameraPanel.classList.remove('show', 'closing');
            cameraPanel.style.display = 'none'; // 强制隐藏
        }
        
        // 立即隐藏游戏画面，防止闪烁
        this.gameScreen.classList.remove('active');
        
        // 如果是 Night 6，播放特殊的胜利动画并标记完成
        if (this.state.currentNight === 6) {
            localStorage.setItem('night6Completed', 'true');
            this.playNight6VictoryAnimation();
        } else if (this.state.currentNight === 5) {
            // Night 5，播放特殊的胜利动画
            this.playNight5VictoryAnimation();
        } else {
            // 其他关卡播放普通的夜晚结束动画
            this.playNightEndAnimation();
        }
    }
    
    // Night 5 特殊胜利动画
    playNight5VictoryAnimation() {
        // 创建全屏动画容器
        const animationContainer = document.createElement('div');
        animationContainer.style.position = 'fixed';
        animationContainer.style.top = '0';
        animationContainer.style.left = '0';
        animationContainer.style.width = '100%';
        animationContainer.style.height = '100%';
        animationContainer.style.backgroundColor = '#000';
        animationContainer.style.display = 'flex';
        animationContainer.style.alignItems = 'center';
        animationContainer.style.justifyContent = 'center';
        animationContainer.style.zIndex = '10000';
        animationContainer.style.opacity = '0';
        animationContainer.style.transition = 'opacity 0.5s';
        
        // 创建时间显示
        const timeDisplay = document.createElement('div');
        timeDisplay.style.fontSize = '10vw';
        timeDisplay.style.fontWeight = 'bold';
        timeDisplay.style.color = '#fff';
        timeDisplay.style.fontFamily = 'Arial, sans-serif';
        timeDisplay.textContent = '5:59 AM';
        
        animationContainer.appendChild(timeDisplay);
        document.body.appendChild(animationContainer);
        
        // 淡入
        setTimeout(() => {
            animationContainer.style.opacity = '1';
        }, 50);
        
        // 1秒后变为 6:00 AM 并播放钟声
        setTimeout(() => {
            timeDisplay.textContent = '6:00 AM';
            this.assets.playSound('chimes', false, 1.0);
        }, 1000);
        
        // 3秒后淡出时间
        setTimeout(() => {
            timeDisplay.style.transition = 'opacity 0.5s';
            timeDisplay.style.opacity = '0';
            
            setTimeout(() => {
                // 移除时间显示
                animationContainer.removeChild(timeDisplay);
                
                // 创建 "RESCUE ARRIVE" 文字
                const rescueText = document.createElement('div');
                rescueText.style.fontSize = '8vw';
                rescueText.style.fontWeight = 'bold';
                rescueText.style.color = '#0f0'; // 绿色，表示救援
                rescueText.style.fontFamily = 'Arial, sans-serif';
                rescueText.style.textAlign = 'center';
                rescueText.style.opacity = '0';
                rescueText.style.transition = 'opacity 1s';
                rescueText.textContent = 'RESCUE ARRIVE';
                
                animationContainer.appendChild(rescueText);
                
                // 淡入 "RESCUE ARRIVE"
                setTimeout(() => {
                    rescueText.style.opacity = '1';
                }, 50);
                
                // 2秒后淡出 "RESCUE ARRIVE"，显示胜利画面
                setTimeout(() => {
                    rescueText.style.opacity = '0';
                    
                    setTimeout(() => {
                        // 移除 "RESCUE ARRIVE" 文字
                        animationContainer.removeChild(rescueText);
                        
                        // 创建胜利画面
                        const winScreen = document.createElement('img');
                        winScreen.src = '/FNAE-HTML5-1.1.5/assets/images/winscreen.png';
                        winScreen.style.width = '100%';
                        winScreen.style.height = '100%';
                        winScreen.style.objectFit = 'contain';
                        winScreen.style.opacity = '0';
                        winScreen.style.transition = 'opacity 1s';
                        
                        animationContainer.appendChild(winScreen);
                        
                        // 播放胜利音乐
                        this.assets.playSound('win', false, 1.0);
                        
                        // 淡入胜利画面
                        setTimeout(() => {
                            winScreen.style.opacity = '1';
                        }, 50);
                        
                        // 5秒后淡出并返回主菜单
                        setTimeout(() => {
                            animationContainer.style.opacity = '0';
                            
                            setTimeout(() => {
                                document.body.removeChild(animationContainer);
                                
                                // Night 5 通关后，解锁 Night 6（Special Night）
                                localStorage.setItem('night6Unlocked', 'true');
                                
                                // 返回主菜单
                                this.clearProgress();
                                this.showMainMenu();
                            }, 500);
                        }, 5000); // 显示5秒
                    }, 1000); // "RESCUE ARRIVE" 淡出1秒
                }, 2000); // 显示 "RESCUE ARRIVE" 2秒
            }, 500); // 时间淡出0.5秒
        }, 3000); // 显示 "6:00 AM" 2秒
    }
    
    // Night 6 特殊胜利动画
    playNight6VictoryAnimation() {
        // 创建全屏动画容器
        const animationContainer = document.createElement('div');
        animationContainer.style.position = 'fixed';
        animationContainer.style.top = '0';
        animationContainer.style.left = '0';
        animationContainer.style.width = '100%';
        animationContainer.style.height = '100%';
        animationContainer.style.backgroundColor = '#000';
        animationContainer.style.display = 'flex';
        animationContainer.style.alignItems = 'center';
        animationContainer.style.justifyContent = 'center';
        animationContainer.style.zIndex = '10000';
        animationContainer.style.opacity = '0';
        animationContainer.style.transition = 'opacity 0.5s';
        
        // 创建时间显示
        const timeDisplay = document.createElement('div');
        timeDisplay.style.fontSize = '10vw';
        timeDisplay.style.fontWeight = 'bold';
        timeDisplay.style.color = '#fff';
        timeDisplay.style.fontFamily = 'Arial, sans-serif';
        timeDisplay.textContent = '5:59 AM';
        
        animationContainer.appendChild(timeDisplay);
        document.body.appendChild(animationContainer);
        
        // 淡入
        setTimeout(() => {
            animationContainer.style.opacity = '1';
        }, 50);
        
        // 1秒后变为 6:00 AM 并播放钟声
        setTimeout(() => {
            timeDisplay.textContent = '6:00 AM';
            this.assets.playSound('chimes', false, 1.0);
        }, 1000);
        
        // 3秒后淡出时间，显示night6.png图片
        setTimeout(() => {
            timeDisplay.style.transition = 'opacity 0.5s';
            timeDisplay.style.opacity = '0';
            
            setTimeout(() => {
                // 移除时间显示
                animationContainer.removeChild(timeDisplay);
                
                // 创建night6.png图片
                const night6Image = document.createElement('img');
                night6Image.src = '/FNAE-HTML5-1.1.5/assets/images/night6.png';
                night6Image.style.width = '100%';
                night6Image.style.height = '100%';
                night6Image.style.objectFit = 'contain';
                night6Image.style.opacity = '0';
                night6Image.style.transition = 'opacity 1s';
                
                animationContainer.appendChild(night6Image);
                
                // 播放goldenstephenscare.ogg音乐
                this.assets.playSound('goldenstephenscare', false, 1.0);
                
                // 淡入图片
                setTimeout(() => {
                    night6Image.style.opacity = '1';
                }, 50);
                
                // 5秒后淡出并返回主菜单
                setTimeout(() => {
                    animationContainer.style.opacity = '0';
                    
                    setTimeout(() => {
                        document.body.removeChild(animationContainer);
                        
                        // 返回主菜单
                        this.showMainMenu();
                    }, 500);
                }, 5000);
            }, 500);
        }, 3000);
    }
    
    // Night end animation: 5:59AM -> 6:00AM -> Days until rescue
    playNightEndAnimation() {
        // Create fullscreen animation container
        const animationContainer = document.createElement('div');
        animationContainer.style.position = 'fixed';
        animationContainer.style.top = '0';
        animationContainer.style.left = '0';
        animationContainer.style.width = '100%';
        animationContainer.style.height = '100%';
        animationContainer.style.backgroundColor = '#000';
        animationContainer.style.display = 'flex';
        animationContainer.style.alignItems = 'center';
        animationContainer.style.justifyContent = 'center';
        animationContainer.style.zIndex = '10000';
        animationContainer.style.opacity = '0';
        animationContainer.style.transition = 'opacity 0.5s';
        
        // 创建时间显示
        const timeDisplay = document.createElement('div');
        timeDisplay.style.fontSize = '10vw';
        timeDisplay.style.fontWeight = 'bold';
        timeDisplay.style.color = '#fff';
        timeDisplay.style.fontFamily = 'Arial, sans-serif';
        timeDisplay.textContent = '5:59 AM';
        
        animationContainer.appendChild(timeDisplay);
        document.body.appendChild(animationContainer);
        
        // Fade in
        setTimeout(() => {
            animationContainer.style.opacity = '1';
        }, 50);
        
        // After 1s change to 6:00AM and play sound effect
        setTimeout(() => {
            timeDisplay.textContent = '6:00 AM';
            this.assets.playSound('chimes', false, 1.0);
        }, 1000);
        
        // After 2s more, show message
        setTimeout(() => {
            // 淡出时间（不改变容器透明度，保持黑色背景）
            timeDisplay.style.transition = 'opacity 0.5s';
            timeDisplay.style.opacity = '0';
            
            setTimeout(() => {
                // 如果还有下一关，显示剩余天数（故事设定是5晚，所以总是显示5-当前关卡）
                if (this.state.currentNight < this.state.maxNights) {
                    const daysRemaining = 5 - this.state.currentNight; // 固定按5晚计算
                    timeDisplay.textContent = `${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'} until rescue`;
                    timeDisplay.style.fontSize = '5vw';
                    timeDisplay.style.color = '#fff';
                } else {
                    // 所有关卡完成，显示TO BE CONTINUED
                    timeDisplay.innerHTML = 'TO BE CONTINUED...<br><span style="font-size: 3vw; color: #f00;">Web version port in progress</span>';
                    timeDisplay.style.fontSize = '5vw';
                    timeDisplay.style.color = '#fff';
                }
                timeDisplay.style.opacity = '1';
            }, 500);
            
            // 再过3秒后淡出
            setTimeout(() => {
                animationContainer.style.opacity = '0';
                
                setTimeout(() => {
                    document.body.removeChild(animationContainer);
                    
                    // 如果还有下一关，直接进入下一关
                    if (this.state.currentNight < this.state.maxNights) {
                        this.state.currentNight++;
                        this.continueToNextNight();
                    } else {
                        // 所有关卡完成，清除进度并返回主菜单
                        this.clearProgress();
                        this.showMainMenu();
                    }
                }, 500);
            }, 3000); // 改为3秒，让玩家有时间看TO BE CONTINUED
        }, 3000);
    }

    gameOverScreen(message, win = false) {
        this.gameOverText.textContent = message;
        const subtitle = this.gameOverSubtitle || document.getElementById('game-over-subtitle');
        const gameOverStatic = this.gameOverStatic || document.getElementById('game-over-static');
        const restartBtn = document.getElementById('restart');
        const mainMenuBtn = document.getElementById('main-menu-btn');
        
        // 隐藏按钮
        if (restartBtn) restartBtn.style.display = 'none';
        if (mainMenuBtn) mainMenuBtn.style.display = 'none';
        
        // Play static video
        if (gameOverStatic) {
            gameOverStatic.currentTime = 0;
            gameOverStatic.play().catch(e => console.log('Failed to play game over static:', e));
        }
        
        if (win) {
            // Only increase night number if not at max level
            if (this.state.currentNight < this.state.maxNights) {
                this.state.currentNight++;
                // Hide subtitle, will continue to next night
                subtitle.classList.add('hidden');
                
                // Show game over screen
                this.gameOverElement.classList.remove('hidden');
                
                // Auto continue to next night after 3 seconds
                setTimeout(() => {
                    // 隐藏游戏结束画面
                    this.gameOverElement.classList.add('hidden');
                    this.gameScreen.classList.remove('active');
                    
                    // 停止静态视频
                    if (gameOverStatic) {
                        gameOverStatic.pause();
                        gameOverStatic.currentTime = 0;
                    }
                    
                    this.continueToNextNight();
                }, 3000);
            } else {
                // All available levels completed, show "to be continued" message
                subtitle.textContent = 'TO BE CONTINUED... (Web version port in progress)';
                subtitle.classList.remove('hidden');
                this.gameOverElement.classList.remove('hidden');
                
                // 3秒后自动返回主菜单
                setTimeout(() => {
                    this.gameOverElement.classList.add('hidden');
                    this.showMainMenu();
                }, 3000);
            }
        } else {
            // On failure hide subtitle
            subtitle.classList.add('hidden');
            this.gameOverElement.classList.remove('hidden');
            
            // 保存进度（如果在Night 2或更高关卡死亡）
            this.saveProgress();
            
            // 3秒后自动返回主菜单
            setTimeout(() => {
                this.gameOverElement.classList.add('hidden');
                this.showMainMenu();
            }, 3000);
        }
    }
    
    // Continue to next night (without cutscene)
    async continueToNextNight() {
        this.gameSessionId += 1;
        const sessionId = this.gameSessionId;

        if (!this.assets.loaded) {
            await this.assets.loadAssets();
        }
        
        this.state.reset();
        this.enemyAI.reset(); // 重置敌人AI状态
        
        // 重置摄像头系统的sound按钮计数
        this.camera.resetSoundButtonCount();
        
        // 恢复摄像头面板的display（之前被强制隐藏）
        const cameraPanel = this.cameraPanel || document.getElementById('camera-panel');
        if (cameraPanel) {
            cameraPanel.style.display = ''; // 恢复默认
        }
        
        // 显示每晚开始场景
        await this.showNightIntro();
        
        // 进场动画结束后才显示游戏画面
        this.gameScreen.classList.add('active');
        
        this.ui.currentSceneImg.src = this.assets.images.office.src;
        this.ui.currentSceneImg.style.display = 'block';
        this.viewPosition = 0.25;
        this.ui.updateViewPosition(this.viewPosition);
        
        this.ui.update();
        this.ui.createHotspots();
        
        // 初始化风扇状态
        this.initVentFanAnimation();
        
        this.startGameLoop();
        this.startViewRotation();
        
        // Start enemy AI
        this.enemyAI.start();
        
        this.safePlaySound('vents', true);
        
        // Show tutorial for specific nights
        if (this.state.currentNight === 2) {
            this.showTutorial('night2');
        } else if (this.state.currentNight === 3) {
            this.showTutorial('night3');
        }
        
        // Night 5: 必定触发 Golden 霍金彩蛋
        if (this.state.currentNight === 5) {
            console.log('🌟 Night 5 detected (continueToNextNight), triggering Golden Stephen...');
            this.scheduleGameplay(() => this.showGoldenStephen(), 1000);
        }
    }

    stopGame() {
        this.state.isGameRunning = false;

        this.stopGameLoopTimers();
        this.stopRotationLoop();

        for (const timer of this.gameplayTimers) clearTimeout(timer);
        this.gameplayTimers.clear();

        for (const timer of this.ventAnimationTimers) clearTimeout(timer);
        this.ventAnimationTimers.length = 0;

        if (this.enemyAI && typeof this.enemyAI.stop === 'function') {
            this.enemyAI.stop();
        }
    }

    restartGame() {
        this.gameOverElement.classList.add('hidden');
        // Hide game screen, prepare to restart
        this.gameScreen.classList.remove('active');
        this.startGame();
    }

    showMainMenu() {
        this.gameSessionId += 1;
        this.stopGame();
        this.clearSceneTimers();
        this.cleanupOverlays();

        this.isRotatingLeft = false;
        this.isRotatingRight = false;
        this.state.controlPanelBusy = false;
        this.state.ventsToggling = false;

        if (this.gameOverElement) this.gameOverElement.classList.add('hidden');
        if (this.gameScreen) this.gameScreen.classList.remove('active');

        if (this.state.cameraOpen) {
            this.camera.close();
        }

        this.setCameraPanelHidden(true);

        if (this.characterOverlay) {
            this.characterOverlay.replaceChildren();
        }

        if (this.controlPanel) {
            this.controlPanel.classList.add('hidden');
        }

        if (this.mainMenu) this.mainMenu.classList.remove('hidden');

        this.updateContinueButton();

        this.safeStopSound('vents');
        this.safeStopSound('static');
        this.safeStopSound('staticLoop');
        this.safeStopSound('ventCrawling');

        if (this.menuMusic) {
            this.menuMusic.loop = true;
            this.menuMusic.currentTime = 0;
            this.menuMusic.play().catch(() => {});
        }
    }

    getPerformanceSnapshot() {
        return {
            night: this.state.currentNight,
            time: this.state.currentTime,
            oxygen: this.state.oxygen,
            ventsClosed: this.state.ventsClosed,
            cameraOpen: this.state.cameraOpen,
            isGameRunning: this.state.isGameRunning,
            activeGameplayTimers: this.gameplayTimers.size,
            activeSceneTimers: this.sceneTimers.size,
            rotationActive: this.rotationFrame !== null,
            enemyAIActive: !!this.enemyAI
        };
    }
}
