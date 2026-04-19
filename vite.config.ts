import { resolve } from "path";

import { defineConfig } from "vite";

import { assetpackPlugin } from "./scripts/assetpack-vite-plugin";

// https://vite.dev/config/
export default defineConfig({
  plugins: [assetpackPlugin()],
  server: {
    port: 8080,
    open: "/main-web-cam-border.html",
  },
  build: {
    rollupOptions: {
      input: {
        mainWebCamBorder: resolve(__dirname, "main-web-cam-border.html"),
        planetCircleWebcamBorder: resolve(
          __dirname,
          "planet-circle-webcam-border.html",
        ),
        titlePowerline: resolve(__dirname, "title-powerline.html"),
        logo: resolve(__dirname, "logo.html"),
        background: resolve(__dirname, "background.html"),
        startingSoon: resolve(__dirname, "starting-soon.html"),
        musicBreak: resolve(__dirname, "music-break.html"),
        break: resolve(__dirname, "break.html"),
        planet: resolve(__dirname, "planet.html"),
        aquarium: resolve(__dirname, "aquarium.html"),
        atom: resolve(__dirname, "atom.html"),
        simpleWebCamBorder: resolve(__dirname, "simple-web-cam-border.html"),
        matrixDots: resolve(__dirname, "matrix-dots.html"),
        waveCam: resolve(__dirname, "wavecam.html"),
        trapCam: resolve(__dirname, "trapcam.html"),
        generative: resolve(__dirname, "generative.html"),
        hexCam: resolve(__dirname, "hexcam.html"),
        hexGridCam: resolve(__dirname, "hexgridcam.html"),
        hexLayerCam: resolve(__dirname, "hexlayercam.html"),
        triangulation: resolve(__dirname, "triangulation.html"),
        rain: resolve(__dirname, "rain.html"),
        flightSimulation: resolve(__dirname, "flight-simulation.html"),
        grass: resolve(__dirname, "grass.html"),
        graphBg: resolve(__dirname, "graph-bg.html"),
        starField: resolve(__dirname, "star-field.html"),
        maurerRose: resolve(__dirname, "maurer-rose.html"),
        collatz: resolve(__dirname, "collatz.html"),
        perlinBlobs: resolve(__dirname, "perlin-blobs.html"),
        planetHologram: resolve(__dirname, "planet-hologram.html"),
        particleSplash: resolve(__dirname, "particle-splash.html"),
        plexusConstellation: resolve(__dirname, "plexus-constellation.html"),
        flowField: resolve(__dirname, "flow-field.html"),
        gravitySphere: resolve(__dirname, "gravity-sphere.html"),
        magneticField: resolve(__dirname, "magnetic-field.html"),
      },
    },
  },
  define: {
    APP_VERSION: JSON.stringify(process.env.npm_package_version),
  },
});
