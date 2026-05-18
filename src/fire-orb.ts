import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

// ── Renderer ──────────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true,
  premultipliedAlpha: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
document.body.style.cssText = "margin:0;overflow:hidden;background:transparent";
document.body.appendChild(renderer.domElement);

// ── Scene / Camera ────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);
camera.position.set(0, 0, 11);

// ── Shared GLSL: 3-D simplex noise + 5-octave fBm ────────────────────────────
const NOISE_GLSL = /* glsl */ `
vec3 _m289v3(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 _m289v4(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 _perm(vec4 x){return _m289v4(((x*34.)+1.)*x);}
vec4 _tis(vec4 r){return 1.79284291400159-0.85373472095314*r;}

float snoise(vec3 v){
  const vec2 C=vec2(1./6.,1./3.);
  const vec4 D=vec4(0.,.5,1.,2.);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz),l=1.-g;
  vec3 i1=min(g.xyz,l.zxy),i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx,x2=x0-i2+C.yyy,x3=x0-D.yyy;
  i=_m289v3(i);
  vec4 p=_perm(_perm(_perm(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
  vec3 ns=0.142857142857*D.wyz-D.xzx;
  vec4 j=p-49.*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z),y_=floor(j-7.*x_);
  vec4 xs=x_*ns.x+ns.yyyy,ys=y_*ns.x+ns.yyyy;
  vec4 h=1.-abs(xs)-abs(ys);
  vec4 b0=vec4(xs.xy,ys.xy),b1=vec4(xs.zw,ys.zw);
  vec4 s0=floor(b0)*2.+1.,s1=floor(b1)*2.+1.;
  vec4 sh=-step(h,vec4(0.));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy,a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x),p1=vec3(a0.zw,h.y),p2=vec3(a1.xy,h.z),p3=vec3(a1.zw,h.w);
  vec4 norm=_tis(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);
  m*=m;
  return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}

float fbm(vec3 p){
  float v=0.,a=.5;
  for(int i=0;i<5;i++){v+=a*snoise(p);p=p*2.1+vec3(1.7,9.2,2.9);a*=.5;}
  return v;
}`;

// ── Fire color gradient  (t=0 white-hot, t=1 near-black cool) ─────────────────
const FIRE_GRAD_GLSL = /* glsl */ `
vec3 fireGrad(float t){
  t=clamp(t,0.,1.);
  if(t<.2)  return mix(vec3(1.,1.,.95),vec3(1.,.9,.1), t/0.2);
  if(t<.45) return mix(vec3(1.,.9,.1), vec3(1.,.32,.0),(t-.2)/.25);
  if(t<.70) return mix(vec3(1.,.32,.0),vec3(.78,.04,.0),(t-.45)/.25);
  return         mix(vec3(.78,.04,.0), vec3(.07,.0,.0), (t-.70)/.30);
}`;

// ── Core fire sphere ──────────────────────────────────────────────────────────
const coreUniforms = {
  uTime: { value: 0 },
  uPulse: { value: 1 },
};

const coreMesh = new THREE.Mesh(
  new THREE.SphereGeometry(1.0, 128, 128),
  new THREE.ShaderMaterial({
    uniforms: coreUniforms,
    vertexShader: /* glsl */ `
      ${NOISE_GLSL}
      uniform float uTime;
      uniform float uPulse;
      varying vec3 vLocalPos;
      varying vec3 vWorldPos;
      varying vec3 vWorldNorm;

      void main(){
        vLocalPos=position;
        // Multi-octave noise displacement — three frequency bands for rich surface
        float d1=snoise(position*1.8+vec3(uTime*.44, uTime*.31, 0.));
        float d2=snoise(position*3.6-vec3(0.,uTime*.37,uTime*.26));
        float d3=snoise(position*7.2+vec3(uTime*.63,0.,-uTime*.47));
        float disp=(d1*.14+d2*.07+d3*.03)*uPulse;
        vec3 displaced=position+normal*disp;
        vWorldPos=(modelMatrix*vec4(displaced,1.)).xyz;
        vWorldNorm=normalize(mat3(modelMatrix)*normal);
        gl_Position=projectionMatrix*modelViewMatrix*vec4(displaced,1.);
      }
    `,
    fragmentShader: /* glsl */ `
      ${NOISE_GLSL}
      ${FIRE_GRAD_GLSL}
      uniform float uTime;
      uniform float uPulse;
      uniform vec3 cameraPosition;
      varying vec3 vLocalPos;
      varying vec3 vWorldPos;
      varying vec3 vWorldNorm;

      void main(){
        vec3 viewDir=normalize(cameraPosition-vWorldPos);
        float fresnel=1.-abs(dot(normalize(vWorldNorm),viewDir));
        fresnel=pow(fresnel,1.8);

        // Animated surface noise for fire texture
        float n=fbm(vLocalPos*2.3+vec3(uTime*.38,uTime*.26,-uTime*.19));
        n=n*.5+.5; // remap [0,1]; n=1 => peak bump => hot

        // Invert: peaks hot (heat=0 white), troughs cool (heat=1 dark red)
        float heat=1.-n;
        // Rim pulled toward orange-yellow zone (heat~0.15)
        heat=mix(heat,.12,fresnel*.55);

        vec3 col=fireGrad(heat);

        // Additive glow on hottest zones
        float glow=smoothstep(.45,.0,heat)*2.8*uPulse;
        col+=vec3(1.,.85,.35)*glow;

        col*=.95+.05*uPulse;
        gl_FragColor=vec4(col,1.);
      }
    `,
  }),
);
scene.add(coreMesh);

// ── Energy shells: inner orange, mid red, outer aura ─────────────────────────
function makeShell(
  radius: number,
  hexColor: number,
  rimPow: number,
  intensity: number,
): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.SphereGeometry(radius, 64, 64),
    new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(hexColor) },
        uInt: { value: intensity },
      },
      vertexShader: /* glsl */ `
        varying vec3 vNorm;
        void main(){vNorm=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;uniform float uInt;
        varying vec3 vNorm;
        void main(){
          float f=1.-abs(dot(normalize(vNorm),vec3(0.,0.,1.)));
          f=pow(f,${rimPow.toFixed(1)});
          gl_FragColor=vec4(uColor*f*uInt,f);
        }
      `,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    }),
  );
}

scene.add(makeShell(1.3, 0xff5200, 2.2, 2.5)); // hot orange inner shell
scene.add(makeShell(1.7, 0xff1a00, 3.2, 1.5)); // deep red mid shell
scene.add(makeShell(2.3, 0x3300cc, 4.5, 0.7)); // blue-purple energy aura

// ── Flickering point light from inside the orb ────────────────────────────────
const innerLight = new THREE.PointLight(0xff5500, 8, 10, 2);
scene.add(innerLight);

// ── Ambient fire particles — drift outward from surface, recycle ──────────────
const PART_N = 5000;
const pPos = new Float32Array(PART_N * 3);
const pData = new Float32Array(PART_N * 4); // theta, phi, r, speed

function resetParticle(i: number, onSurface: boolean): void {
  pData[i * 4] = Math.random() * Math.PI * 2;
  pData[i * 4 + 1] = Math.acos(2 * Math.random() - 1);
  pData[i * 4 + 2] = onSurface
    ? 1.0 + Math.random() * 0.08
    : 1.0 + Math.random() * 1.1;
  pData[i * 4 + 3] = 0.2 + Math.random() * 0.8;
}

for (let i = 0; i < PART_N; i++) {
  resetParticle(i, false);
  const th = pData[i * 4],
    ph = pData[i * 4 + 1],
    r = pData[i * 4 + 2];
  pPos[i * 3] = Math.sin(ph) * Math.cos(th) * r;
  pPos[i * 3 + 1] = Math.sin(ph) * Math.sin(th) * r;
  pPos[i * 3 + 2] = Math.cos(ph) * r;
}

const partGeo = new THREE.BufferGeometry();
partGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
scene.add(
  new THREE.Points(
    partGeo,
    new THREE.PointsMaterial({
      color: 0xff4400,
      size: 0.022,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      opacity: 0.88,
    }),
  ),
);

// ── Orbital sparks — orbit around sphere in random tilted planes ───────────────
const ORBT_N = 700;
const oPos = new Float32Array(ORBT_N * 3);
// layout per particle: [ang, r, speed, incl, omega]
const oData = new Float32Array(ORBT_N * 5);

for (let i = 0; i < ORBT_N; i++) {
  oData[i * 5] = Math.random() * Math.PI * 2; // ang
  oData[i * 5 + 1] = 1.12 + Math.random() * 0.42; // r
  oData[i * 5 + 2] =
    (Math.random() > 0.5 ? 1 : -1) * (0.5 + Math.random() * 0.9); // speed
  oData[i * 5 + 3] = (Math.random() - 0.5) * Math.PI; // incl (x-axis tilt)
  oData[i * 5 + 4] = Math.random() * Math.PI * 2; // omega (y-axis rotation)
}

const orbGeo = new THREE.BufferGeometry();
orbGeo.setAttribute("position", new THREE.BufferAttribute(oPos, 3));
scene.add(
  new THREE.Points(
    orbGeo,
    new THREE.PointsMaterial({
      color: 0xffcc44,
      size: 0.016,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      opacity: 0.75,
    }),
  ),
);

// ── Shockwave rings — thin expanding tori emitted every few seconds ────────────
type Shockwave = {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  r: number;
  alive: boolean;
};

const waves: Shockwave[] = [];
for (let i = 0; i < 3; i++) {
  const mat = new THREE.MeshBasicMaterial({
    color: 0xff6600,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.RingGeometry(0.97, 1.03, 128), mat);
  scene.add(mesh);
  waves.push({ mesh, mat, r: 1, alive: false });
}

let nextWaveAt = 4.0;
let cameraShake = 0;

function spawnWave(t: number): void {
  const w = waves.find((x) => !x.alive);
  if (!w) return;
  w.r = 1.0;
  w.mat.opacity = 0.9;
  w.mesh.scale.setScalar(1.0);
  w.mesh.rotation.set(
    (Math.random() - 0.5) * Math.PI,
    Math.random() * Math.PI * 2,
    0,
  );
  w.alive = true;
  nextWaveAt = t + 3.5 + Math.random() * 4;
  cameraShake = 0.06;
}

// ── Controls ──────────────────────────────────────────────────────────────────
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 2;
controls.maxDistance = 14;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.4;

// ── Post-processing: bloom ────────────────────────────────────────────────────
// Explicit RGBA render target so alpha is preserved through the bloom passes
const rtSize = new THREE.Vector2(window.innerWidth, window.innerHeight);
const composerRT = new THREE.WebGLRenderTarget(rtSize.x, rtSize.y, {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  type: THREE.HalfFloatType,
  format: THREE.RGBAFormat,
});
const composer = new EffectComposer(renderer, composerRT);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(
  new UnrealBloomPass(
    rtSize,
    2.2, // strength
    0.65, // radius
    0.1, // threshold — low so all fire tones glow
  ),
);
composer.addPass(new OutputPass());

// ── Animation ─────────────────────────────────────────────────────────────────
const clock = new THREE.Clock();
let elapsed = 0;

function animate(): void {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;

  // Compound pulse: slow breathe + medium flutter + fast shimmer
  const pulse =
    1.0 +
    0.1 * Math.sin(elapsed * 0.72) +
    0.035 * Math.sin(elapsed * 4.85) +
    0.012 * Math.sin(elapsed * 12.1);

  coreUniforms.uTime.value = elapsed;
  coreUniforms.uPulse.value = pulse;
  coreMesh.scale.setScalar(pulse);
  coreMesh.rotation.y += dt * 0.12;
  coreMesh.rotation.x += dt * 0.04;

  // Inner light flicker
  innerLight.intensity =
    7 + 4 * Math.sin(elapsed * 2.1) + 1.5 * Math.sin(elapsed * 7.3);

  // Ambient particles: drift outward, reset at max radius
  for (let i = 0; i < PART_N; i++) {
    let r = pData[i * 4 + 2];
    r += dt * pData[i * 4 + 3] * 0.36;
    if (r > 2.5) {
      resetParticle(i, true);
    } else {
      pData[i * 4 + 2] = r;
    }
    const th = pData[i * 4],
      ph = pData[i * 4 + 1],
      ri = pData[i * 4 + 2];
    pPos[i * 3] = Math.sin(ph) * Math.cos(th) * ri;
    pPos[i * 3 + 1] = Math.sin(ph) * Math.sin(th) * ri;
    pPos[i * 3 + 2] = Math.cos(ph) * ri;
  }
  partGeo.attributes.position.needsUpdate = true;

  // Orbital sparks: advance angle and compute tilted-plane position
  for (let i = 0; i < ORBT_N; i++) {
    oData[i * 5] += dt * oData[i * 5 + 2];
    const ang = oData[i * 5];
    const r = oData[i * 5 + 1];
    const incl = oData[i * 5 + 3];
    const omega = oData[i * 5 + 4];

    // Base orbit in xz plane
    const bx = r * Math.cos(ang);
    const bz = r * Math.sin(ang);

    // Tilt around x-axis by incl
    const ty = -bz * Math.sin(incl);
    const tz = bz * Math.cos(incl);

    // Rotate around y-axis by omega
    const cosO = Math.cos(omega),
      sinO = Math.sin(omega);
    oPos[i * 3] = bx * cosO + tz * sinO;
    oPos[i * 3 + 1] = ty;
    oPos[i * 3 + 2] = -bx * sinO + tz * cosO;
  }
  orbGeo.attributes.position.needsUpdate = true;

  // Shockwave emission and expansion
  if (elapsed >= nextWaveAt) spawnWave(elapsed);
  for (const w of waves) {
    if (!w.alive) continue;
    w.r += dt * 2.0;
    w.mesh.scale.setScalar(w.r);
    w.mat.opacity = Math.max(0, 0.9 * (1 - (w.r - 1.0) / 2.2));
    if (w.r > 3.2) w.alive = false;
  }

  controls.update();

  // Camera shake applied after controls (one-frame jitter per shockwave)
  if (cameraShake > 0) {
    cameraShake = Math.max(0, cameraShake - dt * 1.4);
    camera.position.x += (Math.random() - 0.5) * cameraShake;
    camera.position.y += (Math.random() - 0.5) * cameraShake;
    camera.position.z += (Math.random() - 0.5) * cameraShake;
  }

  composer.render();
}

animate();

// ── Resize ────────────────────────────────────────────────────────────────────
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composerRT.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});
