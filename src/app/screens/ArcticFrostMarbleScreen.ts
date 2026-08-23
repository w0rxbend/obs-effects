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

// Arctic Frost: pure white + ice blue + cerulean + midnight navy cycling bands
// Bright, cold, crystalline — opposite energy from the fire/dark palettes
const FRAG = `#version 300 es
precision highp float;
in vec2 vTextureCoord;
out vec4 fragColor;
uniform float uTime;
uniform vec2 uResolution;

${HASH12_GLSL}
${VNOISE_GLSL}
const mat2 R=mat2(0.74,0.67,-0.67,0.74);
float fbm(vec2 p){float v=0.;float a=0.5;for(int i=0;i<7;i++){v+=a*vnoise(p);p=R*p*2.01+vec2(9.1,2.7);a*=0.49;}return v;}

vec3 arcticPalette(float ph){
  vec3 snow   =vec3(0.945,0.965,0.980); // near-white snow
  vec3 ice    =vec3(0.710,0.890,0.980); // #B5E3FA soft ice blue
  vec3 cerulean=vec3(0.078,0.529,0.839);// #1487D6 cerulean
  vec3 navy   =vec3(0.040,0.118,0.298); // #0A1E4C midnight navy

  float s=ph*4.; int seg=int(s); float f=fract(s);
  float fe=smoothstep(0.,0.15,f)*smoothstep(1.,0.85,f);
  if(seg==0) return mix(snow,    ice,      fe);
  if(seg==1) return mix(ice,     cerulean, fe);
  if(seg==2) return mix(cerulean,navy,     fe);
  return           mix(navy,    snow,      fe);
}

void main(){
  vec2 uvN=vTextureCoord;
  vec2 uv=(uvN-0.5)*vec2(uResolution.x/uResolution.y,1.0);
  float t=uTime*0.09; // slower — ice moves glacially

  vec2 p=uv*2.4+vec2(t*0.03,t*0.02);

  vec2 q=vec2(fbm(p),fbm(p+vec2(4.7,2.0)));
  vec2 w=vec2(fbm(p+4.5*q+vec2(1.8+t*.07,9.0-t*.05)),fbm(p+4.5*q+vec2(7.8+t*.03,2.4+t*.06)));
  vec2 r=vec2(fbm(p+3.3*w+vec2(-3.3,5.5)),fbm(p+3.3*w+vec2(4.1,-2.5)));
  float f=fbm(p+4.0*r+vec2(t*.04,-t*.03));

  // Finer banding than fire: ice has more delicate veining
  float raw=sin(f*5.5*3.14159*2.0);
  float sharp=sign(raw)*pow(abs(raw),0.32); // very flat fills, razor-thin gaps
  float phase=sharp*0.5+0.5;

  vec3 col=arcticPalette(phase);

  // Black (actually deep navy) outlines
  float pm=fract(phase*4.0);
  float edgeDist=min(pm,1.-pm);
  float outline=smoothstep(0.06,0.,edgeDist);
  col=mix(col,vec3(0.02,0.04,0.10),outline*0.88);

  // Specular glint on snow bands — crystalline highlight
  float snowZone=smoothstep(0.88,1.0,phase);
  col+=vec3(0.9,0.96,1.0)*snowZone*0.14;

  // Faint blue tint vignette (not dark, just cold edge-deepening)
  vec2 vc=uvN-0.5;
  float vig=dot(vc,vc);
  col=mix(col,vec3(0.04,0.08,0.18),vig*0.55);

  col+=(hash12(uvN*uResolution+fract(uTime)*61.)-0.5)*0.007;
  fragColor=vec4(clamp(col,0.,1.),1.);
}`;

export class ArcticFrostMarbleScreen extends Container {
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
