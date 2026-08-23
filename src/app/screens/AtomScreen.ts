import type { Ticker } from "pixi.js";
import { Container, Graphics, Text, TextStyle } from "pixi.js";
import {
  C_BASE,
  C_SURFACE0,
  C_OVERLAY0,
  C_TEXT,
  C_SUBTEXT,
  C_MAUVE,
  C_RED,
  C_PEACH,
  C_YELLOW,
  C_GREEN,
  C_TEAL,
  C_SKY,
  C_BLUE,
  C_LAVENDER,
  PARTICLE_COLORS,
} from "./atom/palette";
import {
  ELEMENT_TABLE,
  elementByZ,
  electronsPerShell,
  VISUAL_CAP,
  valenceFor,
} from "./atom/elements";
import type { ElementDef } from "./atom/elements";
import type {
  Electron,
  Atom,
  Neutron,
  Particle,
  LightningArc,
  ReactionEffect,
} from "./atom/types";

// ── Screen ────────────────────────────────────────────────────────────────────
export class AtomScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();
  private w = 800;
  private h = 600;
  private time = 0;
  private nextId = 0;

  private atoms: Atom[] = [];
  private neutrons: Neutron[] = [];
  private reactions: ReactionEffect[] = [];
  private labels = new Map<number, { sym: Text; info: Text }>();

  private neutronTimer = 0;
  private neutronInterval = 2.5;
  private fusionTimer = 0;
  private lightningArcs: LightningArc[] = [];
  private lightningTimer = 0;
  private bondCheckTimer = 0;

  constructor() {
    super();
    this.addChild(this.gfx);
  }

  public async show(): Promise<void> {
    this.spawnInitialAtoms();
  }

  // ── Atom spawning ─────────────────────────────────────────────────────────

  private spawnInitialAtoms(): void {
    const defs: ElementDef[] = [
      { ...ELEMENT_TABLE[0] }, // H
      { ...ELEMENT_TABLE[0] }, // H
      { ...ELEMENT_TABLE[1] }, // D
      { ...ELEMENT_TABLE[3] }, // He
      { ...ELEMENT_TABLE[3] }, // He
      { ...ELEMENT_TABLE[4] }, // Li
      { ...ELEMENT_TABLE[5] }, // C
      { ...ELEMENT_TABLE[7] }, // O
      { ...ELEMENT_TABLE[8] }, // Fe
      { ...ELEMENT_TABLE[9] }, // Kr
      { ...ELEMENT_TABLE[10] }, // Ba
      { ...ELEMENT_TABLE[11] }, // U
    ];
    const margin = 150;
    for (const def of defs) {
      this.createAtom(
        def,
        margin + Math.random() * (this.w - margin * 2),
        margin + Math.random() * (this.h - margin * 2),
        (Math.random() - 0.5) * 65,
        (Math.random() - 0.5) * 65,
      );
    }
    // Seed with 6 free neutrons from the start
    for (let i = 0; i < 6; i++) this.spawnNeutron();
  }

  private createAtom(
    def: ElementDef,
    x: number,
    y: number,
    vx: number,
    vy: number,
  ): Atom {
    const shells = electronsPerShell(def.protons);
    const electrons: Electron[] = [];

    const scale = Math.min(this.w, this.h) / 900;
    const baseOrbit = 38 * scale;
    const shellStep = 34 * scale;

    for (let si = 0; si < shells.length && si < 5; si++) {
      const count = Math.min(shells[si], VISUAL_CAP[si] ?? 4);
      const orbitR = baseOrbit + si * shellStep;
      for (let ei = 0; ei < count; ei++) {
        electrons.push({
          shell: si,
          angle: (ei / count) * Math.PI * 2 + Math.random() * 0.4,
          speed: (2.8 - si * 0.45) * (0.75 + Math.random() * 0.5),
          orbitRx: orbitR * (0.8 + Math.random() * 0.4),
          orbitRy: orbitR * (0.55 + Math.random() * 0.35),
          tilt: Math.random() * Math.PI,
        });
      }
    }

    const nucleusR = Math.max(
      7,
      Math.min(24, 4 + Math.cbrt(def.protons + def.neutrons) * 3),
    );
    const maxOrbitR =
      electrons.length > 0
        ? Math.max(...electrons.map((e) => Math.max(e.orbitRx, e.orbitRy))) + 8
        : nucleusR + 15;

    const atom: Atom = {
      id: this.nextId++,
      x,
      y,
      vx,
      vy,
      protons: def.protons,
      neutrons: def.neutrons,
      symbol: def.symbol,
      name: def.name,
      color: def.color,
      electronColor: def.electronColor,
      electrons,
      nucleusR,
      maxOrbitR,
      dying: false,
      reacting: false,
      reactTimer: 0,
      reactDuration: 0,
      reactColor: C_YELLOW,
      flickerPhase: Math.random() * Math.PI * 2,
      bonds: [],
      maxBonds: valenceFor(def.protons),
      bondPhase: Math.random() * Math.PI * 2,
    };

    this.atoms.push(atom);
    this.addLabel(atom);
    return atom;
  }

  private addLabel(atom: Atom): void {
    const symStyle = new TextStyle({
      fontFamily: "monospace",
      fontSize: 14,
      fontWeight: "bold",
      fill: atom.color,
    });
    const infoStyle = new TextStyle({
      fontFamily: "monospace",
      fontSize: 10,
      fill: C_SUBTEXT,
    });
    const sym = new Text({ text: atom.symbol, style: symStyle });
    const info = new Text({
      text: `Z=${atom.protons} N=${atom.neutrons}`,
      style: infoStyle,
    });
    sym.anchor.set(0.5, 0);
    info.anchor.set(0.5, 0);
    this.addChild(sym);
    this.addChild(info);
    this.labels.set(atom.id, { sym, info });
  }

  private removeLabel(id: number): void {
    const lbl = this.labels.get(id);
    if (lbl) {
      lbl.sym.destroy();
      lbl.info.destroy();
      this.labels.delete(id);
    }
  }

  // ── Neutron spawning ──────────────────────────────────────────────────────

  private spawnNeutron(fromX?: number, fromY?: number): void {
    let x: number, y: number;
    if (fromX !== undefined && fromY !== undefined) {
      x = fromX;
      y = fromY;
    } else {
      const side = Math.floor(Math.random() * 4);
      if (side === 0) {
        x = Math.random() * this.w;
        y = -12;
      } else if (side === 1) {
        x = this.w + 12;
        y = Math.random() * this.h;
      } else if (side === 2) {
        x = Math.random() * this.w;
        y = this.h + 12;
      } else {
        x = -12;
        y = Math.random() * this.h;
      }
    }

    const activeAtoms = this.atoms.filter((a) => !a.dying);
    // Bias toward heavy atoms (better targets)
    const weighted = activeAtoms.flatMap((a) =>
      a.protons >= 30 ? [a, a] : [a],
    );
    const target =
      weighted.length > 0
        ? weighted[Math.floor(Math.random() * weighted.length)]
        : { x: this.w * 0.5, y: this.h * 0.5 };

    const dx = target.x - x;
    const dy = target.y - y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const spd = 180 + Math.random() * 160;
    const spread = 0.2;

    this.neutrons.push({
      id: this.nextId++,
      x,
      y,
      vx: (dx / d) * spd + (Math.random() - 0.5) * spd * spread,
      vy: (dy / d) * spd + (Math.random() - 0.5) * spd * spread,
      life: 0,
      maxLife: 10,
    });
  }

  private keepNeutronsPopulated(): void {
    // Always keep at least 8 neutrons flying
    const min = 8;
    const missing = min - this.neutrons.length;
    for (let i = 0; i < missing; i++) this.spawnNeutron();
  }

  // ── Effects ───────────────────────────────────────────────────────────────

  private spawnEffect(
    x: number,
    y: number,
    type: ReactionEffect["type"],
    color: number,
  ): void {
    const count = type === "fission" ? 18 : type === "fusion" ? 14 : 8;
    const particles: Particle[] = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.6;
      const spd = 70 + Math.random() * 130;
      particles.push({
        x,
        y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        color:
          PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
      });
    }
    this.reactions.push({
      id: this.nextId++,
      x,
      y,
      type,
      timer: 0,
      maxTimer: type === "fission" ? 1.6 : type === "fusion" ? 1.3 : 0.7,
      color,
      rings: type === "fission" ? 3 : type === "fusion" ? 2 : 1,
      particles,
    });
  }

  // ── Reactions ─────────────────────────────────────────────────────────────

  private triggerFission(atom: Atom, neutron: Neutron): void {
    const z1 = Math.max(
      1,
      Math.round(atom.protons * (0.38 + Math.random() * 0.24)),
    );
    const z2 = atom.protons - z1;
    const totalN = atom.neutrons + 1;
    const emitted = 3 + Math.floor(Math.random() * 3); // 3-5 chain neutrons
    const n1 = Math.max(0, Math.round((totalN - emitted) * 0.5));
    const n2 = Math.max(0, totalN - emitted - n1);

    this.spawnEffect(atom.x, atom.y, "fission", atom.color);
    atom.dying = true;
    neutron.life = neutron.maxLife + 1;

    const splitAngle = Math.random() * Math.PI * 2;
    const spd1 = 55 + Math.random() * 45;
    const spd2 = 55 + Math.random() * 45;
    const ax = atom.x;
    const ay = atom.y;

    // Emit neutrons immediately — chain reaction fuel
    for (let i = 0; i < emitted; i++) {
      const na = Math.random() * Math.PI * 2;
      const nspd = 200 + Math.random() * 200;
      this.neutrons.push({
        id: this.nextId++,
        x: ax + Math.cos(na) * 8,
        y: ay + Math.sin(na) * 8,
        vx: Math.cos(na) * nspd,
        vy: Math.sin(na) * nspd,
        life: 0,
        maxLife: 10,
      });
    }

    setTimeout(() => {
      if (this.destroyed) return;
      this.createAtom(
        elementByZ(z1, n1),
        ax + Math.cos(splitAngle) * 25,
        ay + Math.sin(splitAngle) * 25,
        Math.cos(splitAngle) * spd1,
        Math.sin(splitAngle) * spd1,
      );
      this.createAtom(
        elementByZ(z2, n2),
        ax - Math.cos(splitAngle) * 25,
        ay - Math.sin(splitAngle) * 25,
        -Math.cos(splitAngle) * spd2,
        -Math.sin(splitAngle) * spd2,
      );
    }, 250);
  }

  private triggerFusion(a1: Atom, a2: Atom): void {
    const z = a1.protons + a2.protons;
    const n = a1.neutrons + a2.neutrons;
    const mx = (a1.x + a2.x) * 0.5;
    const my = (a1.y + a2.y) * 0.5;
    const mvx = (a1.vx + a2.vx) * 0.3;
    const mvy = (a1.vy + a2.vy) * 0.3;

    this.spawnEffect(mx, my, "fusion", C_YELLOW);
    a1.dying = true;
    a2.dying = true;

    // Fusion of very light atoms may emit a neutron
    if (z <= 2 && n > z) {
      this.neutrons.push({
        id: this.nextId++,
        x: mx,
        y: my,
        vx: (Math.random() - 0.5) * 300,
        vy: (Math.random() - 0.5) * 300,
        life: 0,
        maxLife: 7,
      });
    }

    setTimeout(() => {
      if (this.destroyed) return;
      this.createAtom(elementByZ(z, n), mx, my, mvx, mvy);
    }, 300);
  }

  // ── Update ────────────────────────────────────────────────────────────────

  public update(ticker: Ticker): void {
    const dt = ticker.deltaMS * 0.001;
    this.time += dt;

    this.tickAtoms(dt);
    this.tickNeutrons(dt);
    this.tickEffects(dt);
    this.tickLightning(dt);
    this.checkNeutronCollisions();
    this.checkAtomCollisions(dt);
    this.checkBondFormation(dt);
    this.tickBondForces(dt);
    this.spawnAmbientLightning(dt);
    this.tickNeutronSpawn(dt);
    this.pruneAndReplenish();

    this.draw();
  }

  private tickAtoms(dt: number): void {
    for (const atom of this.atoms) {
      if (atom.dying) continue;

      atom.x += atom.vx * dt;
      atom.y += atom.vy * dt;

      const mg = atom.maxOrbitR + 15;
      if (atom.x < mg) {
        atom.vx = Math.abs(atom.vx) + 2;
        atom.x = mg;
      }
      if (atom.x > this.w - mg) {
        atom.vx = -Math.abs(atom.vx) - 2;
        atom.x = this.w - mg;
      }
      if (atom.y < mg) {
        atom.vy = Math.abs(atom.vy) + 2;
        atom.y = mg;
      }
      if (atom.y > this.h - mg) {
        atom.vy = -Math.abs(atom.vy) - 2;
        atom.y = this.h - mg;
      }

      // Bonded atoms experience heavy drag — they settle into slow co-motion
      const drag = atom.bonds.length > 0 ? 0.965 : 0.9985;
      atom.vx *= drag;
      atom.vy *= drag;

      for (const e of atom.electrons) e.angle += e.speed * dt;

      atom.flickerPhase += dt * 1.8;

      if (atom.reacting) {
        atom.reactTimer += dt;
        if (atom.reactTimer >= atom.reactDuration) {
          atom.reacting = false;
          atom.reactTimer = 0;
        }
      }
    }
  }

  private tickNeutrons(dt: number): void {
    for (const n of this.neutrons) {
      n.x += n.vx * dt;
      n.y += n.vy * dt;
      n.life += dt;
    }
    this.neutrons = this.neutrons.filter(
      (n) =>
        n.life <= n.maxLife &&
        n.x > -80 &&
        n.x < this.w + 80 &&
        n.y > -80 &&
        n.y < this.h + 80,
    );
  }

  private tickEffects(dt: number): void {
    for (const ef of this.reactions) {
      ef.timer += dt;
      for (const p of ef.particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.93;
        p.vy *= 0.93;
      }
    }
    this.reactions = this.reactions.filter((ef) => ef.timer < ef.maxTimer);
  }

  private checkNeutronCollisions(): void {
    for (const n of this.neutrons) {
      if (n.life > n.maxLife) continue;
      for (const atom of this.atoms) {
        if (atom.dying || atom.reacting) continue;
        const dx = n.x - atom.x;
        const dy = n.y - atom.y;
        if (dx * dx + dy * dy < (atom.nucleusR * 1.4 + 5) ** 2) {
          this.handleNeutronHit(atom, n);
          break;
        }
      }
    }
  }

  private handleNeutronHit(atom: Atom, n: Neutron): void {
    if (atom.protons >= 40 && Math.random() < 0.9) {
      this.triggerFission(atom, n);
    } else if (atom.protons <= 3) {
      atom.neutrons += 1;
      this.spawnEffect(atom.x, atom.y, "absorb", atom.color);
      atom.reacting = true;
      atom.reactTimer = 0;
      atom.reactDuration = 0.5;
      atom.reactColor = C_GREEN;
      n.life = n.maxLife + 1;
      // Heavy absorption may decay → spontaneous fission for medium atoms
      if (atom.neutrons > atom.protons * 2) this.triggerFission(atom, n);
    } else {
      this.spawnEffect(atom.x, atom.y, "scatter", C_SKY);
      atom.reacting = true;
      atom.reactTimer = 0;
      atom.reactDuration = 0.4;
      atom.reactColor = C_SKY;
      const ka = Math.atan2(n.y - atom.y, n.x - atom.x);
      const kick = 30 + Math.random() * 20;
      atom.vx += Math.cos(ka + Math.PI) * kick;
      atom.vy += Math.sin(ka + Math.PI) * kick;
      // Neutron bounces off with randomized direction
      const bounce = Math.PI * (0.8 + Math.random() * 0.4);
      n.vx = Math.cos(ka + bounce) * (120 + Math.random() * 80);
      n.vy = Math.sin(ka + bounce) * (120 + Math.random() * 80);
    }
  }

  private checkAtomCollisions(dt: number): void {
    this.fusionTimer -= dt;
    if (this.fusionTimer > 0) return;
    this.fusionTimer = 0.06;

    const alive = this.atoms.filter((a) => !a.dying && !a.reacting);
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        const a1 = alive[i];
        const a2 = alive[j];
        const dx = a1.x - a2.x;
        const dy = a1.y - a2.y;
        const dist2 = dx * dx + dy * dy;
        // Collision when outer electron clouds touch
        const colDist = a1.maxOrbitR * 0.45 + a2.maxOrbitR * 0.45;
        if (dist2 >= colDist * colDist) continue;

        const dist = Math.sqrt(dist2) || 1;

        // Light + light → fusion
        if (a1.protons <= 2 && a2.protons <= 2 && Math.random() < 0.8) {
          this.triggerFusion(a1, a2);
          return;
        }

        // Heavy + heavy or heavy + medium → double fission cascade
        if (a1.protons >= 40 && a2.protons >= 40 && Math.random() < 0.6) {
          const mockN1: Neutron = {
            id: -1,
            x: a1.x,
            y: a1.y,
            vx: a2.vx,
            vy: a2.vy,
            life: 0,
            maxLife: 0,
          };
          const mockN2: Neutron = {
            id: -2,
            x: a2.x,
            y: a2.y,
            vx: a1.vx,
            vy: a1.vy,
            life: 0,
            maxLife: 0,
          };
          this.triggerFission(a1, mockN1);
          this.triggerFission(a2, mockN2);
          return;
        }

        // Elastic collision — exchange momentum weighted by mass
        const m1 = a1.protons + a1.neutrons;
        const m2 = a2.protons + a2.neutrons;
        const totalM = m1 + m2;
        const nx = dx / dist;
        const ny = dy / dist;
        const relV = (a1.vx - a2.vx) * nx + (a1.vy - a2.vy) * ny;
        if (relV < 0) continue; // Already separating

        // Inelastic collision — coefficient of restitution 0.45 (lossy, slows on impact)
        const restitution = 0.45;
        const impulse = ((1 + restitution) * relV) / totalM;
        a1.vx -= impulse * m2 * nx;
        a1.vy -= impulse * m2 * ny;
        a2.vx += impulse * m1 * nx;
        a2.vy += impulse * m1 * ny;

        // Separate overlapping atoms
        const overlap = colDist - dist;
        a1.x += nx * overlap * 0.55;
        a1.y += ny * overlap * 0.55;
        a2.x -= nx * overlap * 0.55;
        a2.y -= ny * overlap * 0.55;

        // Visual reaction flash — scatter effect on both
        this.spawnEffect(a1.x, a1.y, "scatter", a1.color);
        this.spawnEffect(a2.x, a2.y, "scatter", a2.color);
        a1.reacting = true;
        a1.reactTimer = 0;
        a1.reactDuration = 0.45;
        a1.reactColor = C_YELLOW;
        a2.reacting = true;
        a2.reactTimer = 0;
        a2.reactDuration = 0.45;
        a2.reactColor = C_YELLOW;

        // Collision ejects a free neutron if heavy enough
        if (m1 + m2 > 50 && Math.random() < 0.5) {
          const na = Math.random() * Math.PI * 2;
          this.spawnNeutron(
            (a1.x + a2.x) * 0.5 + Math.cos(na) * 10,
            (a1.y + a2.y) * 0.5 + Math.sin(na) * 10,
          );
        }
        return; // one collision per tick to avoid cascade confusion
      }
    }
  }

  private tickNeutronSpawn(dt: number): void {
    this.neutronTimer += dt;
    if (this.neutronTimer >= this.neutronInterval) {
      this.neutronTimer = 0;
      this.neutronInterval = 0.7 + Math.random() * 1.3;
      // Spawn burst of 2-4 neutrons each wave
      const burst = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < burst; i++) this.spawnNeutron();
    }
    this.keepNeutronsPopulated();
  }

  private pruneAndReplenish(): void {
    const dying = this.atoms.filter((a) => a.dying).map((a) => a.id);
    for (const id of dying) {
      this.removeLabel(id);
      // Break all bonds from this atom
      for (const atom of this.atoms) {
        if (atom.bonds.includes(id)) {
          atom.bonds = atom.bonds.filter((bid) => bid !== id);
        }
      }
    }
    this.atoms = this.atoms.filter((a) => !a.dying);

    while (this.atoms.length < 6) {
      const pick =
        ELEMENT_TABLE[Math.floor(Math.random() * ELEMENT_TABLE.length)];
      const mg = 140;
      this.createAtom(
        { ...pick },
        mg + Math.random() * (this.w - mg * 2),
        mg + Math.random() * (this.h - mg * 2),
        (Math.random() - 0.5) * 70,
        (Math.random() - 0.5) * 70,
      );
    }
    if (this.atoms.length > 14) {
      const removed = this.atoms.splice(0, this.atoms.length - 14);
      for (const a of removed) this.removeLabel(a.id);
    }
  }

  // ── Bonding ───────────────────────────────────────────────────────────────

  private checkBondFormation(dt: number): void {
    this.bondCheckTimer -= dt;
    if (this.bondCheckTimer > 0) return;
    this.bondCheckTimer = 0.12;

    const alive = this.atoms.filter(
      (a) => !a.dying && !a.reacting && a.maxBonds > 0,
    );
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        const a1 = alive[i];
        const a2 = alive[j];
        if (a1.bonds.includes(a2.id) || a2.bonds.includes(a1.id)) continue;
        if (a1.bonds.length >= a1.maxBonds || a2.bonds.length >= a2.maxBonds)
          continue;

        const dx = a1.x - a2.x;
        const dy = a1.y - a2.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const bondRange = (a1.maxOrbitR + a2.maxOrbitR) * 0.55;

        if (dist < bondRange && Math.random() < 0.65) {
          a1.bonds.push(a2.id);
          a2.bonds.push(a1.id);
          // Blend velocities toward each other on bond — they decelerate together
          const avgVx = (a1.vx + a2.vx) * 0.5;
          const avgVy = (a1.vy + a2.vy) * 0.5;
          a1.vx = a1.vx * 0.3 + avgVx * 0.7;
          a1.vy = a1.vy * 0.3 + avgVy * 0.7;
          a2.vx = a2.vx * 0.3 + avgVx * 0.7;
          a2.vy = a2.vy * 0.3 + avgVy * 0.7;
          // Bond formation arc
          this.createLightningArc(a1.x, a1.y, a2.x, a2.y, C_GREEN, 0.4, 1.8);
          this.spawnEffect(
            (a1.x + a2.x) * 0.5,
            (a1.y + a2.y) * 0.5,
            "absorb",
            C_GREEN,
          );
        }
      }
    }
  }

  private tickBondForces(dt: number): void {
    for (const a1 of this.atoms) {
      if (a1.dying) continue;
      a1.bondPhase += dt * 3.5;

      for (const bid of [...a1.bonds]) {
        const a2 = this.atoms.find((a) => a.id === bid);
        if (!a2 || a2.dying) {
          // Partner gone — break bond
          a1.bonds = a1.bonds.filter((id) => id !== bid);
          this.createLightningArc(
            a1.x,
            a1.y,
            a1.x + (Math.random() - 0.5) * 60,
            a1.y + (Math.random() - 0.5) * 60,
            C_RED,
            0.25,
            1.5,
          );
          continue;
        }

        const dx = a2.x - a1.x;
        const dy = a2.y - a1.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const eqDist = (a1.maxOrbitR + a2.maxOrbitR) * 0.65;
        const maxDist = eqDist * 2.5;

        if (dist > maxDist) {
          // Bond breaks — too far
          a1.bonds = a1.bonds.filter((id) => id !== a2.id);
          a2.bonds = a2.bonds.filter((id) => id !== a1.id);
          this.createLightningArc(a1.x, a1.y, a2.x, a2.y, C_RED, 0.2, 2.5);
          continue;
        }

        // Spring force (Hooke)
        const stretch = dist - eqDist;
        const k = 90;
        const fx = (dx / dist) * k * stretch;
        const fy = (dy / dist) * k * stretch;

        // Viscous damping — bleed relative velocity along bond axis so they slow together
        const damping = 55;
        const relVx = a1.vx - a2.vx;
        const relVy = a1.vy - a2.vy;
        const relVn = relVx * (dx / dist) + relVy * (dy / dist);
        const dfx = (dx / dist) * damping * relVn;
        const dfy = (dy / dist) * damping * relVn;

        a1.vx = (a1.vx + (fx - dfx) * dt) * 0.98;
        a1.vy = (a1.vy + (fy - dfy) * dt) * 0.98;
        // a2 gets equal/opposite in its own loop iteration
      }
    }
  }

  // ── Lightning ─────────────────────────────────────────────────────────────

  private createLightningArc(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: number,
    maxTimer: number,
    width: number,
  ): void {
    const segments = this.buildLightningPath(x1, y1, x2, y2, 6);
    this.lightningArcs.push({
      id: this.nextId++,
      x1,
      y1,
      x2,
      y2,
      segments,
      color,
      timer: 0,
      maxTimer,
      width,
    });
  }

  private buildLightningPath(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    splits: number,
  ): Array<{ x: number; y: number }> {
    const pts: Array<{ x: number; y: number }> = [{ x: x1, y: y1 }];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    const perp = { x: -dy / len, y: dx / len };

    for (let i = 1; i < splits; i++) {
      const t = i / splits;
      const jitter = (Math.random() - 0.5) * len * 0.35;
      pts.push({
        x: x1 + dx * t + perp.x * jitter,
        y: y1 + dy * t + perp.y * jitter,
      });
    }
    pts.push({ x: x2, y: y2 });
    return pts;
  }

  private tickLightning(dt: number): void {
    for (const arc of this.lightningArcs) {
      arc.timer += dt;
      // Regenerate path for flickering
      if (arc.timer < arc.maxTimer * 0.6 && Math.random() < 0.4) {
        arc.segments = this.buildLightningPath(
          arc.x1,
          arc.y1,
          arc.x2,
          arc.y2,
          6,
        );
      }
    }
    this.lightningArcs = this.lightningArcs.filter((a) => a.timer < a.maxTimer);
  }

  private spawnAmbientLightning(dt: number): void {
    this.lightningTimer -= dt;
    if (this.lightningTimer > 0) return;
    this.lightningTimer = 0.4 + Math.random() * 0.8;

    const alive = this.atoms.filter((a) => !a.dying);
    if (alive.length < 2) return;

    // Random close pair — arc between them
    for (let attempt = 0; attempt < 5; attempt++) {
      const a1 = alive[Math.floor(Math.random() * alive.length)];
      const a2 = alive[Math.floor(Math.random() * alive.length)];
      if (a1 === a2) continue;
      const dx = a1.x - a2.x;
      const dy = a1.y - a2.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < (a1.maxOrbitR + a2.maxOrbitR) * 1.3) {
        const colors = [C_SKY, C_LAVENDER, C_MAUVE, C_TEAL];
        const col = colors[Math.floor(Math.random() * colors.length)];
        this.createLightningArc(
          a1.x,
          a1.y,
          a2.x,
          a2.y,
          col,
          0.18 + Math.random() * 0.22,
          1.2,
        );
        break;
      }
    }
  }

  // ── Draw ──────────────────────────────────────────────────────────────────

  private draw(): void {
    const g = this.gfx;
    g.clear();

    g.rect(0, 0, this.w, this.h).fill({ color: C_BASE });
    this.drawBackground(g);
    this.drawEffects(g);
    this.drawBonds(g);
    this.drawLightning(g);
    this.drawNeutrons(g);
    for (const atom of this.atoms) {
      if (!atom.dying) this.drawAtom(g, atom);
    }
    this.updateLabels();
  }

  private drawBonds(g: Graphics): void {
    const drawn = new Set<string>();
    for (const a1 of this.atoms) {
      if (a1.dying || a1.bonds.length === 0) continue;
      for (const bid of a1.bonds) {
        const key = [Math.min(a1.id, bid), Math.max(a1.id, bid)].join("-");
        if (drawn.has(key)) continue;
        drawn.add(key);

        const a2 = this.atoms.find((a) => a.id === bid);
        if (!a2 || a2.dying) continue;

        const pulse = 0.5 + 0.5 * Math.sin(a1.bondPhase);
        const dx = a2.x - a1.x;
        const dy = a2.y - a1.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const steps = 14;

        // Draw bond as sinusoidal wave (vibrational bond)
        const perp = { x: -dy / dist, y: dx / dist };
        const amp = 4 + pulse * 5;
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const wave = Math.sin(t * Math.PI * 3 + a1.bondPhase * 2) * amp;
          const bx = a1.x + dx * t + perp.x * wave;
          const by = a1.y + dy * t + perp.y * wave;
          if (i === 0) g.moveTo(bx, by);
          else g.lineTo(bx, by);
        }
        g.stroke({ width: 2.5, color: C_GREEN, alpha: 0.5 + pulse * 0.35 });

        // Glow core
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const bx = a1.x + dx * t;
          const by = a1.y + dy * t;
          if (i === 0) g.moveTo(bx, by);
          else g.lineTo(bx, by);
        }
        g.stroke({ width: 1, color: 0xffffff, alpha: 0.15 + pulse * 0.1 });

        // Bond energy dots along the bond
        for (let i = 1; i < 4; i++) {
          const t = i / 4 + Math.sin(this.time * 2 + i) * 0.05;
          const bx = a1.x + dx * t;
          const by = a1.y + dy * t;
          g.circle(bx, by, 2.5).fill({
            color: C_GREEN,
            alpha: 0.6 + pulse * 0.3,
          });
        }
      }
    }
  }

  private drawLightning(g: Graphics): void {
    for (const arc of this.lightningArcs) {
      const progress = arc.timer / arc.maxTimer;
      const alpha = (1 - progress) * 0.9;
      const pts = arc.segments;

      // Outer glow pass
      for (let i = 0; i < pts.length - 1; i++) {
        g.moveTo(pts[i].x, pts[i].y)
          .lineTo(pts[i + 1].x, pts[i + 1].y)
          .stroke({
            width: arc.width * 3,
            color: arc.color,
            alpha: alpha * 0.15,
          });
      }
      // Core
      for (let i = 0; i < pts.length - 1; i++) {
        g.moveTo(pts[i].x, pts[i].y)
          .lineTo(pts[i + 1].x, pts[i + 1].y)
          .stroke({ width: arc.width, color: arc.color, alpha: alpha });
      }
      // White hot center
      for (let i = 0; i < pts.length - 1; i++) {
        g.moveTo(pts[i].x, pts[i].y)
          .lineTo(pts[i + 1].x, pts[i + 1].y)
          .stroke({
            width: arc.width * 0.35,
            color: 0xffffff,
            alpha: alpha * 0.6,
          });
      }
    }
  }

  private drawBackground(g: Graphics): void {
    const t = this.time;

    // Subtle radial energy pulses emanating from reaction zones
    for (const ef of this.reactions) {
      const prog = ef.timer / ef.maxTimer;
      if (prog < 0.6) {
        const r = prog * Math.min(this.w, this.h) * 0.7;
        g.circle(ef.x, ef.y, r).fill({
          color: ef.color,
          alpha: (0.6 - prog) * 0.03,
        });
      }
    }

    // Slow ambient nebula shimmer — 4 drifting luminous blobs
    const blobDefs = [
      { ox: 0.2, oy: 0.3, color: C_MAUVE, phase: 0 },
      { ox: 0.75, oy: 0.2, color: C_BLUE, phase: 1.8 },
      { ox: 0.6, oy: 0.75, color: C_TEAL, phase: 3.4 },
      { ox: 0.25, oy: 0.7, color: C_PEACH, phase: 5.1 },
    ];
    for (const b of blobDefs) {
      const bx = b.ox * this.w + Math.sin(t * 0.12 + b.phase) * this.w * 0.08;
      const by =
        b.oy * this.h + Math.cos(t * 0.09 + b.phase * 1.3) * this.h * 0.07;
      const br = 80 + 40 * Math.sin(t * 0.15 + b.phase);
      const ba = 0.03 + 0.015 * Math.sin(t * 0.2 + b.phase);
      g.circle(bx, by, br * 2).fill({ color: b.color, alpha: ba * 0.4 });
      g.circle(bx, by, br).fill({ color: b.color, alpha: ba });
    }

    // Grid
    const sp = 55;
    for (let x = 0; x < this.w; x += sp) {
      g.moveTo(x, 0)
        .lineTo(x, this.h)
        .stroke({ width: 0.35, color: C_SURFACE0, alpha: 0.55 });
    }
    for (let y = 0; y < this.h; y += sp) {
      g.moveTo(0, y)
        .lineTo(this.w, y)
        .stroke({ width: 0.35, color: C_SURFACE0, alpha: 0.55 });
    }

    // Grid intersection dots — shimmer based on time
    for (let xi = 0; xi * sp < this.w; xi++) {
      for (let yi = 0; yi * sp < this.h; yi++) {
        const px = xi * sp;
        const py = yi * sp;
        const phase = Math.sin(t * 0.6 + xi * 0.4 + yi * 0.5);
        const dotA = 0.15 + phase * 0.12;
        const dotR = 0.7 + phase * 0.4;
        g.circle(px, py, dotR).fill({
          color: C_SUBTEXT,
          alpha: Math.max(0.05, dotA),
        });
      }
    }

    // Energetic field lines around active reactions — thin arcs
    for (const ef of this.reactions) {
      if (ef.type === "fission" || ef.type === "fusion") {
        const prog = ef.timer / ef.maxTimer;
        const arcCount = 6;
        for (let ai = 0; ai < arcCount; ai++) {
          const baseA = (ai / arcCount) * Math.PI * 2 + t * 1.2 + ef.id;
          const r = 40 + prog * 90;
          const arc = Math.PI * 0.22;
          const x1 = ef.x + Math.cos(baseA) * r;
          const y1 = ef.y + Math.sin(baseA) * r;
          const x2 = ef.x + Math.cos(baseA + arc) * r;
          const y2 = ef.y + Math.sin(baseA + arc) * r;
          g.moveTo(x1, y1)
            .lineTo(x2, y2)
            .stroke({
              width: 0.8,
              color: ef.color,
              alpha: (1 - prog) * 0.35,
            });
        }
      }
    }
  }

  private drawNeutrons(g: Graphics): void {
    for (const n of this.neutrons) {
      const age = n.life / n.maxLife;
      const alpha = Math.max(0, 1 - age) * 0.95;
      const spd = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
      const nx = n.vx / (spd || 1);
      const ny = n.vy / (spd || 1);
      const tailLen = Math.min(spd * 0.06, 18);
      // Tail
      g.moveTo(n.x, n.y)
        .lineTo(n.x - nx * tailLen, n.y - ny * tailLen)
        .stroke({ width: 2.5, color: C_OVERLAY0, alpha: alpha * 0.45 });
      // Glow
      g.circle(n.x, n.y, 6).fill({ color: C_OVERLAY0, alpha: alpha * 0.2 });
      // Body
      g.circle(n.x, n.y, 4).fill({ color: C_OVERLAY0, alpha: alpha * 0.9 });
      g.circle(n.x, n.y, 2).fill({ color: C_TEXT, alpha: alpha * 0.5 });
    }
  }

  private drawAtom(g: Graphics, atom: Atom): void {
    const rp = atom.reacting
      ? Math.abs(Math.sin(atom.reactTimer * Math.PI * 9))
      : 0;
    const flicker = 0.5 + 0.5 * Math.sin(atom.flickerPhase);

    // Vibration displacement — bigger when bonded or reacting
    const vibAmp = (atom.bonds.length > 0 ? 1.8 : 0.5) + rp * 3;
    const vx = Math.sin(this.time * 18 + atom.id * 1.7) * vibAmp;
    const vy = Math.cos(this.time * 21 + atom.id * 2.3) * vibAmp;
    const ax = atom.x + vx;
    const ay = atom.y + vy;

    // Orbital ellipses (one per shell) — drawn at vibrated position
    const shownShells = new Set(atom.electrons.map((e) => e.shell));
    for (const si of shownShells) {
      const el = atom.electrons.find((e) => e.shell === si);
      if (!el) continue;
      this.strokeEllipse(g, ax, ay, el.orbitRx, el.orbitRy, el.tilt, {
        width: 0.7,
        color: atom.electronColor,
        alpha: 0.12 + rp * 0.12,
      });
    }

    // Electrons
    for (const e of atom.electrons) {
      const ex =
        ax +
        Math.cos(e.angle) * e.orbitRx * Math.cos(e.tilt) -
        Math.sin(e.angle) * e.orbitRy * Math.sin(e.tilt);
      const ey =
        ay +
        Math.cos(e.angle) * e.orbitRx * Math.sin(e.tilt) +
        Math.sin(e.angle) * e.orbitRy * Math.cos(e.tilt);
      const ea = 0.55 + rp * 0.35 + flicker * 0.1;
      g.circle(ex, ey, 5.5).fill({
        color: atom.electronColor,
        alpha: ea * 0.25,
      });
      g.circle(ex, ey, 3).fill({ color: atom.electronColor, alpha: ea * 0.85 });
      g.circle(ex, ey, 1.4).fill({ color: 0xffffff, alpha: ea * 0.7 });
    }

    // Nucleus outer glow
    const glowAlpha = 0.07 + rp * 0.12 + flicker * 0.03;
    g.circle(ax, ay, atom.nucleusR * 2.8 + rp * 6).fill({
      color: atom.color,
      alpha: glowAlpha,
    });
    g.circle(ax, ay, atom.nucleusR * 1.6 + rp * 3).fill({
      color: atom.color,
      alpha: glowAlpha * 2.5,
    });

    if (atom.protons <= 10) {
      this.drawDetailedNucleus(g, ax, ay, atom, rp);
    } else {
      this.drawSimpleNucleus(g, ax, ay, atom, rp, flicker);
    }
  }

  private drawDetailedNucleus(
    g: Graphics,
    cx: number,
    cy: number,
    atom: Atom,
    rp: number,
  ): void {
    const r = atom.nucleusR;
    const total = Math.min(atom.protons + atom.neutrons, 20);
    const t = this.time * 0.4;

    for (let i = 0; i < total; i++) {
      const isProton = i < atom.protons;
      let nx: number;
      let ny: number;

      if (i === 0) {
        nx = cx;
        ny = cy;
      } else if (i < 5) {
        const a = (i / 4) * Math.PI * 2 + t;
        nx = cx + Math.cos(a) * r * 0.45;
        ny = cy + Math.sin(a) * r * 0.45;
      } else {
        const a = ((i - 5) / (total - 5)) * Math.PI * 2 + t * 0.6;
        nx = cx + Math.cos(a) * r * 0.9;
        ny = cy + Math.sin(a) * r * 0.9;
      }

      const color = isProton ? C_RED : C_OVERLAY0;
      const dr = 3.2 + rp * 1.5;
      g.circle(nx, ny, dr + 1.5).fill({ color, alpha: 0.3 });
      g.circle(nx, ny, dr).fill({ color, alpha: 0.95 });
      if (isProton)
        g.circle(nx, ny, 1.5).fill({ color: 0xffffff, alpha: 0.35 });
    }

    g.circle(cx, cy, r + rp * 2).stroke({
      width: 1.2,
      color: atom.color,
      alpha: 0.45 + rp * 0.4,
    });
  }

  private drawSimpleNucleus(
    g: Graphics,
    cx: number,
    cy: number,
    atom: Atom,
    rp: number,
    flicker: number,
  ): void {
    const r = atom.nucleusR;
    const pulse = 1 + rp * 0.18 + flicker * 0.04;

    g.circle(cx, cy, r * pulse * 1.35).fill({
      color: atom.color,
      alpha: 0.22 + rp * 0.18,
    });
    g.circle(cx, cy, r * pulse).fill({
      color: atom.color,
      alpha: 0.78 + rp * 0.18,
    });
    g.circle(cx, cy, r * pulse * 0.55).fill({
      color: 0xffffff,
      alpha: 0.28 + rp * 0.22,
    });
    g.circle(cx, cy, r * pulse).stroke({
      width: 1.8,
      color: 0xffffff,
      alpha: 0.18 + rp * 0.28,
    });

    // Decorative spin lines inside nucleus for large atoms
    if (atom.protons >= 26) {
      const t = this.time * 0.7;
      for (let i = 0; i < 3; i++) {
        const a = t + (i / 3) * Math.PI * 2;
        const ix = cx + Math.cos(a) * r * 0.5 * pulse;
        const iy = cy + Math.sin(a) * r * 0.5 * pulse;
        g.circle(ix, iy, 2).fill({ color: C_RED, alpha: 0.7 + rp * 0.25 });
      }
    }
  }

  private strokeEllipse(
    g: Graphics,
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    tilt: number,
    style: { width: number; color: number; alpha: number },
  ): void {
    const steps = 48;
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const x =
        cx +
        Math.cos(a) * rx * Math.cos(tilt) -
        Math.sin(a) * ry * Math.sin(tilt);
      const y =
        cy +
        Math.cos(a) * rx * Math.sin(tilt) +
        Math.sin(a) * ry * Math.cos(tilt);
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke(style);
  }

  private drawEffects(g: Graphics): void {
    for (const ef of this.reactions) {
      const prog = ef.timer / ef.maxTimer;
      const alpha = 1 - prog;

      // Expanding rings
      for (let ri = 0; ri < ef.rings; ri++) {
        const rr = (prog + ri * 0.22) * 130;
        const ra = alpha * (1 - ri * 0.28);
        g.circle(ef.x, ef.y, rr).stroke({
          width: Math.max(0.5, 2.5 - prog * 2.5),
          color: ef.color,
          alpha: ra,
        });
      }

      // Particles
      for (const p of ef.particles) {
        g.circle(p.x, p.y, 3.2 * (1 - prog * 0.6)).fill({
          color: p.color,
          alpha: alpha * 0.85,
        });
      }

      // Central flash
      if (prog < 0.28) {
        const fa = (0.28 - prog) / 0.28;
        const fr = 50 * (prog / 0.28);
        g.circle(ef.x, ef.y, fr).fill({ color: 0xffffff, alpha: fa * 0.9 });
      }

      // Reaction type label flash
      if (prog < 0.5) {
        const label =
          ef.type === "fission"
            ? "FISSION"
            : ef.type === "fusion"
              ? "FUSION"
              : ef.type === "absorb"
                ? "ABSORB"
                : "SCATTER";
        void label; // rendered via Text separately - this is a placeholder
      }
    }
  }

  private updateLabels(): void {
    for (const atom of this.atoms) {
      if (atom.dying) continue;
      const lbl = this.labels.get(atom.id);
      if (!lbl) continue;
      lbl.sym.x = atom.x;
      lbl.sym.y = atom.y + atom.maxOrbitR + 6;
      lbl.info.x = atom.x;
      lbl.info.y = atom.y + atom.maxOrbitR + 22;
    }
  }

  public resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
  }
}
