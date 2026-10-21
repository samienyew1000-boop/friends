/**
 * JetX Audio Engine
 * Plays the authentic sound assets directly from the original target game.
 */
class SoundEngine {
    constructor() {
        this.enabled = true;
        this.isInitialized = false;

        // Authentic audio files downloaded directly from target CDN
        this.sounds = {
            takeoff: new Audio('./assets/audio/planeTakeoff.mp3'),
            boom: new Audio('./assets/audio/boom.mp3'),
            multiplier2x: new Audio('./assets/audio/multiplier2X.mp3'),
            multiplier5x: new Audio('./assets/audio/multiplier5X.mp3'),
            multiplier10x: new Audio('./assets/audio/multiplier10X.mp3'),
            multiplier50x: new Audio('./assets/audio/multiplier50X.mp3'),
            multiplier100x: new Audio('./assets/audio/multiplier100X.mp3'),
            collect: new Audio('./assets/audio/collect.mp3'),
            win: new Audio('./assets/audio/win.mp3'),
            placeBet: new Audio('./assets/audio/placeBet.mp3'),
            button: new Audio('./assets/audio/button.mp3'),
            countdown: new Audio('./assets/audio/countdown.mp3'),
            flightLoop: new Audio('./assets/audio/loop1.mp3')
        };

        // Configure loop
        if (this.sounds.flightLoop) {
            this.sounds.flightLoop.loop = true;
            this.sounds.flightLoop.volume = 0.4;
        }

        // Set volumes
        this.sounds.takeoff.volume = 0.6;
        this.sounds.boom.volume = 0.8;
        this.sounds.collect.volume = 0.7;
        this.sounds.win.volume = 0.6;
        this.sounds.button.volume = 0.4;
        this.sounds.countdown.volume = 0.5;

        // Auto-initialize upon user interaction
        const initAudio = () => {
            if (this.isInitialized) return;
            this.isInitialized = true;
            // Pre-warm audio elements
            Object.values(this.sounds).forEach(audio => {
                audio.load();
            });
            window.removeEventListener('click', initAudio);
            window.removeEventListener('keydown', initAudio);
        };

        window.addEventListener('click', initAudio, { once: true });
        window.addEventListener('keydown', initAudio, { once: true });
    }

    toggleMute() {
        this.enabled = !this.enabled;
        if (!this.enabled) {
            this.stopFlightHum();
        }
        return this.enabled;
    }

    play(name) {
        if (!this.enabled) return;
        const audio = this.sounds[name];
        if (audio) {
            try {
                audio.currentTime = 0;
                audio.play().catch(() => {});
            } catch (e) {}
        }
    }

    playClick() {
        this.play('button');
    }

    playTakeoff() {
        this.play('takeoff');
        setTimeout(() => {
            if (this.enabled) {
                this.startFlightHum();
            }
        }, 600);
    }

    startFlightHum() {
        if (!this.enabled) return;
        try {
            this.sounds.flightLoop.currentTime = 0;
            this.sounds.flightLoop.play().catch(() => {});
        } catch (e) {}
    }

    stopFlightHum() {
        try {
            this.sounds.flightLoop.pause();
            this.sounds.flightLoop.currentTime = 0;
        } catch (e) {}
    }

    playCashout() {
        this.play('collect');
    }

    playBoom() {
        this.stopFlightHum();
        this.play('boom');
    }

    playMilestone(mult) {
        if (mult >= 100) this.play('multiplier100x');
        else if (mult >= 50) this.play('multiplier50x');
        else if (mult >= 10) this.play('multiplier10x');
        else if (mult >= 5) this.play('multiplier5x');
        else if (mult >= 2) this.play('multiplier2x');
    }
}

window.soundEngine = new SoundEngine();
