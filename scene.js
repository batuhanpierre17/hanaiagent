(function () {
"use strict";

const canvas = document.getElementById("scene");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function hasWebGL() {
  try {
    const probe = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (probe.getContext("webgl2") || probe.getContext("webgl")));
  } catch (error) {
    return false;
  }
}

function giveUp() {
  document.body.classList.remove("gl");
  window.HANAI_GL = false;
  if (canvas.parentNode) canvas.remove();
}

window.HANAI_GL = !reduceMotion
  && hasWebGL()
  && typeof gsap !== "undefined"
  && typeof THREE !== "undefined";

if (!window.HANAI_GL) {
  canvas.remove();
} else {
  document.body.classList.add("gl");
  boot().catch(giveUp);
}

function sRGB(item) {
  if (THREE.SRGBColorSpace && "colorSpace" in item) {
    item.colorSpace = THREE.SRGBColorSpace;
  } else if (THREE.sRGBEncoding !== undefined) {
    item.encoding = THREE.sRGBEncoding;
  }
}

const PART_VERT = `
attribute vec3 aStart;
attribute vec3 aDrift;
attribute vec3 aColor;
attribute float aSeed;
uniform float uAssemble;
uniform float uDisperse;
uniform float uTime;
uniform float uSize;
varying vec3 vColor;
varying float vAlpha;

void main() {
  vColor = aColor;
  float t = uAssemble;
  vec3 pos = mix(aStart, position, t);
  float turn = aSeed * 6.2831;
  pos.x += sin(uTime * 0.7 + turn) * 0.03 * t;
  pos.y += cos(uTime * 0.6 + turn) * 0.03 * t;
  pos += aDrift * uDisperse;
  pos.y += sin(uTime * 0.3 + turn * 2.0) * 0.22 * uDisperse;
  pos.x += cos(uTime * 0.22 + turn * 1.7) * 0.18 * uDisperse;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_PointSize = uSize * (0.6 + aSeed) * (9.0 / max(0.4, -mv.z));
  gl_Position = projectionMatrix * mv;
  vAlpha = smoothstep(0.0, 0.22, t) * (1.0 - uDisperse * 0.52);
}
`;

const PART_FRAG = `
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = dot(d, d);
  if (r > 0.25) discard;
  float a = smoothstep(0.25, 0.0, r);
  gl_FragColor = vec4(vColor, a * vAlpha);
}
`;

const SHEEN_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SHEEN_FRAG = `
uniform sampler2D uMap;
uniform float uPos;
varying vec2 vUv;

void main() {
  vec4 src = texture2D(uMap, vUv);
  float lit = step(0.3, max(src.r, max(src.g, src.b)));
  float lane = vUv.x + vUv.y * 0.42;
  float band = smoothstep(0.16, 0.0, abs(lane - uPos));
  gl_FragColor = vec4(vec3(1.0), src.a * lit * band * 0.55);
}
`;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function readPixels(image, width) {
  const height = Math.round((image.height / image.width) * width);
  const sheet = document.createElement("canvas");
  sheet.width = width;
  sheet.height = height;
  const pen = sheet.getContext("2d", { willReadFrequently: true });
  pen.drawImage(image, 0, 0, width, height);
  return { data: pen.getImageData(0, 0, width, height).data, width, height };
}

async function boot() {
  const narrow = window.innerWidth < 760;
  const [hImage, faceImage, wordImage] = await Promise.all([
    loadImage("brand/h.png"),
    loadImage("brand/face.png"),
    loadImage("brand/word.png"),
  ]);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !narrow });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x0c1220, 1);
  if (THREE.SRGBColorSpace && "outputColorSpace" in renderer) {
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  } else if (THREE.sRGBEncoding !== undefined) {
    renderer.outputEncoding = THREE.sRGBEncoding;
  }

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0c1220, 0.055);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 120);
  camera.position.set(0, 0, 8.6);

  const rig = new THREE.Group();
  scene.add(rig);

  const plateRatio = hImage.width / hImage.height;
  const plateWidth = narrow ? 3.5 : 3.9;
  const plateHeight = plateWidth / plateRatio;

  const loader = new THREE.TextureLoader();
  const textures = {
    h: loader.load("brand/h.png"),
    face: loader.load("brand/face.png"),
    word: loader.load("brand/word.png"),
  };
  Object.keys(textures).forEach((name) => {
    const texture = textures[name];
    sRGB(texture);
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  });

  const plate = new THREE.PlaneGeometry(plateWidth, plateHeight);

  function layer(texture, z) {
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(plate, material);
    mesh.position.z = z;
    rig.add(mesh);
    return mesh;
  }

  const hMesh = layer(textures.h, 0);
  const faceMesh = layer(textures.face, 0.5);
  const wordMesh = layer(textures.word, 0.18);

  const sheen = new THREE.Mesh(plate, new THREE.ShaderMaterial({
    vertexShader: SHEEN_VERT,
    fragmentShader: SHEEN_FRAG,
    uniforms: { uMap: { value: textures.h }, uPos: { value: -0.4 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  sheen.position.z = 0.02;
  rig.add(sheen);

  // H'nin alfasından parçacık bulutu
  const sample = readPixels(hImage, narrow ? 150 : 210);
  const spots = [];
  for (let y = 0; y < sample.height; y += 1) {
    for (let x = 0; x < sample.width; x += 1) {
      const at = (y * sample.width + x) * 4;
      const r = sample.data[at];
      const g = sample.data[at + 1];
      const b = sample.data[at + 2];
      // Yalnız mavi H: koyu gövde ve gölge parçacığa dönmez
      if (sample.data[at + 3] > 60 && Math.max(r, g, b) > 76) {
        spots.push([x, y, r / 255, g / 255, b / 255]);
      }
    }
  }
  for (let i = spots.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [spots[i], spots[j]] = [spots[j], spots[i]];
  }
  const count = Math.min(spots.length, narrow ? 4200 : 9000);

  const target = new Float32Array(count * 3);
  const start = new Float32Array(count * 3);
  const drift = new Float32Array(count * 3);
  const tint = new Float32Array(count * 3);
  const seed = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    const [px, py, r, g, b] = spots[i];
    const x = (px / sample.width - 0.5) * plateWidth;
    const y = (0.5 - py / sample.height) * plateHeight;
    target[i * 3] = x;
    target[i * 3 + 1] = y;
    target[i * 3 + 2] = (Math.random() - 0.5) * 0.12;

    const angle = Math.random() * Math.PI * 2;
    const tip = Math.acos(2 * Math.random() - 1);
    const far = 9 + Math.random() * 14;
    start[i * 3] = Math.sin(tip) * Math.cos(angle) * far;
    start[i * 3 + 1] = Math.sin(tip) * Math.sin(angle) * far * 0.7;
    start[i * 3 + 2] = Math.cos(tip) * far - 6;

    const push = 1.6 + Math.random() * 4.2;
    drift[i * 3] = x * 0.42 + (Math.random() - 0.5) * push;
    drift[i * 3 + 1] = y * 0.42 + (Math.random() - 0.5) * push;
    drift[i * 3 + 2] = (Math.random() - 0.5) * push - 0.6;

    tint[i * 3] = Math.min(1, r * 0.75 + 0.18);
    tint[i * 3 + 1] = Math.min(1, g * 0.85 + 0.22);
    tint[i * 3 + 2] = Math.min(1, b * 0.9 + 0.3);

    seed[i] = Math.random();
  }

  const dust = new THREE.BufferGeometry();
  dust.setAttribute("position", new THREE.BufferAttribute(target, 3));
  dust.setAttribute("aStart", new THREE.BufferAttribute(start, 3));
  dust.setAttribute("aDrift", new THREE.BufferAttribute(drift, 3));
  dust.setAttribute("aColor", new THREE.BufferAttribute(tint, 3));
  dust.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));

  const dustMaterial = new THREE.ShaderMaterial({
    vertexShader: PART_VERT,
    fragmentShader: PART_FRAG,
    uniforms: {
      uAssemble: { value: 0 },
      uDisperse: { value: 0 },
      uTime: { value: 0 },
      uSize: { value: narrow ? 2.2 : 2.8 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const dustCloud = new THREE.Points(dust, dustMaterial);
  rig.add(dustCloud);

  // Arka alan: uzak toz
  const farCount = narrow ? 420 : 900;
  const farPoints = new Float32Array(farCount * 3);
  for (let i = 0; i < farCount; i += 1) {
    farPoints[i * 3] = (Math.random() - 0.5) * 34;
    farPoints[i * 3 + 1] = (Math.random() - 0.5) * 22;
    farPoints[i * 3 + 2] = -4 - Math.random() * 20;
  }
  const farGeometry = new THREE.BufferGeometry();
  farGeometry.setAttribute("position", new THREE.BufferAttribute(farPoints, 3));
  const farField = new THREE.Points(farGeometry, new THREE.PointsMaterial({
    color: 0x5aa8ff,
    size: 0.045,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  scene.add(farField);

  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(11, 11),
    new THREE.MeshBasicMaterial({
      map: haloTexture(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  halo.position.z = -1.4;
  rig.add(halo);

  const restZ = 6.3;

  function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    const roomH = 2 * Math.tan((camera.fov * Math.PI) / 360) * restZ;
    const roomW = roomH * camera.aspect;
    const tight = width < 760;
    const fit = Math.min(
      (roomW * (tight ? 0.78 : 0.40)) / plateWidth,
      (roomH * (tight ? 0.44 : 0.52)) / plateHeight,
    );
    rig.scale.setScalar(fit);
    rig.position.y = roomH * (tight ? 0.15 : 0.13);
  }
  resize();
  window.addEventListener("resize", resize);

  const aim = { x: 0, y: 0 };
  const turn = { x: 0, y: 0 };
  if (window.matchMedia("(pointer: fine)").matches) {
    window.addEventListener("pointermove", (event) => {
      aim.x = event.clientX / window.innerWidth - 0.5;
      aim.y = event.clientY / window.innerHeight - 0.5;
    });
  }

  const intro = gsap.timeline();
  intro.to(farField.material, { opacity: 0.75, duration: 1.6, ease: "power2.out" }, 0);
  intro.to(camera.position, { z: 6.3, duration: 3.1, ease: "power2.inOut" }, 0);
  intro.to(dustMaterial.uniforms.uAssemble, { value: 1, duration: 1.95, ease: "power2.inOut" }, 0.25);
  intro.to(halo.material, { opacity: 0.72, duration: 1.2, ease: "power2.out" }, 1.5);
  intro.to(hMesh.material, { opacity: 1, duration: 0.75, ease: "power2.out" }, 2.1);
  intro.to(dustMaterial.uniforms.uDisperse, { value: 1, duration: 3.4, ease: "power1.inOut" }, 2.35);
  intro.fromTo(faceMesh.position, { y: 0.85 }, { y: 0, duration: 1.05, ease: "back.out(1.6)" }, 2.5);
  intro.to(faceMesh.material, { opacity: 1, duration: 0.7, ease: "power2.out" }, 2.5);
  intro.fromTo(wordMesh.position, { y: -0.9 }, { y: 0, duration: 0.9, ease: "power3.out" }, 3.0);
  intro.to(wordMesh.material, { opacity: 1, duration: 0.7, ease: "power2.out" }, 3.0);

  gsap.fromTo(sheen.material.uniforms.uPos, { value: -0.4 }, {
    value: 1.6,
    duration: 1.5,
    ease: "power2.inOut",
    delay: 3.1,
    repeat: -1,
    repeatDelay: 5.5,
  });
  gsap.to(halo.scale, {
    x: 1.14,
    y: 1.14,
    duration: 4.2,
    yoyo: true,
    repeat: -1,
    ease: "sine.inOut",
    delay: 2.6,
  });

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const time = clock.getElapsedTime();
    dustMaterial.uniforms.uTime.value = time;

    turn.y += (aim.x * 0.42 - turn.y) * 0.045;
    turn.x += (aim.y * 0.3 - turn.x) * 0.045;
    rig.rotation.y = turn.y + Math.sin(time * 0.24) * 0.055;
    rig.rotation.x = turn.x + Math.sin(time * 0.19) * 0.03;

    faceMesh.position.x = Math.sin(time * 0.5) * 0.035;
    faceMesh.rotation.z = Math.sin(time * 0.33) * 0.012;
    wordMesh.position.x = Math.sin(time * 0.4 + 1.1) * -0.03;
    hMesh.rotation.z = Math.sin(time * 0.27) * 0.008;
    rig.position.x = Math.sin(time * 0.21) * 0.06;

    // Savrulma başlayınca bulut kendi ekseninde salınır, H kurulurken düz durur
    const loose = dustMaterial.uniforms.uDisperse.value;
    dustCloud.rotation.z = Math.sin(time * 0.09) * 0.22 * loose;
    dustCloud.rotation.y = Math.sin(time * 0.06) * 0.18 * loose;

    farField.rotation.y = time * 0.012;
    farField.rotation.x = Math.sin(time * 0.07) * 0.05;

    renderer.render(scene, camera);
  });
}

function haloTexture() {
  const sheet = document.createElement("canvas");
  sheet.width = 256;
  sheet.height = 256;
  const pen = sheet.getContext("2d");
  const paint = pen.createRadialGradient(128, 128, 0, 128, 128, 128);
  paint.addColorStop(0, "rgba(62, 150, 255, 0.55)");
  paint.addColorStop(0.42, "rgba(40, 96, 200, 0.18)");
  paint.addColorStop(1, "rgba(12, 18, 32, 0)");
  pen.fillStyle = paint;
  pen.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(sheet);
  sRGB(texture);
  return texture;
}
})();
