/* ============================================================
   EFRAIN'S HOUSE — HIGH PERFORMANCE ASSET MANAGER
   ============================================================

   DESIGN GOALS
   ────────────────────────────────────────────────────────────
   • Load gameplay-critical images first
   • Prevent a giant loading spike
   • Decode images before first presentation
   • Limit simultaneous network/decode work
   • Avoid eager-loading every audio file
   • Pool frequently repeated sound effects
   • Support Web Audio for short SFX
   • Keep long music tracks as HTMLAudioElements
   • Cache everything that has already been loaded
   • Avoid duplicate requests
   • Pause background audio when the tab is hidden
   • Resume cleanly when the tab becomes visible
   • Support browsers that lack newer APIs
   • Never crash the game because one asset failed
   ============================================================ */

class AssetManager {

    constructor(options = {}) {

        /* --------------------------------------------------------
           CORE STORAGE
           -------------------------------------------------------- */

        this.images = Object.create(null);
        this.sounds = Object.create(null);
        this.audioPools = Object.create(null);
        this.loadingPromises = Object.create(null);
        this.imagePromises = Object.create(null);

        this.loaded = false;
        this.initialized = false;

        /* --------------------------------------------------------
           PERFORMANCE SETTINGS
           -------------------------------------------------------- */

        this.config = {

            /* Network/decode concurrency */
            maxConcurrentImages:
                options.maxConcurrentImages ??
                this.detectImageConcurrency(),

            maxConcurrentAudio:
                options.maxConcurrentAudio ??
                2,

            /* Audio */
            enableWebAudio:
                options.enableWebAudio ??
                true,

            enableSoundPooling:
                options.enableSoundPooling ??
                true,

            defaultSfxPoolSize:
                options.defaultSfxPoolSize ??
                3,

            /* Decode */
            decodeImages:
                options.decodeImages !== false,

            /* Memory behavior */
            pauseAudioWhenHidden:
                options.pauseAudioWhenHidden !== false,

            /* Loading */
            loadOptionalAssetsDuringIdle:
                options.loadOptionalAssetsDuringIdle !== false,

            /* Debug */
            debug:
                options.debug ?? false
        };

        /* --------------------------------------------------------
           STATE
           -------------------------------------------------------- */

        this.activeImageLoads = 0;
        this.activeAudioLoads = 0;

        this.imageQueue = [];
        this.audioQueue = [];

        this.assetErrors = [];

        this.masterVolume = 1;

        this.categoryVolumes = {
            music: 0.75,
            ambient: 0.75,
            sfx: 1,
            static: 0.7
        };

        /* --------------------------------------------------------
           WEB AUDIO
           -------------------------------------------------------- */

        this.audioContext = null;
        this.audioBuffers = Object.create(null);
        this.audioBufferPromises = Object.create(null);

        /* --------------------------------------------------------
           TRACK PLAYBACK
           -------------------------------------------------------- */

        this.activeLongAudio = new Set();

        /* --------------------------------------------------------
           VISIBILITY STATE
           -------------------------------------------------------- */

        this.wasPlayingBeforeHidden = new Set();

        /* --------------------------------------------------------
           BASE PATH
           -------------------------------------------------------- */

        this.basePath = this.getBasePath();

        /* --------------------------------------------------------
           ASSET MANIFEST
           -------------------------------------------------------- */

        this.imagePaths = this.createImageManifest();
        this.soundPaths = this.createSoundManifest();

        /* --------------------------------------------------------
           AUDIO METADATA

           "music" / "ambient" are long-running tracks.
           "sfx" are short repeated sounds.
           -------------------------------------------------------- */

        this.soundMeta = {

            ambient: {
                type: "music",
                preload: "metadata",
                pool: 1
            },

            static: {
                type: "static",
                preload: "none",
                pool: 3
            },

            staticLoop: {
                type: "static",
                preload: "metadata",
                pool: 1
            },

            vents: {
                type: "ambient",
                preload: "metadata",
                pool: 1
            },

            ventCrawling: {
                type: "sfx",
                preload: "none",
                pool: 2
            },

            jumpscare: {
                type: "sfx",
                preload: "none",
                pool: 2
            },

            hawkingJumpscare: {
                type: "sfx",
                preload: "none",
                pool: 2
            },

            blip: {
                type: "sfx",
                preload: "none",
                pool: 4
            },

            win: {
                type: "music",
                preload: "metadata",
                pool: 1
            },

            chimes: {
                type: "sfx",
                preload: "none",
                pool: 2
            },

            crank1: {
                type: "sfx",
                preload: "none",
                pool: 2
            },

            crank2: {
                type: "sfx",
                preload: "none",
                pool: 2
            },

            ekg: {
                type: "ambient",
                preload: "metadata",
                pool: 1
            },

            hawking_shock: {
                type: "sfx",
                preload: "none",
                pool: 2
            },

            goldenstephenscare: {
                type: "sfx",
                preload: "none",
                pool: 2
            }
        };

        /* --------------------------------------------------------
           VISIBILITY HANDLING
           -------------------------------------------------------- */

        if (this.config.pauseAudioWhenHidden) {
            document.addEventListener(
                "visibilitychange",
                () => this.handleVisibilityChange(),
                { passive: true }
            );
        }
    }

    /* ============================================================
       MANIFESTS
       ============================================================ */

    createImageManifest() {

        return {

            /*
             * CRITICAL GAMEPLAY IMAGES
             * These should be decoded early.
             */

            office:
                `${this.basePath}assets/images/original.png`,

            cam1:
                `${this.basePath}assets/images/Cam1.png`,

            cam2:
                `${this.basePath}assets/images/Cam2.png`,

            cam3:
                `${this.basePath}assets/images/Cam3.png`,

            cam4:
                `${this.basePath}assets/images/Cam4.png`,

            cam5:
                `${this.basePath}assets/images/Cam5.png`,

            cam6:
                `${this.basePath}assets/images/Cam6.png`,

            cam7:
                `${this.basePath}assets/images/Cam7.png`,

            cam8:
                `${this.basePath}assets/images/Cam8.png`,

            cam9:
                `${this.basePath}assets/images/Cam9.png`,

            cam10:
                `${this.basePath}assets/images/Cam10.png`,

            cam11:
                `${this.basePath}assets/images/Cam11.png`,

            /*
             * JUMPSCARE ASSETS
             */

            jumpscare:
                `${this.basePath}assets/images/jump.png`,

            trumpJumpscare:
                `${this.basePath}assets/images/jumptrump.png`,

            hawkingJumpscare:
                `${this.basePath}assets/images/scaryhawking.png`
        };
    }

    createSoundManifest() {

        return {

            ambient:
                `${this.basePath}assets/sounds/music.ogg`,

            static:
                `${this.basePath}assets/sounds/Static_sound.ogg`,

            staticLoop:
                `${this.basePath}assets/sounds/Static_sound.ogg`,

            vents:
                `${this.basePath}assets/sounds/vents.ogg`,

            ventCrawling:
                `${this.basePath}assets/sounds/vent-crawling.mp3`,

            jumpscare:
                `${this.basePath}assets/sounds/jumpcare.ogg`,

            hawkingJumpscare:
                `${this.basePath}assets/sounds/stephenjumpscare.ogg`,

            blip:
                `${this.basePath}assets/sounds/Blip.ogg`,

            win:
                `${this.basePath}assets/sounds/winmusic.ogg`,

            chimes:
                `${this.basePath}assets/sounds/chimes.ogg`,

            crank1:
                `${this.basePath}assets/sounds/Crank1.ogg`,

            crank2:
                `${this.basePath}assets/sounds/Crank2.ogg`,

            ekg:
                `${this.basePath}assets/sounds/ekg.wav`,

            hawking_shock:
                `${this.basePath}assets/sounds/hawking_shock.wav`,

            goldenstephenscare:
                `${this.basePath}assets/sounds/goldenstephenscare.ogg`
        };
    }

    /* ============================================================
       BASE PATH
       ============================================================ */

    getBasePath() {

        /*
         * Prefer the current document URL.

         * This works with:
         *   file://
         *   local servers
         *   GitHub Pages
         *   itch.io style deployments
         */

        try {

            const currentScript =
                document.currentScript;

            if (currentScript?.src) {

                return new URL(
                    "./",
                    currentScript.src
                ).href;
            }

        } catch (_) {
            /* Fallback below */
        }

        return "./";
    }

    /* ============================================================
       HARDWARE-AWARE IMAGE CONCURRENCY
       ============================================================ */

    detectImageConcurrency() {

        const cores =
            navigator.hardwareConcurrency || 4;

        /*
         * Do not blindly spawn a huge amount of work.

         * Image decoding can become CPU-heavy.
         */

        if (cores <= 2) return 2;
        if (cores <= 4) return 3;
        if (cores <= 8) return 4;

        return 5;
    }

    /* ============================================================
       INITIALIZATION
       ============================================================ */

    async initialize() {

        if (this.initialized) {
            return;
        }

        this.initialized = true;

        /*
         * Create media elements without immediately forcing
         * them to download everything.
         */

        this.prepareAudioObjects();

        /*
         * Web Audio is initialized lazily because browsers may
         * block AudioContext creation/resume until user input.
         */

        if (this.config.enableWebAudio) {

            this.installAudioUnlock();
        }
    }

    /* ============================================================
       MASTER ASSET LOADER
       ============================================================ */

    async loadAssets(options = {}) {

        await this.initialize();

        const {

            /*
             * Camera images are gameplay-critical.
             */

            preloadImages = Object.keys(
                this.imagePaths
            ),

            /*
             * Only eagerly initialize long tracks.
             */

            preloadSounds = [
                "ambient",
                "staticLoop",
                "vents",
                "win",
                "ekg"
            ]

        } = options;

        this.log(
            "Starting optimized asset loading..."
        );

        /*
         * --------------------------------------------------------
         * STEP 1
         * Critical images
         * --------------------------------------------------------
         */

        await this.loadImagesParallel(
            preloadImages
        );

        /*
         * --------------------------------------------------------
         * STEP 2
         * Lightweight audio metadata
         * --------------------------------------------------------
         */

        await this.prepareSounds(
            preloadSounds
        );

        /*
         * --------------------------------------------------------
         * STEP 3
         * Optional assets during idle time
         * --------------------------------------------------------
         */

        if (
            this.config.loadOptionalAssetsDuringIdle
        ) {

            this.idleLoadRemainingAssets();
        }

        this.loaded = true;

        this.log(
            "Optimized asset loading complete."
        );
    }

    /* ============================================================
       IMAGE LOADING
       ============================================================ */

    async loadImagesParallel(keys) {

        const uniqueKeys = [
            ...new Set(keys)
        ];

        let index = 0;

        const worker = async () => {

            while (index < uniqueKeys.length) {

                const currentIndex =
                    index++;

                const key =
                    uniqueKeys[currentIndex];

                if (!key) continue;

                try {

                    await this.loadImageByKey(key);

                } catch (error) {

                    this.recordError(
                        "image",
                        key,
                        error
                    );
                }
            }
        };

        /*
         * Small worker pool instead of Promise.all() for
         * everything simultaneously.
         */

        const workers = [];

        const workerCount = Math.min(
            this.config.maxConcurrentImages,
            uniqueKeys.length
        );

        for (
            let i = 0;
            i < workerCount;
            i++
        ) {

            workers.push(worker());
        }

        await Promise.all(workers);
    }

    async loadImageByKey(key) {

        if (this.images[key]) {
            return this.images[key];
        }

        if (this.imagePromises[key]) {
            return this.imagePromises[key];
        }

        const src =
            this.imagePaths[key];

        if (!src) {
            throw new Error(
                `Unknown image asset: ${key}`
            );
        }

        const promise =
            this.loadImage(src, {
                priority: "high"
            });

        this.imagePromises[key] =
            promise;

        try {

            const image =
                await promise;

            this.images[key] =
                image;

            return image;

        } finally {

            delete this.imagePromises[key];
        }
    }

    /* ============================================================
       OPTIMIZED IMAGE DECODER
       ============================================================ */

    loadImage(src, options = {}) {

        return new Promise(
            (resolve, reject) => {

                const img =
                    new Image();

                /*
                 * Tell Chromium/Firefox/etc. that this image can
                 * decode asynchronously.
                 */

                img.decoding = "async";

                /*
                 * The assets are directly used by the game,
                 * so they should be fetched eagerly when this
                 * function is intentionally called.
                 */

                img.loading = "eager";

                /*
                 * fetchPriority is supported by modern browsers.
                 */

                if (
                    "fetchPriority" in img
                ) {

                    img.fetchPriority =
                        options.priority === "high"
                            ? "high"
                            : "low";
                }

                img.onload =
                    async () => {

                        try {

                            /*
                             * decode() prevents an undecoded image
                             * from suddenly stalling a frame when
                             * it first appears.
                             */

                            if (
                                this.config.decodeImages &&
                                typeof img.decode === "function"
                            ) {

                                try {
                                    await img.decode();
                                } catch (_) {
                                    /*
                                     * Some browsers can report a
                                     * decode error even though the
                                     * image is usable.
                                     */
                                }
                            }

                            resolve(img);

                        } catch (error) {

                            reject(error);
                        }
                    };

                img.onerror = () =>
                    reject(
                        new Error(
                            `Failed to load image: ${src}`
                        )
                    );

                img.src = src;
            }
        );
    }

    /* ============================================================
       IDLE OPTIONAL LOADING
       ============================================================ */

    idleLoadRemainingAssets() {

        const alreadyLoaded =
            new Set(
                Object.keys(
                    this.images
                )
            );

        const remainingImages =
            Object.keys(
                this.imagePaths
            ).filter(
                key =>
                    !alreadyLoaded.has(key)
            );

        /*
         * Usually nothing remains here because the camera
         * collection is small, but this supports future expansion.
         */

        const run =
            async () => {

                for (
                    const key of remainingImages
                ) {

                    if (
                        document.hidden
                    ) {
                        return;
                    }

                    try {

                        await this.loadImageByKey(
                            key
                        );

                    } catch (error) {

                        this.recordError(
                            "idle-image",
                            key,
                            error
                        );
                    }

                    /*
                     * Yield between expensive work.
                     */

                    await this.yieldToBrowser();
                }
            };

        if (
            "requestIdleCallback" in window
        ) {

            requestIdleCallback(
                () => run(),
                {
                    timeout: 2500
                }
            );

        } else {

            setTimeout(
                run,
                100
            );
        }
    }

    /* ============================================================
       AUDIO OBJECT PREPARATION
       ============================================================ */

    prepareAudioObjects() {

        for (
            const [key, src]
            of Object.entries(this.soundPaths)
        ) {

            const meta =
                this.soundMeta[key] || {
                    type: "sfx",
                    preload: "none",
                    pool:
                        this.config.defaultSfxPoolSize
                };

            /*
             * Long tracks get one HTMLAudioElement.
             */

            if (
                meta.type === "music" ||
                meta.type === "ambient" ||
                meta.type === "static"
                    && meta.pool === 1
            ) {

                const audio =
                    this.createAudioElement(
                        src,
                        meta.preload
                    );

                this.sounds[key] =
                    audio;

                if (
                    meta.type === "music" ||
                    meta.type === "ambient"
                ) {

                    this.activeLongAudio.add(
                        audio
                    );
                }

                continue;
            }

            /*
             * Short SFX use a small pool.
             */

            const poolSize =
                meta.pool ||
                this.config.defaultSfxPoolSize;

            this.audioPools[key] =
                [];

            for (
                let i = 0;
                i < poolSize;
                i++
            ) {

                this.audioPools[key].push(
                    this.createAudioElement(
                        src,
                        meta.preload
                    )
                );
            }

            /*
             * Keep the first member accessible through the
             * old this.sounds[key] API so existing game code
             * doesn't break.
             */

            this.sounds[key] =
                this.audioPools[key][0];
        }
    }

    createAudioElement(
        src,
        preload = "none"
    ) {

        const audio =
            new Audio();

        audio.src = src;

        /*
         * Critical performance difference:
         *
         * new Audio(url) defaults to auto preloading.
         * We explicitly choose what should be fetched.
         */

        audio.preload =
            preload;

        audio.autoplay = false;

        audio.controls = false;

        /*
         * Avoid unnecessary spatial work.
         */

        audio.playsInline = true;

        audio.volume = 0;

        audio.addEventListener(
            "error",
            () => {

                this.recordError(
                    "audio",
                    src,
                    audio.error
                );
            },
            {
                passive: true
            }
        );

        return audio;
    }

    /* ============================================================
       PREPARE SOUND METADATA
       ============================================================ */

    async prepareSounds(keys) {

        const uniqueKeys = [
            ...new Set(keys)
        ];

        for (
            const key
            of uniqueKeys
        ) {

            const audio =
                this.sounds[key];

            if (!audio) {
                continue;
            }

            /*
             * Calling load() here respects the chosen preload
             * policy rather than forcing "auto".
             */

            try {

                audio.load();

            } catch (_) {}

            /*
             * Do not wait for entire music files.
             */

            await this.yieldToBrowser();
        }
    }

    /* ============================================================
       WEB AUDIO UNLOCK
       ============================================================ */

    installAudioUnlock() {

        const unlock =
            async () => {

                await this.ensureAudioContext();

                /*
                 * Only install once.
                 */

                window.removeEventListener(
                    "pointerdown",
                    unlock
                );

                window.removeEventListener(
                    "keydown",
                    unlock
                );

                window.removeEventListener(
                    "touchstart",
                    unlock
                );
            };

        window.addEventListener(
            "pointerdown",
            unlock,
            {
                passive: true,
                once: true
            }
        );

        window.addEventListener(
            "keydown",
            unlock,
            {
                passive: true,
                once: true
            }
        );

        window.addEventListener(
            "touchstart",
            unlock,
            {
                passive: true,
                once: true
            }
        );
    }

    async ensureAudioContext() {

        if (
            !this.config.enableWebAudio
        ) {
            return null;
        }

        if (!this.audioContext) {

            const AudioContextClass =
                window.AudioContext ||
                window.webkitAudioContext;

            if (!AudioContextClass) {
                return null;
            }

            try {

                this.audioContext =
                    new AudioContextClass();

            } catch (_) {

                this.audioContext = null;

                return null;
            }
        }

        if (
            this.audioContext.state ===
            "suspended"
        ) {

            try {

                await this.audioContext.resume();

            } catch (_) {}
        }

        return this.audioContext;
    }

    /* ============================================================
       WEB AUDIO SFX PRELOADER
       ============================================================ */

    async loadAudioBuffer(key) {

        if (
            this.audioBuffers[key]
        ) {

            return this.audioBuffers[key];
        }

        if (
            this.audioBufferPromises[key]
        ) {

            return this.audioBufferPromises[key];
        }

        const context =
            await this.ensureAudioContext();

        if (!context) {
            return null;
        }

        const src =
            this.soundPaths[key];

        if (!src) {
            return null;
        }

        const promise =
            fetch(
                src,
                {
                    cache: "force-cache"
                }
            )
            .then(
                response => {

                    if (!response.ok) {

                        throw new Error(
                            `Audio HTTP ${response.status}`
                        );
                    }

                    return response.arrayBuffer();
                }
            )
            .then(
                data =>
                    context.decodeAudioData(
                        data
                    )
            )
            .then(
                buffer => {

                    this.audioBuffers[key] =
                        buffer;

                    return buffer;
                }
            );

        this.audioBufferPromises[key] =
            promise;

        try {

            return await promise;

        } catch (error) {

            this.recordError(
                "web-audio",
                key,
                error
            );

            return null;

        } finally {

            delete this.audioBufferPromises[key];
        }
    }

    /* ============================================================
       FAST WEB AUDIO SFX
       ============================================================ */

    async playBuffer(
        key,
        volume = 1,
        options = {}
    ) {

        const context =
            await this.ensureAudioContext();

        if (!context) {
            return false;
        }

        const buffer =
            await this.loadAudioBuffer(
                key
            );

        if (!buffer) {
            return false;
        }

        try {

            const source =
                context.createBufferSource();

            const gain =
                context.createGain();

            source.buffer =
                buffer;

            gain.gain.value =
                this.getEffectiveVolume(
                    key,
                    volume
                );

            source.connect(gain);

            gain.connect(
                context.destination
            );

            if (
                options.detune
            ) {

                source.detune.value =
                    options.detune;
            }

            if (
                options.playbackRate
            ) {

                source.playbackRate.value =
                    options.playbackRate;
            }

            source.start(
                0,
                options.offset || 0
            );

            return true;

        } catch (error) {

            this.recordError(
                "buffer-play",
                key,
                error
            );

            return false;
        }
    }

    /* ============================================================
       GET POOLED AUDIO INSTANCE
       ============================================================ */

    getPooledAudio(key) {

        const pool =
            this.audioPools[key];

        if (
            !pool ||
            pool.length === 0
        ) {

            return this.sounds[key] || null;
        }

        /*
         * Prefer an element that isn't currently playing.
         */

        const free =
            pool.find(
                audio =>
                    audio.paused ||
                    audio.ended
            );

        if (free) {
            return free;
        }

        /*
         * All instances are busy.

         * Use the least progressed instance.
         * This is much better than spawning unlimited Audio
         * elements during repeated static/jumpscare events.
         */

        return pool.reduce(
            (
                oldest,
                audio
            ) =>
                audio.currentTime <
                oldest.currentTime
                    ? audio
                    : oldest
        );
    }

    /* ============================================================
       EFFECTIVE VOLUME
       ============================================================ */

    getEffectiveVolume(
        key,
        requestedVolume = 1
    ) {

        const meta =
            this.soundMeta[key];

        const category =
            meta?.type || "sfx";

        const categoryVolume =
            this.categoryVolumes[
                category
            ] ?? 1;

        return Math.max(
            0,
            Math.min(
                1,
                requestedVolume *
                categoryVolume *
                this.masterVolume
            )
        );
    }

    /* ============================================================
       PLAY SOUND
       ============================================================ */

    async playSound(
        key,
        loop = false,
        volume = 1
    ) {

        const meta =
            this.soundMeta[key];

        /*
         * Try Web Audio for short effects.

         * Long loops/music remain HTMLAudioElements.
         */

        if (
            this.config.enableWebAudio &&
            meta?.type === "sfx"
        ) {

            const result =
                await this.playBuffer(
                    key,
                    volume
                );

            if (result) {
                return;
            }
        }

        /*
         * HTMLAudio fallback / music path.
         */

        const audio =
            this.getPooledAudio(key);

        if (!audio) {
            return;
        }

        try {

            audio.loop =
                Boolean(loop);

            audio.volume =
                this.getEffectiveVolume(
                    key,
                    volume
                );

            /*
             * If the browser has not fetched it yet,
             * initiate loading at the moment it's actually needed.
             */

            if (
                audio.readyState === 0
            ) {

                audio.load();
            }

            /*
             * Rewind pooled SFX only.
             */

            if (
                !loop
            ) {

                try {
                    audio.currentTime = 0;
                } catch (_) {}
            }

            const promise =
                audio.play();

            /*
             * play() returns a promise in modern browsers.
             */

            if (
                promise &&
                typeof promise.catch === "function"
            ) {

                promise.catch(
                    error => {

                        this.log(
                            `Audio play blocked: ${key}`,
                            error
                        );
                    }
                );
            }

        } catch (error) {

            this.recordError(
                "play",
                key,
                error
            );
        }
    }

    /* ============================================================
       STOP SOUND
       ============================================================ */

    stopSound(key) {

        /*
         * Stop every pooled instance.
         */

        const pool =
            this.audioPools[key];

        if (pool) {

            for (
                const audio
                of pool
            ) {

                try {

                    audio.pause();
                    audio.currentTime = 0;

                } catch (_) {}
            }
        }

        /*
         * Stop non-pooled audio too.
         */

        const audio =
            this.sounds[key];

        if (audio) {

            try {

                audio.pause();
                audio.currentTime = 0;

            } catch (_) {}
        }
    }

    /* ============================================================
       STOP EVERYTHING
       ============================================================ */

    stopAllSounds() {

        for (
            const key
            of Object.keys(
                this.sounds
            )
        ) {

            this.stopSound(key);
        }

        for (
            const key
            of Object.keys(
                this.audioPools
            )
        ) {

            this.stopSound(key);
        }
    }

    /* ============================================================
       VOLUME
       ============================================================ */

    setSoundVolume(
        key,
        volume
    ) {

        const value =
            this.getEffectiveVolume(
                key,
                volume
            );

        const pool =
            this.audioPools[key];

        if (pool) {

            for (
                const audio
                of pool
            ) {

                audio.volume =
                    value;
            }
        }

        const audio =
            this.sounds[key];

        if (audio) {

            audio.volume =
                value;
        }
    }

    setMasterVolume(
        volume
    ) {

        this.masterVolume =
            Math.max(
                0,
                Math.min(
                    1,
                    volume
                )
            );

        this.refreshAllVolumes();
    }

    setCategoryVolume(
        category,
        volume
    ) {

        if (
            !(category in
            this.categoryVolumes)
        ) {
            return;
        }

        this.categoryVolumes[
            category
        ] =
            Math.max(
                0,
                Math.min(
                    1,
                    volume
                )
            );

        this.refreshAllVolumes();
    }

    refreshAllVolumes() {

        for (
            const key
            of Object.keys(
                this.sounds
            )
        ) {

            const audio =
                this.sounds[key];

            if (!audio) {
                continue;
            }

            /*
             * Preserve current requested volume where possible.
             */

            const meta =
                this.soundMeta[key];

            const category =
                meta?.type || "sfx";

            const categoryVolume =
                this.categoryVolumes[
                    category
                ] ?? 1;

            const currentRequested =
                audio.volume /
                Math.max(
                    0.0001,
                    categoryVolume *
                    this.masterVolume
                );

            audio.volume =
                this.getEffectiveVolume(
                    key,
                    currentRequested
                );
        }
    }

    /* ============================================================
       TAB VISIBILITY
       ============================================================ */

    handleVisibilityChange() {

        if (
            document.hidden
        ) {

            this.wasPlayingBeforeHidden.clear();

            /*
             * Pause long-form audio.
             * Short SFX are left alone because they're usually
             * one-shot events and will finish naturally.
             */

            for (
                const audio
                of this.activeLongAudio
            ) {

                if (
                    !audio.paused
                ) {

                    this.wasPlayingBeforeHidden.add(
                        audio
                    );

                    try {

                        audio.pause();

                    } catch (_) {}
                }
            }

            return;
        }

        /*
         * Resume only what was actually playing.
         */

        for (
            const audio
            of this.wasPlayingBeforeHidden
        ) {

            try {

                const promise =
                    audio.play();

                if (
                    promise?.catch
                ) {

                    promise.catch(
                        () => {}
                    );
                }

            } catch (_) {}
        }

        this.wasPlayingBeforeHidden.clear();
    }

    /* ============================================================
       PRELOAD A SPECIFIC SOUND
       ============================================================ */

    async preloadSound(
        key,
        useWebAudio = false
    ) {

        if (
            !this.soundPaths[key]
        ) {

            return false;
        }

        if (
            useWebAudio &&
            this.soundMeta[key]?.type === "sfx"
        ) {

            return Boolean(
                await this.loadAudioBuffer(
                    key
                )
            );
        }

        const pool =
            this.audioPools[key];

        const audio =
            pool?.[0] ||
            this.sounds[key];

        if (!audio) {
            return false;
        }

        try {

            audio.load();

            return true;

        } catch (_) {

            return false;
        }
    }

    /* ============================================================
       UNLOAD / RELEASE
       ============================================================ */

    releaseImage(key) {

        const image =
            this.images[key];

        if (!image) {
            return;
        }

        /*
         * Release browser-held image resource when appropriate.

         * This does not delete files from disk.
         */

        try {

            image.src = "";

        } catch (_) {}

        delete this.images[key];
    }

    releaseAudioBuffer(key) {

        delete this.audioBuffers[key];
    }

    /* ============================================================
       BROWSER YIELD
       ============================================================ */

    yieldToBrowser() {

        /*
         * requestAnimationFrame gives rendering a chance to happen
         * before another expensive task begins.
         */

        return new Promise(
            resolve => {

                if (
                    typeof requestAnimationFrame ===
                    "function"
                ) {

                    requestAnimationFrame(
                        () => resolve()
                    );

                } else {

                    setTimeout(
                        resolve,
                        0
                    );
                }
            }
        );
    }

    /* ============================================================
       ERROR REPORTING
       ============================================================ */

    recordError(
        type,
        key,
        error
    ) {

        this.assetErrors.push({

            type,
            key,
            error,
            time:
                performance.now()
        });

        console.warn(
            `[AssetManager] ${type} failed: ${key}`,
            error
        );
    }

    /* ============================================================
       DEBUG
       ============================================================ */

    log(...args) {

        if (
            this.config.debug
        ) {

            console.debug(
                "[AssetManager]",
                ...args
            );
        }
    }
}
