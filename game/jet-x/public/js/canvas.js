/**
 * JetX Canvas Flight & Animation Engine
 * Multi-layer authentic parallax background matching SmartSoft JetX:
 * - Pre-flight Airport Tarmac: Terminal, Control Tower, Dual Hangars (Left & Right),
 *   Security Fence, Ocean, Walking Astronaut Crew, and Parked Jet with Landing Gear.
 * - Flight & Altitude: Clouds 1 & 2, Ozone, Deep Space Stars, Celestial Planets, Speed Streaks.
 * - Round End: Supersonic "FLEW AWAY" hyper-speed escape!
 */
class FlightCanvas {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');

        this.width = 0;
        this.height = 0;
        this.dpr = window.devicePixelRatio || 1;

        // Visual States: 'WAITING', 'TAKEOFF', 'FLYING', 'FLEW_AWAY'
        this.state = 'WAITING';
        this.currentMultiplier = 1.00;
        this.targetMultiplier = 1.00;

        // --- Authentic Image Assets ---
        this.images = {};
        this.loadAssets();

        // --- Jet Coordinates & Flight Physics ---
        this.jet = {
            x: 0,
            y: 0,
            targetX: 0,
            targetY: 0,
            rotation: 0,
            gearProgress: 1, // 1 = down, 0 = retracted
            particles: []
        };

        // --- Flew Away Escape State ("birerer bilo emitefaw") ---
        this.isFlewAway = false;
        this.flewAwayElapsed = 0;

        // --- Tarmac Walking Astronaut Crew ---
        this.tarmacCrew = [
            { xOffset: -120, speed: 22, frame: 0 },
            { xOffset: -75, speed: 22, frame: 4 },
            { xOffset: -30, speed: 22, frame: 8 },
            { xOffset: 25, speed: 22, frame: 2 }
        ];

        // --- Parachutists ---
        this.parachutists = [];

        // --- Parallax Environment Offsets & Altitude ---
        this.groundOffset = 0;
        this.cloud1Offset = 0;
        this.cloud2Offset = 0;
        this.ozoneOffset = 0;
        this.starsOffset = 0;
        this.spaceAlpha = 0;

        // Planets state
        this.planets = [
            { id: 0, x: -300, y: 100, speed: 18, size: 75, minMult: 4.0, imgKey: 'planet0' },
            { id: 1, x: -500, y: 70, speed: 22, size: 90, minMult: 8.0, imgKey: 'planet1' },
            { id: 2, x: -700, y: 130, speed: 15, size: 140, minMult: 14.0, imgKey: 'planet2' },
            { id: 3, x: -600, y: 190, speed: 25, size: 100, minMult: 20.0, imgKey: 'planet3' },
            { id: 4, x: -800, y: 80, speed: 12, size: 85, minMult: 30.0, imgKey: 'planet4' },
            { id: 5, x: -900, y: 150, speed: 20, size: 110, minMult: 45.0, imgKey: 'planet5' },
        ];

        // Atmospheric speed streaks
        this.speedStreaks = [];
        for (let i = 0; i < 35; i++) {
            this.speedStreaks.push({
                x: Math.random() * 1200,
                y: Math.random() * 800,
                length: 50 + Math.random() * 120,
                speed: 450 + Math.random() * 600,
                alpha: 0.15 + Math.random() * 0.35
            });
        }

        // Setup resize observer
        this.resize();
        window.addEventListener('resize', () => this.resize());

        // Start render loop
        this.lastTime = performance.now();
        this.animate = this.animate.bind(this);
        requestAnimationFrame(this.animate);
    }

    loadAssets() {
        const manifest = {
            plane: './assets/images/jet_plane.png',
            flame: './assets/images/jet_flame.png',
            airport: './assets/images/Airport.png',
            road: './assets/images/Road.png',
            garage: './assets/images/Garage.png',
            fence: './assets/images/Fence.png',
            ocean: './assets/images/Ocean.png',
            spaceman: './assets/images/Spaceman0.png',
            clouds1: './assets/images/Clouds1.png',
            clouds2: './assets/images/Clouds2.png',
            ozone: './assets/images/Ozone.png',
            stars: './assets/images/Stars.png',
            starsWhite: './assets/images/StarsWhite.png',
            planet0: './assets/images/Planet0.png',
            planet1: './assets/images/Planet1.png',
            planet2: './assets/images/Planet2.png',
            planet3: './assets/images/Planet3.png',
            planet4: './assets/images/Planet4.png',
            planet5: './assets/images/Planet5.png',
        };

        this.loadedCount = 0;
        this.totalAssets = Object.keys(manifest).length;

        for (const [key, src] of Object.entries(manifest)) {
            const img = new Image();
            img.src = src;
            img.onload = () => {
                this.images[key] = img;
                this.loadedCount++;
            };
        }
    }

    resize() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.width = rect.width;
        this.height = rect.height;

        this.canvas.width = this.width * this.dpr;
        this.canvas.height = this.height * this.dpr;
        this.ctx.scale(this.dpr, this.dpr);

        if (this.state === 'WAITING') {
            this.resetJetPosition();
        }
    }

    resetJetPosition() {
        // Tarmac level is at 60% of stage height
        const runwayY = this.height * 0.60;
        this.jet.x = this.width * 0.38;
        this.jet.y = runwayY - 4; // parked on the tarmac with wheels on ground
        this.jet.targetX = this.jet.x;
        this.jet.targetY = this.jet.y;
        this.jet.rotation = 0;
        this.jet.gearProgress = 1;
        this.spaceAlpha = 0;
        this.groundOffset = 0;
        this.cloud1Offset = 0;
        this.cloud2Offset = 0;
        this.ozoneOffset = 0;
        this.starsOffset = 0;
        this.isFlewAway = false;
        this.flewAwayElapsed = 0;
        this.parachutists = [];

        // Reset planets offscreen
        this.planets.forEach((p, idx) => {
            p.x = this.width + 120 + (idx * 260);
        });
    }

    setState(newState, multiplier = 1.00) {
        this.state = newState;
        if (newState === 'WAITING') {
            this.resetJetPosition();
        } else if (newState === 'TAKEOFF') {
            this.jet.gearProgress = 0;
            this.isFlewAway = false;
        } else if (newState === 'BOOM' || newState === 'FLEW_AWAY') {
            // Trigger supersonic escape ("birerer bilo nw emitefaw")
            this.isFlewAway = true;
            this.flewAwayElapsed = 0;
        }
    }

    updateMultiplier(val, nextVal) {
        this.currentMultiplier = val;
        this.targetMultiplier = nextVal || val;

        if (this.currentMultiplier > 1.8) {
            this.spaceAlpha = Math.min(1.0, (this.currentMultiplier - 1.8) / 6.0);
        } else {
            this.spaceAlpha = 0;
        }
    }

    spawnParachutist(amount, player = 'Player') {
        if (this.state !== 'FLYING') return;

        this.parachutists.push({
            x: this.jet.x - 35 - Math.random() * 20,
            y: this.jet.y + 12 + Math.random() * 15,
            vx: -1.8 - (Math.random() * 0.8),
            vy: 1.2 + (Math.random() * 0.6),
            swingAngle: Math.random() * Math.PI,
            swingSpeed: 0.04 + Math.random() * 0.03,
            amount: amount,
            player: player,
            opacity: 1
        });
    }

    animate(now) {
        const dt = (now - this.lastTime) / 1000;
        this.lastTime = now;

        this.update(dt);
        this.draw();

        requestAnimationFrame(this.animate);
    }

    update(dt) {
        // 1. Tarmac astronaut walk animation
        if (this.state === 'WAITING') {
            this.tarmacCrew.forEach(c => {
                c.xOffset += c.speed * dt;
                c.frame += 12 * dt;
                if (c.xOffset > 180) {
                    c.xOffset = -180;
                }
            });
        }

        // 2. Parallax environment movement when in flight or flying away
        if (this.state === 'FLYING' || this.state === 'TAKEOFF' || this.isFlewAway) {
            const speedFactor = this.isFlewAway ? 4.5 : Math.min(2.5, 1.0 + Math.log10(Math.max(1, this.currentMultiplier)));
            this.groundOffset += 320 * speedFactor * dt;
            this.cloud1Offset += 240 * speedFactor * dt;
            this.cloud2Offset += 160 * speedFactor * dt;
            this.ozoneOffset += 80 * speedFactor * dt;
            this.starsOffset += 45 * speedFactor * dt;

            // Update planets drift
            this.planets.forEach(p => {
                if (this.currentMultiplier >= p.minMult) {
                    p.x -= p.speed * speedFactor * dt;
                    if (p.x < -250) {
                        p.x = this.width + 200 + Math.random() * 300;
                        p.y = 40 + Math.random() * (this.height * 0.45);
                    }
                }
            });

            // Update atmospheric speed streaks
            this.speedStreaks.forEach(s => {
                s.x -= s.speed * speedFactor * dt;
                s.y += (s.speed * 0.35) * speedFactor * dt;
                if (s.x < -150 || s.y > this.height + 50) {
                    s.x = this.width + 100 + Math.random() * 200;
                    s.y = Math.random() * (this.height * 0.8) - 100;
                }
            });
        }

        // 3. Flight Trajectory or "FLEW AWAY" warp speed escape
        if (this.isFlewAway) {
            this.flewAwayElapsed += dt;
            const boost = 1.0 + Math.pow(this.flewAwayElapsed * 3.0, 2.5);
            this.jet.rotation = -0.36; // pitch up ~21 degrees
            this.jet.x += 1600 * boost * dt;
            this.jet.y -= 620 * boost * dt;
        } else if (this.state === 'TAKEOFF') {
            this.jet.targetX = this.width * 0.42;
            this.jet.targetY = this.height * 0.45;
            this.jet.rotation = -0.22; // pitch up ~13 deg
            this.jet.x += (this.jet.targetX - this.jet.x) * (4 * dt);
            this.jet.y += (this.jet.targetY - this.jet.y) * (4 * dt);
        } else if (this.state === 'FLYING') {
            // Smooth climbing trajectory toward center-right
            const targetX = this.width * 0.50 + Math.sin(this.lastTime * 0.002) * 16;
            const targetY = this.height * 0.34 + Math.cos(this.lastTime * 0.0016) * 14;
            this.jet.targetX = targetX;
            this.jet.targetY = targetY;
            this.jet.rotation = -0.30 + Math.sin(this.lastTime * 0.0024) * 0.04;
            this.jet.x += (this.jet.targetX - this.jet.x) * (4 * dt);
            this.jet.y += (this.jet.targetY - this.jet.y) * (4 * dt);
        }

        // 4. Afterburner particle sparks
        if (this.state === 'TAKEOFF' || this.state === 'FLYING' || (this.isFlewAway && this.jet.x < this.width + 100)) {
            const count = this.isFlewAway ? 5 : 2;
            for (let i = 0; i < count; i++) {
                const angle = this.jet.rotation + Math.PI + (Math.random() - 0.5) * 0.3;
                const speed = (this.isFlewAway ? 280 : 120) + Math.random() * 160;
                this.jet.particles.push({
                    x: this.jet.x - Math.cos(this.jet.rotation) * 45,
                    y: this.jet.y - Math.sin(this.jet.rotation) * 45,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    radius: (this.isFlewAway ? 5 : 3) + Math.random() * 5,
                    color: Math.random() > 0.3 ? '#FCDD12' : '#FC2A47',
                    life: 1.0
                });
            }
        }

        // Update jet particles
        for (let i = this.jet.particles.length - 1; i >= 0; i--) {
            const p = this.jet.particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= 4.0 * dt;
            if (p.life <= 0) {
                this.jet.particles.splice(i, 1);
            }
        }

        // Update parachutists
        for (let i = this.parachutists.length - 1; i >= 0; i--) {
            const para = this.parachutists[i];
            para.x += para.vx;
            para.y += para.vy;
            para.swingAngle += para.swingSpeed;
            if (para.y > this.height + 70 || para.x < -100) {
                this.parachutists.splice(i, 1);
            }
        }
    }

    draw() {
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;

        ctx.clearRect(0, 0, w, h);

        ctx.save();

        // 1. Sky & Atmosphere Background (Sunset twilight matching target)
        this.drawAtmosphere(ctx, w, h);

        // 2. Deep Space Stars & Cosmic Dust (in flight as multiplier rises)
        if (this.spaceAlpha > 0.05) {
            this.drawSpaceAndStars(ctx, w, h);
        }

        // 3. Celestial Planets & Moons
        if (this.spaceAlpha > 0.2) {
            this.drawPlanets(ctx);
        }

        // 4. Parallax Ozone Layer
        if (this.currentMultiplier > 2.2 && this.images.ozone) {
            this.drawOzoneLayer(ctx, w, h);
        }

        // 5. Parallax Cloud Banks (Clouds1 & Clouds2)
        if (this.spaceAlpha < 0.9) {
            this.drawClouds(ctx, w, h);
        }

        // 6. Supersonic Air Streaks
        if (this.state === 'FLYING' || this.state === 'TAKEOFF' || this.isFlewAway) {
            this.drawSpeedStreaks(ctx);
        }

        // 7. Authentic Runway Tarmac Ground & Airport (fades and descends during climb)
        if (this.spaceAlpha < 0.95) {
            this.drawRunway(ctx, w, h);
        }

        // 8. Parachutists Swarm
        this.drawParachutists(ctx);

        // 9. Thruster Exhaust Flame Particles
        this.drawThrusterParticles(ctx);

        // 10. Supersonic Jet Fighter
        if (this.jet.x < w + 200) {
            this.drawJet(ctx, this.jet.x, this.jet.y, this.jet.rotation);
        }

        ctx.restore();
    }

    drawAtmosphere(ctx, w, h) {
        // Soft dusky rose twilight sunset gradient (matching target screenshot media_1792578821619.png)
        const groundGrad = ctx.createLinearGradient(0, 0, 0, h);
        groundGrad.addColorStop(0, '#362438');
        groundGrad.addColorStop(0.35, '#5C3848');
        groundGrad.addColorStop(0.55, '#7F4B54');
        groundGrad.addColorStop(0.75, '#A46162');
        groundGrad.addColorStop(1.0, '#B37070');
        ctx.fillStyle = groundGrad;
        ctx.fillRect(0, 0, w, h);

        // Distant gentle mountains silhouette on the twilight horizon
        ctx.save();
        ctx.fillStyle = 'rgba(70, 42, 58, 0.45)';
        ctx.beginPath();
        const my = h * 0.52;
        ctx.moveTo(0, my);
        ctx.lineTo(w * 0.15, my - 25);
        ctx.lineTo(w * 0.35, my - 12);
        ctx.lineTo(w * 0.55, my - 32);
        ctx.lineTo(w * 0.75, my - 18);
        ctx.lineTo(w * 0.90, my - 28);
        ctx.lineTo(w, my - 15);
        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.fill();
        ctx.restore();

        // Deep Space Overlay (fades in as flight climbs into upper atmosphere)
        if (this.spaceAlpha > 0) {
            ctx.save();
            ctx.globalAlpha = this.spaceAlpha;

            const spaceGrad = ctx.createLinearGradient(0, 0, 0, h);
            spaceGrad.addColorStop(0, '#040409');
            spaceGrad.addColorStop(0.5, '#090915');
            spaceGrad.addColorStop(1.0, '#121225');
            ctx.fillStyle = spaceGrad;
            ctx.fillRect(0, 0, w, h);

            ctx.restore();
        }
    }

    drawSpaceAndStars(ctx, w, h) {
        ctx.save();
        ctx.globalAlpha = Math.min(1.0, this.spaceAlpha * 1.2);

        // Stars White
        if (this.images.starsWhite) {
            const img = this.images.starsWhite;
            const scrollX = -(this.starsOffset * 0.4) % img.width;
            for (let x = scrollX; x < w; x += img.width) {
                ctx.drawImage(img, x, 0, img.width, Math.min(h, img.height));
            }
        }

        // Deep nebula cosmic stars
        if (this.images.stars && this.spaceAlpha > 0.4) {
            ctx.globalAlpha = (this.spaceAlpha - 0.4) * 1.5;
            const img = this.images.stars;
            const scrollX = -(this.starsOffset * 0.7) % img.width;
            for (let x = scrollX; x < w; x += img.width) {
                ctx.drawImage(img, x, 0, img.width, Math.min(h, img.height));
            }
        }

        ctx.restore();
    }

    drawPlanets(ctx) {
        ctx.save();
        this.planets.forEach(p => {
            if (this.currentMultiplier >= p.minMult && this.images[p.imgKey]) {
                const img = this.images[p.imgKey];
                const alpha = Math.min(1.0, (this.currentMultiplier - p.minMult) / 1.5);
                ctx.globalAlpha = alpha;
                ctx.drawImage(img, p.x, p.y, p.size, (p.size * img.height) / img.width);
            }
        });
        ctx.restore();
    }

    drawOzoneLayer(ctx, w, h) {
        ctx.save();
        const ozoneAlpha = Math.sin(Math.min(1, (this.currentMultiplier - 2.2) / 6.0) * Math.PI) * 0.65;
        if (ozoneAlpha > 0.02) {
            ctx.globalAlpha = ozoneAlpha;
            const img = this.images.ozone;
            const scrollX = -(this.ozoneOffset) % (img.width * 0.7);
            const ozoneH = h * 0.6;
            const ozoneY = h * 0.15;
            for (let x = scrollX - img.width; x < w + img.width; x += img.width * 0.7) {
                ctx.drawImage(img, x, ozoneY, img.width * 0.7, ozoneH);
            }
        }
        ctx.restore();
    }

    drawClouds(ctx, w, h) {
        ctx.save();
        const cloudAlpha = Math.max(0, 1.0 - this.spaceAlpha * 1.35);
        ctx.globalAlpha = cloudAlpha;

        // 1. Clouds 2 (Denser background cumulus cloud deck)
        if (this.images.clouds2) {
            const img = this.images.clouds2;
            const scrollX = -(this.cloud2Offset) % img.width;
            const cloudY = h * 0.28 + (this.groundOffset * 0.18);
            for (let x = scrollX - img.width; x < w + img.width; x += img.width) {
                ctx.drawImage(img, x, cloudY, img.width, img.height * 0.65);
            }
        }

        // 2. Clouds 1 (Foreground wispy clouds moving faster)
        if (this.images.clouds1) {
            const img = this.images.clouds1;
            const scrollX = -(this.cloud1Offset) % (img.width * 0.9);
            const cloudY = h * 0.38 + (this.groundOffset * 0.28);
            for (let x = scrollX - img.width; x < w + img.width; x += img.width * 0.9) {
                ctx.drawImage(img, x, cloudY, img.width * 0.9, img.height * 0.7);
            }
        }

        ctx.restore();
    }

    drawSpeedStreaks(ctx) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.lineWidth = this.isFlewAway ? 2.5 : 1.5;
        this.speedStreaks.forEach(s => {
            ctx.globalAlpha = s.alpha * (this.isFlewAway ? 1.0 : (this.state === 'FLYING' ? 0.8 : 0.3));
            ctx.beginPath();
            ctx.moveTo(s.x, s.y);
            ctx.lineTo(s.x - (this.isFlewAway ? s.length * 1.8 : s.length), s.y + (this.isFlewAway ? s.length * 0.6 : s.length * 0.35));
            ctx.stroke();
        });
        ctx.restore();
    }

    drawRunway(ctx, w, h) {
        ctx.save();
        // Runway starts at 58% of stage height
        const runwayY = h * 0.58 + (this.groundOffset * 0.38);
        const runwayAlpha = Math.max(0, 1.0 - (this.currentMultiplier - 1.0) * 1.5);

        ctx.globalAlpha = runwayAlpha;
        if (runwayAlpha > 0.01 && runwayY < h + 250) {
            
            // 1. Ocean Horizon Layer
            if (this.images.ocean) {
                const img = this.images.ocean;
                const oceanY = runwayY - 38;
                const oceanH = 46;
                const oceanX = -(this.groundOffset * 0.08) % (w * 0.5);
                for (let x = oceanX - w; x < w + w; x += w * 0.5) {
                    ctx.drawImage(img, x, oceanY, w * 0.5, oceanH);
                }
            }

            // 2. Left Airport Hangars (Dual curved hangar domes)
            if (this.images.garage) {
                const img = this.images.garage;
                const gw = Math.min(220, w * 0.22);
                const gh = (gw * img.height) / img.width;
                const gx1 = w * 0.02 - (this.groundOffset * 0.12);
                const gx2 = w * 0.14 - (this.groundOffset * 0.12);
                ctx.drawImage(img, gx1, runwayY - gh + 6, gw, gh);
                ctx.drawImage(img, gx2, runwayY - gh + 6, gw, gh);
            }

            // 3. Central Airport Terminal & Control Tower
            if (this.images.airport) {
                const img = this.images.airport;
                const airportW = Math.min(480, w * 0.46);
                const airportH = (airportW * img.height) / img.width;
                const airportX = w * 0.26 - (this.groundOffset * 0.12);
                ctx.drawImage(img, airportX, runwayY - airportH + 10, airportW, airportH);
            }

            // 4. Right Airport Hangars (Dual curved hangar domes)
            if (this.images.garage) {
                const img = this.images.garage;
                const gw = Math.min(220, w * 0.22);
                const gh = (gw * img.height) / img.width;
                const gx3 = w * 0.68 - (this.groundOffset * 0.12);
                const gx4 = w * 0.80 - (this.groundOffset * 0.12);
                ctx.drawImage(img, gx3, runwayY - gh + 6, gw, gh);
                ctx.drawImage(img, gx4, runwayY - gh + 6, gw, gh);
            }

            // 5. Walking Tarmac Crew / Astronauts behind the plane
            this.drawWalkingCrew(ctx, w, runwayY);

            // 6. Security Fence & Runway Lamp Posts
            if (this.images.fence) {
                const img = this.images.fence;
                const fw = Math.min(600, w * 0.6);
                const fenceX = -(this.groundOffset * 0.25) % fw;
                for (let x = fenceX - fw; x < w + fw; x += fw) {
                    ctx.drawImage(img, x, runwayY - 14, fw, 22);
                }
            }

            // 7. Authentic Dark Asphalt Runway Tarmac (covers from runwayY down to bottom)
            ctx.fillStyle = '#1b1b24';
            ctx.fillRect(0, runwayY, w, h - runwayY + 50);

            // Runway perspective dashed lines
            if (this.images.road) {
                const img = this.images.road;
                const roadScrollX = -(this.groundOffset * 1.4) % img.width;
                for (let x = roadScrollX - img.width; x < w + img.width; x += img.width) {
                    ctx.drawImage(img, x, runwayY, img.width, h - runwayY + 50);
                }
            } else {
                ctx.fillStyle = '#FCDD12';
                ctx.fillRect(0, runwayY, w, 4);
            }
        }
        ctx.restore();
    }

    drawWalkingCrew(ctx, w, runwayY) {
        // Draw 4 astronauts walking across the tarmac in white space suits
        const frames = window.JETX_SPACEMAN_FRAMES;
        const img = this.images.spaceman;

        const centerX = w * 0.32;
        const crewY = runwayY - 12;

        this.tarmacCrew.forEach(c => {
            const cx = centerX + c.xOffset - (this.groundOffset * 0.12);
            ctx.save();
            ctx.translate(cx, crewY);

            if (img && frames && frames.length > 0) {
                const fIdx = Math.floor(c.frame) % Math.min(10, frames.length);
                const f = frames[fIdx];
                ctx.scale(0.55, 0.55);
                ctx.drawImage(img, f.sx, f.sy, f.sw, f.sh, f.dx, f.dy, f.dw, f.dh);
            } else {
                // Procedural white astronaut figure
                ctx.fillStyle = '#E8E8FF';
                ctx.fillRect(-3, -16, 6, 12); // suit body
                ctx.beginPath();
                ctx.arc(0, -20, 5, 0, Math.PI * 2); // helmet
                ctx.fill();
                ctx.fillStyle = '#2BD35C'; // visor
                ctx.fillRect(-2, -21, 4, 3);
            }
            ctx.restore();
        });
    }

    drawJet(ctx, x, y, rotation) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rotation);

        const s = Math.min(1.0, Math.max(0.72, this.width / 800)) * 0.95;
        ctx.scale(s, s);

        // Runway tarmac ground shadow (when on runway)
        if (this.jet.gearProgress > 0.05) {
            ctx.save();
            ctx.globalAlpha = 0.45 * this.jet.gearProgress;
            ctx.fillStyle = '#0a0a12';
            ctx.beginPath();
            ctx.ellipse(15, 34, 110, 9, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // Authentic Afterburner Thruster Flame
        if (this.state === 'TAKEOFF' || this.state === 'FLYING' || this.isFlewAway) {
            if (this.images.flame) {
                const flicker = (this.isFlewAway ? 2.2 : 1.0) + Math.sin(this.lastTime * 0.04) * 0.18;
                const fw = 135 * flicker;
                const fh = 36 * (this.isFlewAway ? 1.4 : 1.0) * (0.9 + Math.random() * 0.2);
                ctx.drawImage(this.images.flame, -125 - fw, -fh / 2 + 1, fw, fh);
            }
        }

        // Authentic JetX Supersonic Jet Plane
        if (this.images.plane) {
            const pw = 250;
            const ph = 70;
            ctx.drawImage(this.images.plane, -125, -ph / 2 - 2, pw, ph);
        }

        ctx.restore();
    }

    drawThrusterParticles(ctx) {
        ctx.save();
        for (const p of this.jet.particles) {
            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    drawParachutists(ctx) {
        ctx.save();
        for (const para of this.parachutists) {
            ctx.save();
            ctx.translate(para.x, para.y);
            ctx.rotate(Math.sin(para.swingAngle) * 0.12);

            // Parachute Canopy
            ctx.fillStyle = '#4D3B82';
            ctx.beginPath();
            ctx.arc(0, -22, 20, Math.PI, 0, false);
            ctx.closePath();
            ctx.fill();

            // Suspension Cords
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(-18, -22);
            ctx.lineTo(0, 0);
            ctx.moveTo(18, -22);
            ctx.lineTo(0, 0);
            ctx.moveTo(-7, -22);
            ctx.lineTo(0, 0);
            ctx.moveTo(7, -22);
            ctx.lineTo(0, 0);
            ctx.stroke();

            // White figure
            ctx.fillStyle = '#ECECFF';
            ctx.fillRect(-2.5, 0, 5, 8);
            ctx.beginPath();
            ctx.arc(0, -3, 3, 0, Math.PI * 2);
            ctx.fill();

            // Green Win Pill Badge
            const text = `$ ${para.amount.toFixed(2)}`;
            ctx.font = 'bold 11px Roboto, sans-serif';
            const tw = ctx.measureText(text).width;
            
            ctx.fillStyle = '#EFFFF2';
            ctx.beginPath();
            ctx.roundRect(-tw / 2 - 8, -46, tw + 16, 18, 9);
            ctx.fill();

            // Green text
            ctx.fillStyle = '#18A038';
            ctx.fillText(text, -tw / 2, -33);

            ctx.restore();
        }
        ctx.restore();
    }
}

window.FlightCanvas = FlightCanvas;
