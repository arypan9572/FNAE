// ============================================================
// 静态噪点效果 / Static Noise
// Optimized for:
// - Very low CPU overhead
// - Low memory allocation
// - Reusable ImageData buffer
// - Configurable static FPS
// - Adaptive canvas resolution
// - High-DPI display support
// - Resize handling without excessive work
// - Proper cleanup
// - Preserved TV snow appearance
// ============================================================

class StaticNoise {
    constructor(options = {}) {
        // ====================================================
        // Canvas
        // ====================================================

        this.canvas =
            document.getElementById('static-canvas');

        if (!this.canvas) {
            console.error(
                'StaticNoise: #static-canvas not found.'
            );

            return;
        }

        this.ctx =
            this.canvas.getContext('2d', {
                alpha: true
            });

        if (!this.ctx) {
            console.error(
                'StaticNoise: Unable to create 2D context.'
            );

            return;
        }

        // ====================================================
        // Configuration
        // ====================================================

        this.fps =
            typeof options.fps === 'number'
                ? Math.max(1, options.fps)
                : 30;

        // Resolution multiplier.
        //
        // 1 = full resolution
        // 0.5 = half resolution
        //
        // Static noise does not need a pixel-perfect buffer,
        // so half resolution can dramatically reduce CPU usage
        // while still looking like TV snow.
        this.resolutionScale =
            typeof options.resolutionScale === 'number'
                ? Math.max(
                    0.1,
                    Math.min(1, options.resolutionScale)
                )
                : 0.5;

        // High-DPI multiplier.
        //
        // Capped to prevent a 4x or 5x devicePixelRatio from
        // creating enormous ImageData buffers.
        this.maxDevicePixelRatio = 2;

        // Maximum canvas dimensions as an additional safety net.
        this.maxWidth = 1920;
        this.maxHeight = 1080;

        // ====================================================
        // State
        // ====================================================

        this.isRunning = false;
        this.animationId = null;

        this.lastFrameTime = 0;

        this.imageData = null;
        this.data = null;

        this.bufferWidth = 0;
        this.bufferHeight = 0;

        this.dirty = true;

        this.isDestroyed = false;

        // ====================================================
        // Resize state
        // ====================================================

        this.resizeTimeout = null;

        // Stable event reference so destroy() can remove it.
        this.boundResize = this.handleResize.bind(this);

        // ====================================================
        // Bind resize
        // ====================================================

        window.addEventListener(
            'resize',
            this.boundResize,
            {
                passive: true
            }
        );

        // ====================================================
        // Initial size
        // ====================================================

        this.resize();

        // ====================================================
        // Prepare canvas
        // ====================================================

        this.canvas.style.display = 'none';

        this.canvas.style.pointerEvents = 'none';

        this.canvas.style.position = 'fixed';

        this.canvas.style.inset = '0';

        this.canvas.style.width = '100%';

        this.canvas.style.height = '100%';

        this.canvas.style.zIndex = '9998';
    }

    // ========================================================
    // Resize handler
    // ========================================================

    handleResize() {
        if (this.isDestroyed) {
            return;
        }

        // Browsers can fire many resize events during a resize.
        // Debouncing avoids repeatedly reallocating ImageData.
        if (this.resizeTimeout !== null) {
            clearTimeout(this.resizeTimeout);
        }

        this.resizeTimeout = setTimeout(() => {
            this.resizeTimeout = null;

            if (!this.isDestroyed) {
                this.resize();
            }
        }, 50);
    }

    // ========================================================
    // Resize canvas
    // ========================================================

    resize() {
        if (
            !this.canvas ||
            !this.ctx ||
            this.isDestroyed
        ) {
            return;
        }

        const viewportWidth =
            Math.max(
                1,
                window.innerWidth || 1
            );

        const viewportHeight =
            Math.max(
                1,
                window.innerHeight || 1
            );

        // ----------------------------------------------------
        // Calculate DPR safely
        // ----------------------------------------------------

        const devicePixelRatio =
            Math.min(
                window.devicePixelRatio || 1,
                this.maxDevicePixelRatio
            );

        // ----------------------------------------------------
        // Apply resolution scale
        // ----------------------------------------------------

        let width =
            Math.round(
                viewportWidth *
                devicePixelRatio *
                this.resolutionScale
            );

        let height =
            Math.round(
                viewportHeight *
                devicePixelRatio *
                this.resolutionScale
            );

        // ----------------------------------------------------
        // Safety limits
        // ----------------------------------------------------

        width = Math.min(
            Math.max(width, 1),
            this.maxWidth
        );

        height = Math.min(
            Math.max(height, 1),
            this.maxHeight
        );

        // ----------------------------------------------------
        // Avoid reallocating if dimensions didn't change.
        // ----------------------------------------------------

        if (
            width === this.bufferWidth &&
            height === this.bufferHeight &&
            this.imageData
        ) {
            return;
        }

        this.bufferWidth = width;
        this.bufferHeight = height;

        // ----------------------------------------------------
        // Resize actual drawing buffer
        // ----------------------------------------------------

        this.canvas.width = width;
        this.canvas.height = height;

        // ----------------------------------------------------
        // Create reusable ImageData buffer
        //
        // This is a major optimization over creating a new
        // ImageData object on every frame.
        // ----------------------------------------------------

        this.imageData =
            this.ctx.createImageData(
                width,
                height
            );

        this.data =
            this.imageData.data;

        // Tell animation loop the buffer needs refreshing.
        this.dirty = true;
    }

    // ========================================================
    // Start
    // ========================================================

    start() {
        if (
            this.isRunning ||
            this.isDestroyed ||
            !this.ctx
        ) {
            return;
        }

        // Recalculate dimensions in case the window changed
        // before the effect was started.
        this.resize();

        this.isRunning = true;

        this.canvas.style.display = 'block';

        // Reset timing so the first frame happens immediately.
        this.lastFrameTime = 0;

        // Start only one animation loop.
        this.animationId =
            requestAnimationFrame(
                this.boundAnimate.bind(this)
            );
    }

    // ========================================================
    // Stop
    // ========================================================

    stop() {
        if (!this.isRunning) {
            // Still make sure the canvas isn't accidentally
            // left visible.
            if (this.canvas) {
                this.canvas.style.display = 'none';
            }

            return;
        }

        this.isRunning = false;

        if (this.canvas) {
            this.canvas.style.display = 'none';
        }

        if (this.animationId !== null) {
            cancelAnimationFrame(
                this.animationId
            );

            this.animationId = null;
        }

        this.lastFrameTime = 0;
    }

    // ========================================================
    // Animation loop
    // ========================================================

    boundAnimate(timestamp) {
        this.animate(timestamp);
    }

    animate(timestamp) {
        if (
            !this.ctx ||
            !this.isRunning ||
            this.isDestroyed
        ) {
            this.animationId = null;
            return;
        }

        // ====================================================
        // FPS limiter
        // ====================================================

        const frameInterval =
            1000 / this.fps;

        // ----------------------------------------------------
        // Skip unnecessary frames.
        //
        // requestAnimationFrame may run at 60, 120, 144,
        // 165, 240 Hz, etc. Static noise doesn't need to
        // regenerate that frequently.
        // ----------------------------------------------------

        if (
            this.lastFrameTime !== 0 &&
            timestamp - this.lastFrameTime <
                frameInterval
        ) {
            this.animationId =
                requestAnimationFrame(
                    this.boundAnimate
                );

            return;
        }

        this.lastFrameTime = timestamp;

        // ====================================================
        // Generate noise
        // ====================================================

        this.generateNoise();

        // ====================================================
        // Draw
        // ====================================================

        this.ctx.putImageData(
            this.imageData,
            0,
            0
        );

        // ====================================================
        // Continue
        // ====================================================

        this.animationId =
            requestAnimationFrame(
                this.boundAnimate
            );
    }

    // ========================================================
    // Generate noise
    // ========================================================

    generateNoise() {
        if (!this.data) {
            return;
        }

        const data = this.data;

        // ----------------------------------------------------
        // Generate one grayscale value for each pixel.
        //
        // Alpha is also randomized to preserve the original
        // translucent TV-static look.
        // ----------------------------------------------------

        for (
            let i = 0;
            i < data.length;
            i += 4
        ) {
            const value =
                Math.random() < 0.5
                    ? 0
                    : 255;

            data[i] = value;
            data[i + 1] = value;
            data[i + 2] = value;

            // Original behavior:
            // random alpha from 0 to 255.
            data[i + 3] =
                Math.random() * 255;
        }
    }

    // ========================================================
    // Optional intensity control
    //
    // This doesn't change the current default appearance,
    // but lets you tune the effect later.
    // ========================================================

    setFPS(fps) {
        if (
            typeof fps !== 'number' ||
            !Number.isFinite(fps)
        ) {
            return;
        }

        this.fps =
            Math.max(
                1,
                Math.min(120, fps)
            );
    }

    setResolutionScale(scale) {
        if (
            typeof scale !== 'number' ||
            !Number.isFinite(scale)
        ) {
            return;
        }

        this.resolutionScale =
            Math.max(
                0.1,
                Math.min(1, scale)
            );

        // Force a new buffer allocation.
        this.bufferWidth = 0;
        this.bufferHeight = 0;

        this.resize();
    }

    // ========================================================
    // Cleanup
    // ========================================================

    destroy() {
        if (this.isDestroyed) {
            return;
        }

        this.isDestroyed = true;

        // Stop animation.
        this.stop();

        // Cancel resize debounce.
        if (this.resizeTimeout !== null) {
            clearTimeout(
                this.resizeTimeout
            );

            this.resizeTimeout = null;
        }

        // Remove resize listener.
        window.removeEventListener(
            'resize',
            this.boundResize
        );

        // Clear drawing buffer references.
        this.imageData = null;
        this.data = null;
        this.ctx = null;
        this.canvas = null;
    }
}
