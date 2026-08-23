import type { Ticker } from "pixi.js";
import {
  Container,
  Filter,
  GlProgram,
  Sprite,
  Texture,
  UniformGroup,
} from "pixi.js";
import { HASH12_GLSL, VNOISE_GLSL } from "../../lib/shaders/noise";

const VERT = `in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;uniform vec4 uOutputFrame;uniform vec4 uOutputTexture;
vec4 filterVertexPosition(void){
  vec2 position=aPosition*uOutputFrame.zw+uOutputFrame.xy;
  position.x=position.x*(2.0/uOutputTexture.x)-1.0;
  position.y=position.y*(2.0*uOutputTexture.z/uOutputTexture.y)-uOutputTexture.z;
  return vec4(position,0.0,1.0);}
vec2 filterTextureCoord(void){return aPosition*(uOutputFrame.zw*uInputSize.zw);}
void main(void){gl_Position=filterVertexPosition();vTextureCoord=filterTextureCoord();}`;

// Bioluminescent Abyss: pure black deep-sea base
// glowing cyan + electric aquamarine + bio-green + warm bioluminescent white
// Vein-style like psychedelic-marble (not cycling), bands are narrow glowing filaments on black
const FRAG = `#version 300 es
precision highp float;
in vec2 vTextureCoord;
out vec4 fragColor;
uniform float uTime;
uniform vec2 uResolution;

${HASH12_GLSL}
${VNOISE_GLSL}
const mat2 R=mat2(0.77,0.63,-0.63,0.77);
float fbm(vec2 p){float v=0.;float a=0.5;for(int i=0;i<7;i++){v+=a*vnoise(p);p=R*p*2.01+vec2(6.1,4.8);a*=0.47;}return v;}

void main(){
  vec2 uvN=vTextureCoord;
  vec2 uv=(uvN-0.5)*vec2(uResolution.x/uResolution.y,1.0);
  float t=uTime*0.13;
  vec2 p=uv*3.1+vec2(t*0.05,t*0.04);

  vec2 q=vec2(fbm(p),fbm(p+vec2(5.0,1.8)));
  vec2 w=vec2(fbm(p+4.3*q+vec2(2.1+t*.10,8.4-t*.08)),fbm(p+4.3*q+vec2(8.0+t*.05,3.3+t*.09)));
  vec2 r=vec2(fbm(p+3.2*w+vec2(-3.0,6.3)),fbm(p+3.2*w+vec2(4.2,-2.1)));
  float f=fbm(p+3.7*r+vec2(t*.05,-t*.04));

  float swirl=fbm(p+5.1*q+vec2(0.,t*.07));
  float band=sin((f*5.0+swirl*2.6)*3.14159);

  vec2 sp=uv*4.0+vec2(-t*.05,t*.08);
  vec2 sq=vec2(fbm(sp),fbm(sp+vec2(3.2,7.1)));
  float blob=fbm(sp+2.9*sq);
  float blobBand=sin(blob*5.8*3.14159+t*0.32);
  float b=mix(band,blobBand,0.30);

  // Palette: void black, deep-sea teal, electric cyan, bio aquamarine, hot white-green
  vec3 abyss  =vec3(0.000,0.018,0.030); // near-black deep ocean
  vec3 seaTeal=vec3(0.000,0.498,0.498); // #007F7F deep-sea teal
  vec3 cyan   =vec3(0.000,0.898,0.910); // #00E5E8 electric cyan
  vec3 bioGreen=vec3(0.200,1.000,0.510);// #33FF82 bioluminescent green
  vec3 glow   =vec3(0.860,1.000,0.910); // #DBF-E8 phosphorescent white-green

  float bN=b*0.5+0.5;

  float t1=smoothstep(0.50,0.60,bN);
  float t2=smoothstep(0.60,0.72,bN);
  float t3=smoothstep(0.72,0.84,bN);
  float t4=smoothstep(0.88,0.96,bN);

  vec3 col=abyss;
  col=mix(col,seaTeal, t1);
  col=mix(col,cyan,    t2);
  col=mix(col,bioGreen,t3);
  col=mix(col,glow,    t4);

  // Outlines stay near abyss-black
  float e1=abs(bN-0.59); float e2=abs(bN-0.76); float e3=abs(bN-0.87);
  float outline=smoothstep(0.022,0.,e1)+smoothstep(0.018,0.,e2)+smoothstep(0.014,0.,e3);
  col=mix(col,abyss,clamp(outline*2.0,0.,1.));

  // Additive glow bloom — the core trick that makes it feel bioluminescent
  // Bright bands "bleed" light outward into surrounding dark
  float litBright=smoothstep(0.60,1.0,bN);
  col+=cyan*0.18*litBright*(1.-t4);
  col+=bioGreen*0.22*t3*(1.-t4);
  col+=glow*0.20*t4;

  // Deep vignette — we're at the bottom of the ocean
  vec2 vc=uvN-0.5;
  col*=1.0-0.80*dot(vc,vc)*2.4;
  col=max(col,vec3(0.));

  col+=(hash12(uvN*uResolution+fract(uTime)*79.)-0.5)*0.008;
  fragColor=vec4(clamp(col,0.,1.),1.);
}`;

export class BioluminescentMarbleScreen extends Container {
  public static assetBundles: string[] = [];
  private readonly quad: Sprite;
  private readonly uniforms: UniformGroup;
  private readonly resolution = new Float32Array([1920, 1080]);
  private time = 0;

  constructor() {
    super();
    this.uniforms = new UniformGroup({
      uTime: { value: 0, type: "f32" },
      uResolution: { value: this.resolution, type: "vec2<f32>" },
    });
    this.quad = new Sprite(Texture.WHITE);
    this.quad.filters = [
      new Filter({
        glProgram: new GlProgram({ vertex: VERT, fragment: FRAG }),
        resources: { u: this.uniforms },
      }),
    ];
    this.addChild(this.quad);
  }

  public async show(): Promise<void> {}
  public async hide(): Promise<void> {}

  public resize(w: number, h: number): void {
    this.quad.width = w;
    this.quad.height = h;
    this.resolution[0] = w;
    this.resolution[1] = h;
  }

  public update(ticker: Ticker): void {
    this.time += Math.min(ticker.deltaMS, 50) / 1000;
    this.uniforms.uniforms.uTime = this.time;
  }
}
