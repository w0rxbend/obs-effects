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

// Amethyst Dream: dark void purple base, violet→amethyst→hot magenta→pale lilac cycling
const FRAG = `#version 300 es
precision highp float;
in vec2 vTextureCoord;
out vec4 fragColor;
uniform float uTime;
uniform vec2 uResolution;

float hash12(vec2 p){vec3 p3=fract(vec3(p.xyx)*0.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
float vnoise(vec2 p){vec2 i=floor(p);vec2 f=fract(p);vec2 u=f*f*(3.0-2.0*f);float a=hash12(i);float b=hash12(i+vec2(1,0));float c=hash12(i+vec2(0,1));float d=hash12(i+vec2(1,1));return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);}
const mat2 R=mat2(0.80,0.60,-0.60,0.80);
float fbm(vec2 p){float v=0.;float a=0.5;for(int i=0;i<7;i++){v+=a*vnoise(p);p=R*p*2.01+vec2(5.7,3.3);a*=0.48;}return v;}

void main(){
  vec2 uvN=vTextureCoord;
  vec2 uv=(uvN-0.5)*vec2(uResolution.x/uResolution.y,1.0);
  float t=uTime*0.15;
  vec2 p=uv*2.9+vec2(t*0.05,t*0.04);

  vec2 q=vec2(fbm(p),fbm(p+vec2(4.9,1.6)));
  vec2 w=vec2(fbm(p+4.2*q+vec2(2.0+t*.09,8.1-t*.07)),fbm(p+4.2*q+vec2(7.4+t*.04,3.0+t*.08)));
  vec2 r=vec2(fbm(p+3.1*w+vec2(-2.9,5.8)),fbm(p+3.1*w+vec2(3.6,-1.8)));
  float f=fbm(p+3.6*r+vec2(t*.05,-t*.03));

  float swirl=fbm(p+4.8*q+vec2(0.,t*.06));
  float band=sin((f*5.2+swirl*2.4)*3.14159);
  vec2 sp=uv*3.8+vec2(-t*.05,t*.07);
  vec2 sq=vec2(fbm(sp),fbm(sp+vec2(2.9,6.8)));
  float blob=fbm(sp+2.7*sq);
  float blobBand=sin(blob*5.5*3.14159+t*0.28);
  float b=mix(band,blobBand,0.25);

  // Palette: void purple, electric violet, amethyst, hot magenta, pale lilac
  vec3 void_   =vec3(0.048,0.028,0.098); // near-black purple
  vec3 violet  =vec3(0.310,0.055,0.698); // #4F0EB2 electric violet
  vec3 amethyst=vec3(0.608,0.318,0.820); // #9B51D1
  vec3 magenta =vec3(0.878,0.125,0.980); // #E020FA hot magenta
  vec3 lilac   =vec3(0.855,0.780,0.965); // #DAC7F6 pale lilac

  float bN=b*0.5+0.5;
  float t1=smoothstep(0.48,0.58,bN);
  float t2=smoothstep(0.58,0.70,bN);
  float t3=smoothstep(0.70,0.82,bN);
  float t4=smoothstep(0.86,0.94,bN);

  vec3 col=void_;
  col=mix(col,violet,  t1);
  col=mix(col,amethyst,t2);
  col=mix(col,magenta, t3);
  col=mix(col,lilac,   t4);

  float e1=abs(bN-0.57); float e2=abs(bN-0.76); float e3=abs(bN-0.85);
  float outline=smoothstep(0.022,0.,e1)+smoothstep(0.018,0.,e2)+smoothstep(0.014,0.,e3);
  col=mix(col,void_*0.2,clamp(outline*2.0,0.,1.));

  // Iridescent shimmer: hue-rotate bloom so lilac tips catch lavender-blue
  float shimmer=smoothstep(0.88,1.0,bN);
  col+=vec3(0.15,0.05,0.30)*shimmer*0.18;

  vec2 vc=uvN-0.5;
  col*=1.0-0.65*dot(vc,vc)*2.0;
  col=max(col,vec3(0.));
  col+=( hash12(uvN*uResolution+fract(uTime)*89.)-0.5)*0.009;
  fragColor=vec4(clamp(col,0.,1.),1.);
}`;

export class AmethystMarbleScreen extends Container {
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
