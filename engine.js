// Engine Animation Configuration
const canvas = document.getElementById('engineCanvas');
const ctx = canvas.getContext('2d');
const autoPauseSelect = document.getElementById('autoPauseSelect');
const resumeBtn = document.getElementById('resumeBtn');

// Animation state
let animationId = null;
let isPlaying = true;
let animationSpeed = 1;
let time = 0;
let lastPistonY = null;
let autoPauseEnabled = autoPauseSelect ? autoPauseSelect.value === 'on' : true;
let lastStrokeIndex = null;

if (resumeBtn) {
    resumeBtn.style.display = 'none';
}

const particles = {
    intake: [],
    chamber: [],
    exhaust: []
};

const PARTICLE_LIMITS = {
    intake: 100,
    chamber: 220,
    exhaust: 160
};

function createMixtureColor() {
    const palette = [
        { r: 70, g: 170, b: 220 },
        { r: 60, g: 190, b: 200 },
        { r: 80, g: 180, b: 210 },
        { r: 90, g: 200, b: 240 }
    ];
    const base = palette[Math.floor(Math.random() * palette.length)];
    return {
        r: base.r + Math.floor(rand(-10, 10)),
        g: base.g + Math.floor(rand(-15, 15)),
        b: base.b + Math.floor(rand(-10, 10))
    };
}

// Engine dimensions and positions
const engine = {
    cylinderX: 400,
    cylinderY: 150,
    cylinderWidth: 180,
    cylinderHeight: 280,
    pistonWidth: 170,
    pistonHeight: 60,
    crankRadius: 80,
    rodLength: 140,
    crankX: 400,
    crankY: 480,
};

// Stroke cycle information
const strokes = [
    {
        name: 'Intake',
        description: 'Air-fuel mixture enters through the intake valve as the piston moves down.',
        duration: Math.PI * 2 / 4
    },
    {
        name: 'Compression',
        description: 'Both valves close and the piston moves up, compressing the air-fuel mixture.',
        duration: Math.PI * 2 / 4
    },
    {
        name: 'Power (Combustion)',
        description: 'Spark plug ignites the compressed mixture, creating an explosion that drives the piston down.',
        duration: Math.PI * 2 / 4
    },
    {
        name: 'Exhaust',
        description: 'Exhaust valve opens and the piston moves up, pushing burnt gases out.',
        duration: Math.PI * 2 / 4
    }
];

// Get current stroke based on time
function getCurrentStroke() {
    const cycleTime = time % (Math.PI * 2);
    const strokeIndex = Math.floor(cycleTime / (Math.PI * 2 / 4));
    return strokes[strokeIndex];
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function rand(min, max) {
    return Math.random() * (max - min) + min;
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.arcTo(x + width, y, x + width, y + r, r);
    ctx.lineTo(x + width, y + height - r);
    ctx.arcTo(x + width, y + height, x + width - r, y + height, r);
    ctx.lineTo(x + r, y + height);
    ctx.arcTo(x, y + height, x, y + height - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
}

function cycleDistance(a, b) {
    const diff = Math.abs(a - b);
    return Math.min(diff, 1 - diff);
}

function easeInOut(t) {
    const clamped = clamp(t, 0, 1);
    return clamped * clamped * (3 - 2 * clamped);
}

function computeValveLift(fraction, openStart, openEnd, ramp = 0.08) {
    const normalizedFraction = (fraction % 1 + 1) % 1;
    const normalizedStart = (openStart % 1 + 1) % 1;
    const normalizedEnd = (openEnd % 1 + 1) % 1;

    let duration;
    let local;

    if (normalizedStart === normalizedEnd) {
        return 1;
    }

    if (normalizedStart < normalizedEnd) {
        if (normalizedFraction < normalizedStart || normalizedFraction > normalizedEnd) {
            return 0;
        }
        duration = normalizedEnd - normalizedStart;
        local = normalizedFraction - normalizedStart;
    } else {
        duration = (1 - normalizedStart) + normalizedEnd;
        if (normalizedFraction >= normalizedStart) {
            local = normalizedFraction - normalizedStart;
        } else if (normalizedFraction <= normalizedEnd) {
            local = (1 - normalizedStart) + normalizedFraction;
        } else {
            return 0;
        }
    }

    const rampDuration = Math.min(Math.max(ramp, 0), duration / 2);
    if (rampDuration <= 0) {
        return 1;
    }

    if (local < rampDuration) {
        return easeInOut(local / rampDuration);
    }
    if (local > duration - rampDuration) {
        const closingProgress = (local - (duration - rampDuration)) / rampDuration;
        return 1 - easeInOut(closingProgress);
    }

    return 1;
}

function spawnIntakeParticles(lift, pistonVelocity, speedFactor) {
    if (lift <= 0) {
        return;
    }
    const available = PARTICLE_LIMITS.intake - particles.intake.length;
    if (available <= 0) {
        return;
    }

    const spawnMultiplier = speedFactor >= 1 ? speedFactor : 1;
    const baseSpawn = Math.ceil(lift * 6 * spawnMultiplier);
    const spawnCount = Math.min(Math.max(baseSpawn, 1), available);
    const intakeX = engine.cylinderX - 55;
    const startY = engine.cylinderY - 55;

    for (let i = 0; i < spawnCount; i++) {
        particles.intake.push({
            x: intakeX + rand(-9, 9),
            y: startY + rand(-12, 6),
            vx: rand(0.25, 0.9),
            vy: rand(1.8, 2.8) + Math.max(pistonVelocity, 0) * 0.02 * speedFactor,
            radius: rand(1.6, 2.4),
            alpha: rand(0.5, 0.8),
            life: 0,
            maxLife: 120,
            color: createMixtureColor(),
            state: 'intake',
            spin: rand(-0.018, 0.018)
        });
    }
}

function updateParticles({
    intakeLift,
    exhaustLift,
    sparkActive,
    strokeIndex,
    pistonY,
    pistonVelocity,
    speedFactor
}) {
    const dt = Math.max(speedFactor, 0.01);
    if (intakeLift > 0.05 && pistonVelocity > 0) {
        spawnIntakeParticles(intakeLift, pistonVelocity, dt);
    }

    const intakeList = particles.intake;
    let intakeWrite = 0;
    for (let i = 0; i < intakeList.length; i++) {
        const p = intakeList[i];
        p.life += dt;
        const jitterX = rand(-0.02, 0.02) * dt;
        const jitterY = rand(-0.01, 0.04) * dt;
        p.x += p.vx * dt + jitterX;
        p.y += p.vy * dt + jitterY;

        if (p.y >= engine.cylinderY + 6) {
            if (particles.chamber.length < PARTICLE_LIMITS.chamber) {
                const initialFill = Math.random();
                particles.chamber.push({
                    x: p.x + rand(-10, 10),
                    y: engine.cylinderY + rand(8, 38),
                    vx: rand(-0.25, 0.25),
                    vy: rand(-0.18, 0.18),
                    radius: p.radius * rand(0.95, 1.6),
                    alpha: rand(0.45, 0.7),
                    life: 0,
                    maxLife: 280,
                    color: createMixtureColor(),
                    state: 'mixture',
                    spin: p.spin !== undefined ? p.spin : rand(-0.018, 0.018),
                    fillRatio: initialFill,
                    baseFill: initialFill,
                    spreadBias: rand(-1, 1)
                });
            }
            continue;
        }

        if (p.life < p.maxLife) {
            intakeList[intakeWrite++] = p;
        }
    }
    intakeList.length = intakeWrite;

    const minX = engine.cylinderX - engine.pistonWidth / 2 + 12;
    const maxX = engine.cylinderX + engine.pistonWidth / 2 - 12;
    const minY = engine.cylinderY + 8;
    const maxY = pistonY - 10;
    const exhaustValveX = engine.cylinderX + 55;
    const exhaustValveY = engine.cylinderY - 30 + exhaustLift * 28;
    const exhaustExitX = exhaustValveX + 140;
    const allowExhaustExit = exhaustLift > 0.08 && strokeIndex === 3;
    const valveCorridorWidth = 44;
    const valveCorridorHalf = valveCorridorWidth / 2;
    const valveCorridorTop = engine.cylinderY - 32;
    const valveCorridorBottom = engine.cylinderY + 68;
    const inValveCorridor = (x, y) => (
        allowExhaustExit &&
        x >= exhaustValveX - valveCorridorHalf &&
        x <= exhaustValveX + valveCorridorHalf &&
        y >= valveCorridorTop &&
        y <= valveCorridorBottom
    );
    const chamberCenterX = engine.cylinderX;
    const chamberCenterY = engine.cylinderY + (pistonY - engine.cylinderY) * 0.42;
    const exhaustSuctionScale = allowExhaustExit
        ? clamp((engine.cylinderY + engine.cylinderHeight - pistonY) / engine.cylinderHeight, 0.05, 1)
        : 0;
    const exhaustPressureFactor = strokeIndex === 3
        ? 1 + clamp(-pistonVelocity, 0, 22) * 0.1 + exhaustSuctionScale * 1.8 + exhaustLift * 0.5
        : 1;

    const chamberList = particles.chamber;
    let chamberWrite = 0;
    for (let i = 0; i < chamberList.length; i++) {
        const p = chamberList[i];
        p.life += dt;
        p.vx += rand(-0.025, 0.025) * dt;
        p.vy += (rand(-0.035, 0.035) + pistonVelocity * 0.0025) * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        if (strokeIndex === 3) {
            const pressureMagnitude = clamp(-pistonVelocity, 0, 18);
            if (pressureMagnitude > 0) {
                const gx = p.x - chamberCenterX;
                const gy = p.y - chamberCenterY;
                const distance = Math.max(Math.hypot(gx, gy), 1);
                const radialPush = pressureMagnitude * 0.0022 * exhaustPressureFactor * dt;
                p.vx += (gx / distance) * radialPush;
                p.vy += (gy / distance) * radialPush;
                const turbulence = pressureMagnitude * exhaustPressureFactor * dt;
                p.vx += rand(-0.0022, 0.0022) * turbulence;
                p.vy += rand(-0.0022, 0.0022) * turbulence;
            }
        }

        let corridorNow = inValveCorridor(p.x, p.y);

        if (allowExhaustExit) {
            const seatX = exhaustValveX;
            const seatY = engine.cylinderY + 24;
            const dx = seatX - p.x;
            const dy = seatY - p.y;
            const distance = Math.max(Math.hypot(dx, dy), 1);
            const suctionBase = exhaustLift * (0.007 + exhaustSuctionScale * 0.011) * exhaustPressureFactor * dt;
            p.vx += (dx / distance) * suctionBase;
            p.vy += (dy / distance) * suctionBase;

            const upwardAssist = (0.05 + exhaustSuctionScale * 0.14) * exhaustLift * exhaustPressureFactor * dt;
            p.vy -= upwardAssist;

            if (corridorNow) {
                const exitDirX = 0.1;
                const exitDirY = -0.995;
                const mag = Math.max(Math.hypot(exitDirX, exitDirY), 0.001);
                const exitPush = 0.1 * exhaustLift * (1 + exhaustSuctionScale * 1.9) * exhaustPressureFactor * dt;
                p.vx += (exitDirX / mag) * exitPush;
                p.vy += (exitDirY / mag) * exitPush;
                if (p.y > engine.cylinderY) {
                    p.vy -= 0.085 * exhaustLift * (1 + exhaustSuctionScale * 1.2) * exhaustPressureFactor * dt;
                }
            }
        }

        if (p.x < minX) {
            p.x = minX;
            p.vx *= -0.45;
        } else if (p.x > maxX && !corridorNow) {
            p.x = maxX;
            p.vx *= -0.45;
        }

        if (p.y < minY && !(corridorNow && p.x >= exhaustValveX - valveCorridorHalf)) {
            p.y = minY;
            p.vy *= -0.45;
        } else if (p.y > maxY) {
            p.y = maxY;
            p.vy *= -0.45;
        }

        corridorNow = inValveCorridor(p.x, p.y);

        const isPressurized = (
            p.state === 'mixture' ||
            p.state === 'ignited' ||
            (p.state === 'burnt' && strokeIndex < 3)
        );
        if (isPressurized) {
            if (p.spin === undefined) {
                p.spin = rand(-0.016, 0.016);
            }
            if (p.fillRatio === undefined) {
                p.fillRatio = Math.random();
            }
            if (p.baseFill === undefined) {
                p.baseFill = p.fillRatio;
            }
            if (p.spreadBias === undefined) {
                p.spreadBias = rand(-1, 1);
            }

            const chamberHeight = Math.max(pistonY - engine.cylinderY - 22, 28);

            let targetFill = p.fillRatio;
            if (strokeIndex === 0) {
                targetFill += (Math.random() - 0.5) * 0.02;
            } else if (strokeIndex === 1) {
                targetFill -= Math.min(pistonVelocity, 0) * 0.005;
            } else if (strokeIndex === 2) {
                const expansion = Math.max(pistonVelocity, 0);
                targetFill = clamp(
                    p.baseFill * (0.75 + expansion * 0.04) +
                        p.fillRatio * 0.15 +
                        (Math.random() - 0.5) * 0.06,
                    0,
                    1
                );
            }
            targetFill = clamp(targetFill, 0, 1);
            p.fillRatio = clamp((p.fillRatio * 4 + targetFill) / 5, 0, 1);

            const desiredY = engine.cylinderY + 12 + p.fillRatio * chamberHeight;
            const dy = desiredY - p.y;
            p.vy += clamp(dy, -180, 180) * 0.00135 * dt;

            const spreadRadius = engine.pistonWidth / 2 - 18;
            const desiredX = engine.cylinderX + p.spreadBias * spreadRadius;
            const dx = desiredX - p.x;
            p.vx += clamp(dx, -150, 150) * 0.0012 * dt;

            if (strokeIndex === 0) {
                p.vx += p.spin * 0.5 * dt;
                p.spreadBias = clamp(p.spreadBias + p.spin * 0.015 * dt, -1, 1);
            } else if (strokeIndex === 1) {
                p.vy += pistonVelocity * 0.01 * dt;
            } else if (strokeIndex === 2) {
                p.vx += p.spin * 0.35 * dt;
                const expansion = Math.max(pistonVelocity, 0);
                const upwardBias = 1 - p.fillRatio;
                p.vy += expansion * 0.006 * dt;
                p.vy -= upwardBias * expansion * 0.012 * dt;
                const ignitionX = engine.cylinderX;
                const ignitionY = engine.cylinderY + 12;
                const gx = p.x - ignitionX;
                const gy = p.y - ignitionY;
                const distance = Math.max(Math.hypot(gx, gy), 1);
                const pressurePush = 0.06 * clamp(1 - distance / (engine.pistonWidth * 0.6), 0.12, 1) * dt;
                p.vx += (gx / distance) * pressurePush;
                p.vy += (gy / distance) * pressurePush;
            }
        }

        if (sparkActive && p.state === 'mixture') {
            p.state = 'ignited';
            p.color = {
                r: 220 + Math.floor(Math.random() * 35),
                g: 140 + Math.floor(Math.random() * 60),
                b: 30 + Math.floor(Math.random() * 45)
            };
            p.radius *= rand(1.2, 1.6);
            p.alpha = rand(0.72, 0.9);
        } else if (!sparkActive && p.state === 'ignited' && strokeIndex === 3) {
            p.state = 'burnt';
            p.color = { r: 110, g: 110, b: 110 };
            p.alpha = 0.55;
        }

        if (p.state === 'mixture') {
            p.alpha = clamp(p.alpha + rand(-0.01, 0.015) * dt, 0.35, 0.7);
        } else if (p.state === 'ignited') {
            p.alpha = clamp(p.alpha - 0.004 * dt, 0.45, 0.9);
        } else if (p.state === 'burnt') {
            p.alpha = clamp(p.alpha - 0.003 * dt, 0.25, 0.6);
        }

        const exitWindowX = valveCorridorHalf * 0.6;
        const exitWindowY = engine.cylinderY - 4;
        const readyToExit = allowExhaustExit &&
            particles.exhaust.length < PARTICLE_LIMITS.exhaust &&
            corridorNow &&
            Math.abs(p.x - exhaustValveX) <= exitWindowX &&
            (p.y <= exitWindowY || (p.y <= engine.cylinderY + 2 && p.vy <= -0.12));

        if (readyToExit) {
            const pressureBoost = exhaustPressureFactor;
            const exitVx = Math.max(p.vx, 0.35) + 0.28 * exhaustLift * pressureBoost;
            const exitVy = p.vy * 0.45 - (0.32 + exhaustLift * 0.12) * pressureBoost;
            particles.exhaust.push({
                x: p.x + rand(-3, 3),
                y: p.y + rand(-3, 3),
                vx: exitVx + rand(0.3, 0.8),
                vy: exitVy + rand(-0.85, 0.05),
                radius: p.radius * rand(0.9, 1.35),
                alpha: rand(0.5, 0.72),
                life: 0,
                maxLife: 160,
                color: p.state === 'ignited'
                    ? { r: 230 + Math.floor(Math.random() * 15), g: 120 + Math.floor(Math.random() * 30), b: 60 + Math.floor(Math.random() * 30) }
                    : { r: 80 + Math.floor(Math.random() * 30), g: 80 + Math.floor(Math.random() * 30), b: 80 + Math.floor(Math.random() * 30) }
            });
            continue;
        }

        if (p.life < p.maxLife) {
            chamberList[chamberWrite++] = p;
        }
    }
    chamberList.length = chamberWrite;

    const exhaustList = particles.exhaust;
    let exhaustWrite = 0;
    for (let i = 0; i < exhaustList.length; i++) {
        const p = exhaustList[i];
        p.life += dt;
        p.vx += 0.018 * dt;
        p.vy += -0.012 * dt;
        p.x += p.vx * dt + rand(-0.05, 0.05) * dt;
        p.y += p.vy * dt + rand(-0.08, 0.08) * dt;
        p.alpha *= Math.pow(0.965, dt);

        if (
            p.life < p.maxLife &&
            p.alpha > 0.06 &&
            p.y > engine.cylinderY - 200 &&
            p.x < exhaustExitX + 160
        ) {
            exhaustList[exhaustWrite++] = p;
        }
    }
    exhaustList.length = exhaustWrite;
}

function drawParticles() {
    const renderGroup = (group) => {
        for (const p of group) {
            const alpha = clamp(p.alpha, 0, 1);
            const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius * 1.5);
            gradient.addColorStop(0, `rgba(${p.color.r}, ${p.color.g}, ${p.color.b}, ${alpha})`);
            gradient.addColorStop(0.7, `rgba(${p.color.r}, ${p.color.g}, ${p.color.b}, ${alpha * 0.2})`);
            gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius * 1.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = `rgba(${p.color.r}, ${p.color.g}, ${p.color.b}, ${alpha})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius * 0.6, 0, Math.PI * 2);
            ctx.fill();
        }
    };

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.save();
    ctx.translate(0, -2);
    renderGroup(particles.intake);
    ctx.restore();

    renderGroup(particles.chamber);
    ctx.save();
    ctx.translate(4, -6);
    renderGroup(particles.exhaust);
    ctx.restore();
    ctx.restore();
}

// Calculate piston position based on crankshaft angle
function getPistonPosition(angle) {
    const crankOffsetX = Math.cos(angle) * engine.crankRadius;
    const crankOffsetY = Math.sin(angle) * engine.crankRadius;

    const crankX = engine.crankX + crankOffsetX;
    const crankY = engine.crankY + crankOffsetY;

    // Slider-crank constraint keeps rod length fixed; guard against rounding errors
    const horizontal = crankOffsetX;
    const rodVertical = Math.sqrt(Math.max(engine.rodLength ** 2 - horizontal ** 2, 0));
    const pistonCenterY = crankY - rodVertical;
    const pistonY = pistonCenterY - engine.pistonHeight / 2;

    return {
        pistonY,
        crankX,
        crankY,
        pistonCenterY
    };
}

// Draw cylinder block
function drawCylinder() {
    const gradient = ctx.createLinearGradient(
        engine.cylinderX - engine.cylinderWidth / 2, 0,
        engine.cylinderX + engine.cylinderWidth / 2, 0
    );
    gradient.addColorStop(0, '#555');
    gradient.addColorStop(0.5, '#777');
    gradient.addColorStop(1, '#555');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(
        engine.cylinderX - engine.cylinderWidth / 2,
        engine.cylinderY,
        engine.cylinderWidth,
        engine.cylinderHeight
    );
    
    // Cylinder walls (cutaway view)
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 4;
    ctx.strokeRect(
        engine.cylinderX - engine.cylinderWidth / 2,
        engine.cylinderY,
        engine.cylinderWidth,
        engine.cylinderHeight
    );
    
    // Combustion chamber (top)
    ctx.fillStyle = '#444';
    ctx.fillRect(
        engine.cylinderX - engine.cylinderWidth / 2,
        engine.cylinderY - 30,
        engine.cylinderWidth,
        30
    );
    ctx.strokeRect(
        engine.cylinderX - engine.cylinderWidth / 2,
        engine.cylinderY - 30,
        engine.cylinderWidth,
        30
    );
}

// Draw valves
function drawValves(intakeLift, exhaustLift) {
    const baseY = engine.cylinderY - 30;
    const valveStroke = 28;
    const guideHeight = 85;

    renderValve({
        x: engine.cylinderX - 55,
        baseY,
        stroke: valveStroke,
        lift: intakeLift,
        color: '#4CAF50',
        label: 'INTAKE',
        direction: 'in',
        guideHeight
    });

    renderValve({
        x: engine.cylinderX + 55,
        baseY,
        stroke: valveStroke,
        lift: exhaustLift,
        color: '#f44336',
        label: 'EXHAUST',
        direction: 'out',
        guideHeight
    });
}

function renderValve({ x, baseY, stroke, lift, color, label, direction, guideHeight }) {
    const headRadiusX = 32;
    const headRadiusY = 11;
    const stemWidth = 7;
    const guideWidth = 26;
    const guideTop = baseY - guideHeight;
    const liftOffset = stroke * clamp(lift, 0, 1);
    const headCenterY = baseY + liftOffset;

    // Valve guide housing
    ctx.fillStyle = '#d7dce2';
    ctx.fillRect(x - guideWidth / 2, guideTop, guideWidth, guideHeight - 8);
    ctx.strokeStyle = '#9aa0a6';
    ctx.lineWidth = 2;
    ctx.strokeRect(x - guideWidth / 2, guideTop, guideWidth, guideHeight - 8);

    // Valve spring hint
    const springTurns = 6;
    const springTop = guideTop + 12;
    const springBottom = springTop + 40;
    ctx.strokeStyle = '#a0a6ad';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - guideWidth / 2 + 4, springTop);
    for (let i = 0; i <= springTurns; i++) {
        const t = i / springTurns;
        const y = springTop + t * (springBottom - springTop);
        const offset = (i % 2 === 0 ? -guideWidth / 2 + 4 : guideWidth / 2 - 4);
        ctx.lineTo(x + offset, y);
    }
    ctx.stroke();

    // Valve stem
    ctx.strokeStyle = '#6d7075';
    ctx.lineWidth = stemWidth;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, guideTop);
    ctx.lineTo(x, headCenterY - headRadiusY);
    ctx.stroke();

    // Valve head
    const headGradient = ctx.createLinearGradient(x - headRadiusX, headCenterY, x + headRadiusX, headCenterY);
    headGradient.addColorStop(0, '#b0b4b9');
    headGradient.addColorStop(0.5, '#f5f6f7');
    headGradient.addColorStop(1, '#b0b4b9');
    ctx.fillStyle = headGradient;
    ctx.beginPath();
    ctx.ellipse(x, headCenterY, headRadiusX, headRadiusY, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#56585b';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Flow visualization when valve is open
    if (lift > 0.05) {
        ctx.save();
        ctx.globalAlpha = clamp(lift, 0, 1) * 0.6;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        const plumeCount = 3;
        for (let i = 0; i < plumeCount; i++) {
            const spread = (i - (plumeCount - 1) / 2) * 8;
            ctx.beginPath();
            if (direction === 'in') {
                ctx.moveTo(x + spread, headCenterY - headRadiusY);
                ctx.bezierCurveTo(
                    x + spread * 0.6,
                    headCenterY + 10,
                    engine.cylinderX - engine.pistonWidth / 4,
                    engine.cylinderY + 40,
                    engine.cylinderX,
                    engine.cylinderY + 90
                );
            } else {
                ctx.moveTo(x + spread, headCenterY - headRadiusY);
                ctx.bezierCurveTo(
                    x + spread * 0.6,
                    headCenterY - 40,
                    engine.cylinderX + engine.pistonWidth / 3,
                    engine.cylinderY - 100,
                    engine.cylinderX + engine.pistonWidth / 2,
                    engine.cylinderY - 150
                );
            }
            ctx.stroke();
        }
        ctx.restore();
    }

    // Valve label
    ctx.fillStyle = color;
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(label, x, guideTop - 12);
}

// Draw piston
function drawPiston(y) {
    const gradient = ctx.createLinearGradient(
        engine.cylinderX - engine.pistonWidth / 2, y,
        engine.cylinderX + engine.pistonWidth / 2, y
    );
    gradient.addColorStop(0, '#aaa');
    gradient.addColorStop(0.5, '#ddd');
    gradient.addColorStop(1, '#aaa');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(
        engine.cylinderX - engine.pistonWidth / 2,
        y,
        engine.pistonWidth,
        engine.pistonHeight
    );
    
    // Piston rings
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 3;
    for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.moveTo(engine.cylinderX - engine.pistonWidth / 2 + 5, y + i * 15);
        ctx.lineTo(engine.cylinderX + engine.pistonWidth / 2 - 5, y + i * 15);
        ctx.stroke();
    }
    
    // Piston outline
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 3;
    ctx.strokeRect(
        engine.cylinderX - engine.pistonWidth / 2,
        y,
        engine.pistonWidth,
        engine.pistonHeight
    );
}

// Draw connecting rod
function drawConnectingRod(pistonY, crankX, crankY) {
    const pistonPinY = pistonY + engine.pistonHeight / 2;
    
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    
    ctx.beginPath();
    ctx.moveTo(engine.cylinderX, pistonPinY);
    ctx.lineTo(crankX, crankY);
    ctx.stroke();
    
    // Piston pin
    ctx.fillStyle = '#777';
    ctx.beginPath();
    ctx.arc(engine.cylinderX, pistonPinY, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Crank pin
    ctx.fillStyle = '#777';
    ctx.beginPath();
    ctx.arc(crankX, crankY, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.stroke();
}

// Draw crankshaft
function drawCrankshaft(angle) {
    const pos = getPistonPosition(angle);
    
    // Main journal
    ctx.fillStyle = '#444';
    ctx.beginPath();
    ctx.arc(engine.crankX, engine.crankY, 25, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 3;
    ctx.stroke();
    
    // Crank arm
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 20;
    ctx.beginPath();
    ctx.moveTo(engine.crankX, engine.crankY);
    ctx.lineTo(pos.crankX, pos.crankY);
    ctx.stroke();
    
    // Counterweight
    const counterX = engine.crankX - Math.cos(angle) * engine.crankRadius * 0.55;
    const counterY = engine.crankY - Math.sin(angle) * engine.crankRadius * 0.55;
    
    ctx.fillStyle = '#666';
    ctx.beginPath();
    ctx.arc(counterX, counterY, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.stroke();
}

// Draw combustion/air-fuel mixture
function drawCombustion(pistonY, stroke, strokePhase, sparkActive) {
    const chamberHeight = pistonY - engine.cylinderY;
    const chamberY = engine.cylinderY;
    
    ctx.save();
    ctx.globalAlpha = 0.6;
    
    if (stroke.name === 'Intake') {
        ctx.globalAlpha = 0.15;
        ctx.fillStyle = '#4CAF50';
        ctx.fillRect(
            engine.cylinderX - engine.pistonWidth / 2 + 5,
            chamberY,
            engine.pistonWidth - 10,
            chamberHeight
        );
    } else if (stroke.name === 'Compression') {
        const compressionFactor = strokePhase;
        ctx.globalAlpha = 0.25 + compressionFactor * 0.35;
        const gradient = ctx.createLinearGradient(
            engine.cylinderX, chamberY,
            engine.cylinderX, pistonY
        );
        gradient.addColorStop(0, '#FFCA80');
        gradient.addColorStop(1, '#FFE0B2');
        ctx.fillStyle = gradient;
        ctx.fillRect(
            engine.cylinderX - engine.pistonWidth / 2 + 5,
            chamberY,
            engine.pistonWidth - 10,
            chamberHeight
        );

        if (sparkActive) {
            ctx.globalAlpha = 0.8;
            const sparkGradient = ctx.createRadialGradient(
                engine.cylinderX,
                chamberY + 12,
                0,
                engine.cylinderX,
                chamberY + 12,
                engine.pistonWidth / 2
            );
            sparkGradient.addColorStop(0, '#FFFFFF');
            sparkGradient.addColorStop(0.3, '#FFE082');
            sparkGradient.addColorStop(0.65, 'rgba(255, 126, 0, 0.35)');
            sparkGradient.addColorStop(1, 'rgba(255, 140, 0, 0)');
            ctx.fillStyle = sparkGradient;
            ctx.fillRect(
                engine.cylinderX - engine.pistonWidth / 2 + 5,
                chamberY,
                engine.pistonWidth - 10,
                chamberHeight * 0.6
            );
        }
    } else if (stroke.name === 'Power (Combustion)') {
        // Explosion effect
        if (strokePhase < 0.22) {
            // Bright flash
            const flashIntensity = Math.sin(strokePhase * Math.PI / 0.22);
            ctx.globalAlpha = 0.75 * flashIntensity;
            const gradient = ctx.createRadialGradient(
                engine.cylinderX, chamberY + chamberHeight / 2,
                0,
                engine.cylinderX, chamberY + chamberHeight / 2,
                engine.pistonWidth / 2
            );
            gradient.addColorStop(0, '#FFF');
            gradient.addColorStop(0.25, '#FFD400');
            gradient.addColorStop(0.55, '#FF6B00');
            gradient.addColorStop(1, '#8B0000');
            ctx.fillStyle = gradient;
        } else {
            // Expanding hot gases
            ctx.globalAlpha = 0.65;
            const gradient = ctx.createLinearGradient(
                engine.cylinderX, chamberY,
                engine.cylinderX, pistonY
            );
            gradient.addColorStop(0, '#FF6B00');
            gradient.addColorStop(0.45, '#FF4500');
            gradient.addColorStop(1, '#C62828');
            ctx.fillStyle = gradient;
        }
        ctx.fillRect(
            engine.cylinderX - engine.pistonWidth / 2 + 5,
            chamberY,
            engine.pistonWidth - 10,
            chamberHeight
        );
        
        // Spark effect
        if (strokePhase < 0.15) {
            ctx.globalAlpha = 1;
            ctx.strokeStyle = '#FFFF00';
            ctx.lineWidth = 3;
            ctx.beginPath();
            const sparkX = engine.cylinderX;
            const sparkY = engine.cylinderY - 15;
            for (let i = 0; i < 5; i++) {
                const angle = (i / 5) * Math.PI * 2;
                const length = 15 + Math.random() * 10;
                ctx.moveTo(sparkX, sparkY);
                ctx.lineTo(
                    sparkX + Math.cos(angle) * length,
                    sparkY + Math.sin(angle) * length
                );
            }
            ctx.stroke();
        }
    } else if (stroke.name === 'Exhaust') {
        // Dark exhaust gases
        const alpha = 1 - strokePhase * 0.7;
        ctx.globalAlpha = 0.5 * alpha;
        const gradient = ctx.createLinearGradient(
            engine.cylinderX, chamberY,
            engine.cylinderX, pistonY
        );
        gradient.addColorStop(0, '#424242');
        gradient.addColorStop(1, '#616161');
        ctx.fillStyle = gradient;
        ctx.fillRect(
            engine.cylinderX - engine.pistonWidth / 2 + 5,
            chamberY,
            engine.pistonWidth - 10,
            chamberHeight
        );
    }
    
    ctx.restore();
}

// Draw spark plug
function drawSparkPlug(firing) {
    const sparkX = engine.cylinderX;
    const sparkY = engine.cylinderY - 30;
    
    // Spark plug body
    ctx.fillStyle = '#888';
    ctx.fillRect(sparkX - 8, sparkY - 40, 16, 40);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.strokeRect(sparkX - 8, sparkY - 40, 16, 40);
    
    // Electrode
    ctx.strokeStyle = firing ? '#FFFF00' : '#666';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(sparkX, sparkY);
    ctx.lineTo(sparkX, sparkY + 15);
    ctx.stroke();
    
    if (firing) {
        ctx.fillStyle = '#FFFF00';
        ctx.beginPath();
        ctx.arc(sparkX, sparkY + 15, 4, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawStrokeLabel(stroke) {
    const labelWidth = 200;
    const labelHeight = 70;
    const labelX = canvas.width - labelWidth - 25;
    const labelY = engine.cylinderY + 30;

    ctx.save();
    ctx.shadowColor = 'rgba(30, 30, 30, 0.4)';
    ctx.shadowBlur = 6;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.strokeStyle = 'rgba(80, 80, 80, 0.4)';
    ctx.lineWidth = 2;
    drawRoundedRect(ctx, labelX, labelY, labelWidth, labelHeight, 18);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = '#2e3a4f';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const labelCenterX = labelX + labelWidth / 2;
    if (stroke.name === 'Power (Combustion)') {
        ctx.font = '700 24px "Segoe UI", sans-serif';
        ctx.fillText('POWER', labelCenterX, labelY + labelHeight / 2 - 12);
        ctx.font = '600 20px "Segoe UI", sans-serif';
        ctx.fillText('COMBUSTION', labelCenterX, labelY + labelHeight / 2 + 16);
    } else {
        ctx.font = '700 26px "Segoe UI", sans-serif';
        ctx.fillText(stroke.name.toUpperCase(), labelCenterX, labelY + labelHeight / 2);
    }
}

// Main animation loop
function animate() {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Update time
    const wasPlaying = isPlaying;
    if (isPlaying) {
        time += 0.02 * animationSpeed;
    }
    
    const cycleTime = time % (Math.PI * 2);

    // Calculate crank angle (two crank revolutions per full four-stroke cycle)
    const crankAngle = (cycleTime * 2) - Math.PI / 2;
    const pos = getPistonPosition(crankAngle);
    
    // Get current stroke
    const stroke = getCurrentStroke();
    const cycleFraction = cycleTime / (Math.PI * 2);
    const strokeIndex = Math.floor(cycleTime / (Math.PI * 2 / 4));
    const strokePhase = (cycleTime % (Math.PI * 2 / 4)) / (Math.PI * 2 / 4);

    const strokeChanged = strokeIndex !== lastStrokeIndex;
    if (lastStrokeIndex === null) {
        lastStrokeIndex = strokeIndex;
    } else if (autoPauseEnabled && wasPlaying && strokeChanged) {
        isPlaying = false;
        if (resumeBtn) {
            resumeBtn.style.display = 'inline-block';
        }
    }
    lastStrokeIndex = strokeIndex;
    
    // Determine valve lift profiles with smooth timing overlap
    const intakeLift = computeValveLift(cycleFraction, 0.92, 0.32, 0.07);
    const exhaustLift = computeValveLift(cycleFraction, 0.68, 0.08, 0.07);
    const sparkActive = cycleDistance(cycleFraction, 0.5) < 0.012;

    const speedFactor = animationSpeed;
    const pistonDelta = wasPlaying && lastPistonY !== null ? pos.pistonY - lastPistonY : 0;
    const pistonVelocity = wasPlaying && speedFactor > 0 ? pistonDelta / speedFactor : 0;

    if (wasPlaying) {
        updateParticles({
            intakeLift,
            exhaustLift,
            sparkActive,
            strokeIndex,
            pistonY: pos.pistonY,
            pistonVelocity,
            speedFactor
        });
    }

    lastPistonY = pos.pistonY;
    
    // Draw components in order (back to front)
    drawCylinder();
    drawCombustion(pos.pistonY, stroke, strokePhase, sparkActive);
    drawParticles();
    drawValves(intakeLift, exhaustLift);
    drawSparkPlug(sparkActive);
    drawStrokeLabel(stroke);
    drawPiston(pos.pistonY);
    drawConnectingRod(pos.pistonY, pos.crankX, pos.crankY);
    drawCrankshaft(crankAngle);
    
    // Update UI
    document.getElementById('currentStroke').textContent = stroke.name;
    document.getElementById('strokeInfo').textContent = stroke.description;
    
    // Continue animation
    animationId = requestAnimationFrame(animate);
}

// Event listeners
if (autoPauseSelect) {
    autoPauseSelect.addEventListener('change', () => {
        autoPauseEnabled = autoPauseSelect.value === 'on';
        if (!autoPauseEnabled && !isPlaying) {
            isPlaying = true;
        }
        if (resumeBtn) {
            resumeBtn.style.display = autoPauseEnabled && !isPlaying ? 'inline-block' : 'none';
        }
    });
}

if (resumeBtn) {
    resumeBtn.addEventListener('click', () => {
        isPlaying = true;
        resumeBtn.style.display = 'none';
    });
}

document.getElementById('resetBtn').addEventListener('click', () => {
    time = 0;
    isPlaying = true;
    lastPistonY = null;
    lastStrokeIndex = null;
    if (autoPauseSelect) {
        autoPauseEnabled = autoPauseSelect.value === 'on';
    }
    if (resumeBtn) {
        resumeBtn.style.display = 'none';
    }
});

document.getElementById('speedSlider').addEventListener('input', (e) => {
    animationSpeed = parseFloat(e.target.value);
    document.getElementById('speedValue').textContent = animationSpeed.toFixed(1) + 'x';
});

// Start animation
animate();
