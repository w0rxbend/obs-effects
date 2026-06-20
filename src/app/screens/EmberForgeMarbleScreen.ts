import type { Ticker } from "pixi.js";
import {
  Container,
  Filter,
  GlProgram,
  Sprite,
  Texture,
  UniformGroup,
} from "pixi.js";

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

// Ember Forge: dark charcoal base, molten metal gradient — deep crimson → lava orange → amber → white-hot
const FRAG = `#version 300 es
precision highp float;
in vec2 vTextureCoord;
out vec4 fragColor;
uniform float uTime;
uniform vec2 uResolution;

float hash12(vec2 p){vec3 p3=fract(vec3(p.xyx)*0.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
float vnoise(vec2 p){vec2 i=floor(p);vec2 f=fract(p);vec2 u=f*f*(3.0-2.0*f);float a=hash12(i);float b=hash12(i+vec2(1,0));float c=hash12(i+vec2(0,1));float d=hash12(i+vec2(1,1));return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);}
const mat2 R=mat2(0.78,0.62,-0.62,0.78);
float fbm(vec2 p){float v=0.;float a=0.5;for(int i=0;i<6;i++){v+=a*vnoise(p);p=R*p*2.03+vec2(4.8,6.2);a*=0.47;}return v;}

// Topographic banding with 4-color cycling molten palette
vec3 moltenPalette(float ph) {
  vec3 char_  =vec3(0.040,0.018,0.008); // near-black charcoal
  vec3 crimson=vec3(0.600,0.040,0.010); // #991009 deep crimson
  vec3 lava   =vec3(0.910,0.290,0.020); // #E84A05 lava orange
  vec3 amber  =vec3(1.000,0.640,0.020); // #FFA305 amber
  vec3 hot    =vec3(1.000,0.960,0.780); // #FFF5C7 white-hot

  // 5-zone cycle
  float s=ph*5.0; int seg=int(s); float f=fract(s);
  float fe=smoothstep(0.,0.2,f)*smoothstep(1.,0.8,f);
  if(seg==0) return mix(char_, crimson,fe);
  if(seg==1) return mix(crimson,lava,  fe);
  if(seg==2) return mix(lava,  amber,  fe);
  if(seg==3) return mix(amber, hot,    fe);
  return           mix(hot,   char_,   fe);
}

void main(){
  vec2 uvN=vTextureCoord;
  vec2 uv=(uvN-0.5)*vec2(uResolution.x/uResolution.y,1.0);
  float t=uTime*0.11;
  vec2 p=uv*2.8+vec2(t*0.04,t*0.05);

  vec2 q=vec2(fbm(p),fbm(p+vec2(5.3,1.1)));
  vec2 w=vec2(fbm(p+3.8*q+vec2(1.5+t*.08,8.0-t*.06)),fbm(p+3.8*q+vec2(7.2+t*.04,2.9+t*.07)));
  float f=fbm(p+3.2*w+vec2(t*.04,-t*.03));

  // Use rising-heat bias: bottom of screen shifts phase to make it feel like rising fire
  float heatBias = (1.0 - uvN.y) * 0.3 + t * 0.03;
  float phase = fract(f * 8.0 + heatBias);

  vec3 col = moltenPalette(phase);

  // Black outlines at cycle boundaries
  float pm=fract(phase*5.0);
  float edge=min(pm,1.0-pm);
  float outline=smoothstep(0.055,0.,edge);
  col=mix(col,vec3(0.02,0.01,0.),outline*0.94);

  // Hot-spot bloom: lava glow near the bright amber bands
  float glow=smoothstep(0.6,0.85,phase)*smoothstep(1.0,0.85,phase);
  col+=vec3(1.0,0.45,0.0)*glow*0.10;

  // Slight upward-drift shimmer on hot bands
  col+=vec3(1.0,0.90,0.60)*smoothstep(0.92,1.0,phase)*0.12;

  col+=(hash12(uvN*uResolution+fract(uTime)*67.)-0.5)*0.008;
  fragColor=vec4(clamp(col,0.,1.),1.);
}`;

export class EmberForgeMarbleScreen extends Container {
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
