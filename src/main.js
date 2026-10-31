import './style.css';
import * as THREE from 'three';
console.log("estrella-3d. Rotación con remapeo + mini estrellas empujables + HUD + control de partículas.");

const lienzo = document.getElementById("lienzo");

const pointerCoordsContainer = document.getElementById("pointer-coords");
const pointerNormalizedContainer = document.getElementById("pointer-normalized");
const clockDateContainer = document.getElementById("clock-date");
const clockTimeContainer = document.getElementById("clock-time");
const clockZoneContainer = document.getElementById("clock-zone");

const particleSlider = document.getElementById("particle-count");
const particleValue = document.getElementById("particle-count-value");



//---------Variables---------
let pointerData = {
  x: window.innerWidth / 2,
  y: window.innerHeight / 2
};

let normalizedPointer = {
  x: 0,
  y: 0
};

let normalizedLerpPointer = {   
  x: 0,
  y: 0
};

//Suavizado de las pupilas
let pupilLerpPointer = {
  x: 0,
  y: 0
};

let headRotation = {
  x: 0,
  y: 0
};

//COF
const COF = 0.08; //COF de la cabeza
const PUPIL_COF = 0.18; //COF de las pupilas

//rango de giro de la cabeza
const HEAD_RANGE = {            
  x: 25,
  y: 35
};

//ojos
const EYE_SHAPE = {             
  height: 1.5,                  
  pupilSize: 0.4,               
  pupilTravel: 0.9              
};

const COLORS = {
  head: "#c00202",
  mini: "#ff0000",
  eye: "#f4f1ea",
  pupil: "#111111"
};

//Picos de la cabeza
const SPIKES = { 
  count: 26, 
  length: 1.0,                 
  width: 0.28,                 
  frontGap: 0.55 
};

//Particulas
const MINIS = {
  count: 30, //cantidad
  maxCount: 100, //máxima cantidad 
  spikeCount: 14,
  spikeLength: 1.0,
  spikeWidth: 0.32,
  size: 0.1,
  minRadius: 2.3, //distancia minima al centro
  maxRadius: 3.3, //distancia maxima al centro
  height: 1.8, //que tan arriba o abajo pueden aparecer
  followHead: 0.3, // cuanto siguen al mouse
  appearSpeed: 0.08
};

const PUSH = {                  // empujar las mini estrellas con el mouse
  radius: 0.9,                  // alcance del cursor (unidades 3D alrededor del rayo del mouse)
  strength: 0.02,               // fuerza base del empujón
  speedBoost: 25,               // cuánto más empuja si mueves el mouse rápido
  spring: 0.03,                 // qué tan fuerte regresan a su órbita
  damping: 0.88,                // frenado (más cerca de 1 = rebotan más tiempo)
  minDistance: 2.0,             // nunca se acercan más que esto al centro (no se meten en la cabeza)
  spinKick: 40                  // cuánto giran extra al recibir un golpe
};

const TIME_ZONE = "America/Mexico_City";



//------Ojos------
const EYES = [
  { x: -0.38, y:  0.22, size: 0.17 },   // ojo izquierdo
  { x:  0.38, y:  0.22, size: 0.17 },   // ojo derecho
  { x:  0.00, y:  0.32, size: 0.20 },   // ojo central
];

const pupils = [];
const floatingMinis = [];
let miniIndex = 0;

// Estado del mouse para el empujón
let isPointerInside = false;    // solo empuja si el mouse está dentro de la ventana
let pointerSpeed = 0;           // velocidad del mouse suavizada
const lastPointer = { x: 0, y: 0 };



//---------Escena----------
const scene = new THREE.Scene();

//-------Camara------
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.z = 6;

//------Renderer------
const renderer = new THREE.WebGLRenderer({ canvas: lienzo, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); 
renderer.setSize(window.innerWidth, window.innerHeight);

//------Timer: reemplaza a THREE.Clock------ 
const timer = new THREE.Timer();

//------Raycaster------
const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();

//------Vectores reutilizables------
const tmpOrbit = new THREE.Vector3();
const tmpWorld = new THREE.Vector3();
const tmpClosest = new THREE.Vector3();
const tmpPush = new THREE.Vector3();
const tmpInverseQuat = new THREE.Quaternion();

//------Luces------
const ambientLight = new THREE.AmbientLight("#ffffff", 0.6);
scene.add(ambientLight);

const keyLight = new THREE.DirectionalLight("#ffffff", 3);
keyLight.position.set(3, 4, 5);
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight("#4fd8ff", 2);
rimLight.position.set(-4, 2, -4);
scene.add(rimLight);

//------Canvas responsivo------
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});



//----------Coordenadas del puntero---------
function updatePointerReadout() {
  if (!pointerCoordsContainer || !pointerNormalizedContainer) return;

  if (!isPointerInside) {
    pointerCoordsContainer.innerText = "X — · Y —";
    pointerNormalizedContainer.innerText = "NX — · NY —";
    return;
  }

  pointerCoordsContainer.innerText = `X ${pointerData.x} · Y ${pointerData.y}`;
  pointerNormalizedContainer.innerText =
    `NX ${normalizedPointer.x.toFixed(2)} · NY ${normalizedPointer.y.toFixed(2)}`;
};



//----------HUD: fecha, hora y zona horaria de la Ciudad de México---------
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  weekday: "short",
  year: "numeric",
  month: "short",
  day: "2-digit"
});

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false
});

// "shortOffset" da algo como "GMT-6"; si el navegador no lo soporta se usa "short"
let zoneFormatter;
try {
  zoneFormatter = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, timeZoneName: "shortOffset" });
} catch {
  zoneFormatter = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, timeZoneName: "short" });
}

function getZoneLabel(date) {
  const part = zoneFormatter.formatToParts(date).find((p) => p.type === "timeZoneName");
  return part ? part.value : "";
}

function updateClock() {
  if (!clockDateContainer || !clockTimeContainer || !clockZoneContainer) return;

  const now = new Date();

  clockDateContainer.innerText = dateFormatter.format(now);
  clockTimeContainer.innerText = timeFormatter.format(now);
  clockZoneContainer.innerText = `${TIME_ZONE.replace("_", " ")} · ${getZoneLabel(now)}`;
}

updateClock();
setInterval(updateClock, 1000);   // se actualiza cada segundo



//---------Forma---------
function createSpikyBall({ spikeCount, spikeLength, spikeWidth, frontGap, material }) {
  const ball = new THREE.Group();

  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), material);
  ball.add(core);

  const goldenAngle = Math.PI * (3 - Math.sqrt(5));  // reparte puntos de forma pareja en la esfera
  const up = new THREE.Vector3(0, 1, 0);
  const spikeGeometry = new THREE.ConeGeometry(spikeWidth, spikeLength, 4);

  for (let i = 0; i < spikeCount; i++) {
    const y = 1 - (i / (spikeCount - 1)) * 2;
    const radius = Math.sqrt(1 - y * y);
    const theta = goldenAngle * i;

    const direction = new THREE.Vector3(Math.cos(theta) * radius, y, Math.sin(theta) * radius);

    if (direction.z > frontGap) continue;//deja libre la cara frontal

    const spike = new THREE.Mesh(spikeGeometry, material);
    spike.quaternion.setFromUnitVectors(up, direction); //apunta hacia afuera
    spike.position.copy(direction).multiplyScalar(0.85 + spikeLength / 2);
    ball.add(spike);
  }

  return ball;
}



//---------Cabeza---------
const head = new THREE.Group(); // todo lo que está dentro rota junto
scene.add(head);

const headMaterial = new THREE.MeshStandardMaterial({ //lowpolly
  color: COLORS.head,
  flatShading: true,           
  roughness: 0.45,
  metalness: 0.1
});

function createHead() {
  const body = createSpikyBall({
    spikeCount: SPIKES.count,
    spikeLength: SPIKES.length,
    spikeWidth: SPIKES.width,
    frontGap: SPIKES.frontGap, // sin picos donde van los ojos
    material: headMaterial
  });
  head.add(body);
}



//---------Ojos---------
function createDiamond(halfWidth, halfHeight) {
  const shape = new THREE.Shape();
  shape.moveTo(0, halfHeight); // punta de arriba
  shape.lineTo(halfWidth, 0); // punta derecha
  shape.lineTo(0, -halfHeight); // punta de abajo
  shape.lineTo(-halfWidth, 0); // punta izquierda
  shape.closePath();

  return new THREE.ShapeGeometry(shape);
}

function createEyes() {
  const eyeMaterial = new THREE.MeshStandardMaterial({
    color: COLORS.eye,
    roughness: 0.4
  });

  const pupilMaterial = new THREE.MeshStandardMaterial({
    color: COLORS.pupil,
    roughness: 0.4,
    polygonOffset: true,  // siempre se dibuja encima del blanco
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });

  EYES.forEach((config) => {
    const direction = new THREE.Vector3(config.x, config.y, 1).normalize();

    const eye = new THREE.Group();
    eye.position.copy(direction).multiplyScalar(1.01);
    eye.lookAt(direction.clone().multiplyScalar(2));

    const eyeHalfWidth = config.size;
    const eyeHalfHeight = config.size * EYE_SHAPE.height;
    const pupilHalfWidth = eyeHalfWidth * EYE_SHAPE.pupilSize;
    const pupilHalfHeight = eyeHalfHeight * EYE_SHAPE.pupilSize;

    //---Blanco del ojo---
    const white = new THREE.Mesh(createDiamond(eyeHalfWidth, eyeHalfHeight), eyeMaterial);
    eye.add(white);

    //---Pupila---
    const pupil = new THREE.Mesh(createDiamond(pupilHalfWidth, pupilHalfHeight), pupilMaterial);
    pupil.position.z = 0.002;
    eye.add(pupil);

    pupils.push({
      mesh: pupil,
      maxX: eyeHalfWidth - pupilHalfWidth,
      maxY: eyeHalfHeight - pupilHalfHeight
    });

    head.add(eye);
  });
}



//---------Minis---------
const minisGroup = new THREE.Group();
scene.add(minisGroup);

//---Material---
const miniMaterial = new THREE.MeshStandardMaterial({
  color: COLORS.mini,
  flatShading: true,
  roughness: 0.45,
  metalness: 0.1
});

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}


function addMini() {
  const mini = createSpikyBall({
    spikeCount: MINIS.spikeCount,
    spikeLength: MINIS.spikeLength,
    spikeWidth: MINIS.spikeWidth,
    frontGap: 2,
    material: miniMaterial
  });

 
  const config = {
    mesh: mini,
    orbitRadius: randomBetween(MINIS.minRadius, MINIS.maxRadius),
    orbitAngle: miniIndex * GOLDEN_ANGLE, //repartidas alrededor, sin importar cuántas haya
    orbitSpeed: randomBetween(0.08, 0.25) * (Math.random() < 0.5 ? -1 : 1), //algunas giran al revés
    baseY: randomBetween(-MINIS.height, MINIS.height),
    bobSpeed: randomBetween(0.8, 1.6), // velocidad del sube y baja
    bobPhase: Math.random() * Math.PI * 2, // para que no floten sincronizadas
    spin: new THREE.Vector3(randomBetween(-0.8, 0.8), randomBetween(-0.8, 0.8), randomBetween(-0.4, 0.4)),
    scale: MINIS.size * randomBetween(0.6, 1.3), //tamaños
    appear: 0, //crece al aparecer

    //Física del empujón
    offset: new THREE.Vector3(),    // qué tan lejos está de su punto en la órbita
    velocity: new THREE.Vector3(),  // velocidad actual del desvío
    spinBoost: 0                    // giro extra después de un golpe
  };

  miniIndex++;

  mini.scale.setScalar(0); //empieza invisible y crece en animate()
  mini.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0); // cada una arranca en otra posición
  minisGroup.add(mini);
  floatingMinis.push(config);
}

// Quita la última mini estrella y libera su memoria
function removeMini() {
  const mini = floatingMinis.pop();
  if (!mini) return;

  minisGroup.remove(mini.mesh);

  // Cada mini estrella tiene sus propias geometrías: hay que liberarlas
  // (el material es compartido, ese no se toca)
  mini.mesh.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
  });
}

// Ajusta la cantidad: agrega o quita hasta llegar al número pedido
function setMiniCount(count) {
  const target = THREE.MathUtils.clamp(Math.round(count), 0, MINIS.maxCount);

  while (floatingMinis.length < target) addMini();
  while (floatingMinis.length > target) removeMini();
}

function updatePointerSpeed() {
  const speed = Math.hypot(normalizedPointer.x - lastPointer.x, normalizedPointer.y - lastPointer.y);
  lastPointer.x = normalizedPointer.x;
  lastPointer.y = normalizedPointer.y;

  pointerSpeed += (speed - pointerSpeed) * 0.3;   // suavizada para que no dé saltos
}

function updateFloatingMinis(time) {
  updatePointerSpeed();

  // Rayo del mouse dentro de la escena
  pointerNDC.set(normalizedPointer.x, normalizedPointer.y);
  raycaster.setFromCamera(pointerNDC, camera);

  // Para pasar direcciones del mundo al espacio del grupo (que gira un poco con el mouse)
  minisGroup.updateMatrixWorld();
  tmpInverseQuat.copy(minisGroup.quaternion).invert();

  floatingMinis.forEach((mini) => {
    // 0. Aparecer: crece suavemente hasta su tamaño
    if (mini.appear < 1) {
      mini.appear = Math.min(1, mini.appear + MINIS.appearSpeed);
      const eased = 1 - Math.pow(1 - mini.appear, 3);          // arranca rápido y frena al final
      mini.mesh.scale.setScalar(mini.scale * eased);
    }

    // 1. Punto de la órbita donde "debería" estar
    const angle = mini.orbitAngle + time * mini.orbitSpeed;
    tmpOrbit.set(
      Math.cos(angle) * mini.orbitRadius,
      mini.baseY + Math.sin(time * mini.bobSpeed + mini.bobPhase) * 0.15,
      Math.sin(angle) * mini.orbitRadius
    );

    // 2. Empujón del mouse
    if (isPointerInside) {
      tmpWorld.copy(tmpOrbit).add(mini.offset);
      minisGroup.localToWorld(tmpWorld);                        // posición real en el mundo

      raycaster.ray.closestPointToPoint(tmpWorld, tmpClosest);  // punto del rayo más cercano
      tmpPush.subVectors(tmpWorld, tmpClosest);                 // dirección: alejarse del rayo
      const distance = tmpPush.length();

      if (distance < PUSH.radius && distance > 0.0001) {
        const falloff = 1 - distance / PUSH.radius;             // 1 = pegado al cursor, 0 = en el borde
        const force = falloff * falloff * PUSH.strength * (1 + pointerSpeed * PUSH.speedBoost);

        tmpPush.normalize().applyQuaternion(tmpInverseQuat).multiplyScalar(force);
        mini.velocity.add(tmpPush);
        mini.spinBoost += force * PUSH.spinKick;
      }
    }

    // 3. Resorte: regresa a su órbita
    mini.velocity.addScaledVector(mini.offset, -PUSH.spring);
    mini.velocity.multiplyScalar(PUSH.damping);
    mini.offset.add(mini.velocity);

    // 4. No dejar que se metan en la cabeza
    tmpWorld.copy(tmpOrbit).add(mini.offset);
    const distanceToCenter = tmpWorld.length();
    if (distanceToCenter < PUSH.minDistance && distanceToCenter > 0) {
      tmpWorld.multiplyScalar(PUSH.minDistance / distanceToCenter);
      mini.offset.subVectors(tmpWorld, tmpOrbit);
    }

    // 5. Posición final = órbita + desvío
    mini.mesh.position.copy(tmpOrbit).add(mini.offset);

    // 6. Giro: normal + extra si la acaban de golpear
    const spinFactor = 0.01 * (1 + mini.spinBoost);
    mini.mesh.rotation.x += mini.spin.x * spinFactor;
    mini.mesh.rotation.y += mini.spin.y * spinFactor;
    mini.mesh.rotation.z += mini.spin.z * spinFactor;
    mini.spinBoost *= 0.95;           // el giro extra se va calmando
  });
}



//---------Control de cantidad de partículas---------
function updateParticleControl(count) {
  if (!particleSlider || !particleValue) return;

  particleValue.textContent = String(count).padStart(3, "0");          // 030, 100, 007…
  particleSlider.style.setProperty("--fill", `${(count / MINIS.maxCount) * 100}%`); // parte roja del slider
}

// Si el panel no existe en el HTML, la página sigue funcionando sin él
if (particleSlider && particleValue) {
  particleSlider.max = MINIS.maxCount;
  particleSlider.value = MINIS.count;
  updateParticleControl(MINIS.count);

  particleSlider.addEventListener("input", () => {
    const count = Number(particleSlider.value);
    setMiniCount(count);
    updateParticleControl(count);
  });
} else {
  console.warn("No se encontró el slider #particle-count en index.html — se usan " + MINIS.count + " partículas.");
}



//---------Cursor/pointer (normalizado)---------
function calculateNormalizedPointer() {
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;

  normalizedPointer.x = (pointerData.x / windowWidth) * 2 - 1; 
  normalizedPointer.y = -(pointerData.y / windowHeight) * 2 + 1;
}


function calculateNormalizedLerpPointer() {
  normalizedLerpPointer.x += (normalizedPointer.x - normalizedLerpPointer.x) * COF;
  normalizedLerpPointer.y += (normalizedPointer.y - normalizedLerpPointer.y) * COF;

  pupilLerpPointer.x += (normalizedPointer.x - pupilLerpPointer.x) * PUPIL_COF;
  pupilLerpPointer.y += (normalizedPointer.y - pupilLerpPointer.y) * PUPIL_COF;
}


//---1. remapear los valores normalizados y convertirlos en grados.
function map(valor, inMin, inMax, outMin, outMax) {
  const t = (valor - inMin) / (inMax - inMin);
  return outMin + t * (outMax - outMin);
}

function translateNormalsToDegrees(){
  headRotation.x = map(normalizedLerpPointer.y, -1, 1, HEAD_RANGE.x, -HEAD_RANGE.x);
  headRotation.y = map(normalizedLerpPointer.x, -1, 1, -HEAD_RANGE.y, HEAD_RANGE.y);
}

//---2. mover las pupilas dentro de cada ojo sin salirse del diamante.
function updatePupils(){
  pupils.forEach(({ mesh, maxX, maxY }) => {
    let x = map(pupilLerpPointer.x, -1, 1, -maxX, maxX) * EYE_SHAPE.pupilTravel;
    let y = map(pupilLerpPointer.y, -1, 1, -maxY, maxY) * EYE_SHAPE.pupilTravel;

    // Límite en forma de diamante: en las esquinas la pupila no se sale del ojo
    const limit = Math.abs(x) / maxX + Math.abs(y) / maxY;
    if (limit > 1) {
      x /= limit;
      y /= limit;
    }

    mesh.position.x = x;
    mesh.position.y = y;
  });
}
//---3. aplicar los grados a la cabeza y a las mini estrellas (dentro de animate).


document.addEventListener("pointermove", (event) => {
  pointerData.x = Math.floor(event.clientX);
  pointerData.y = Math.floor(event.clientY);

  calculateNormalizedPointer();

  // Al volver a entrar, sincroniza la velocidad para que no haya un "golpe" falso
  if (!isPointerInside) {
    lastPointer.x = normalizedPointer.x;
    lastPointer.y = normalizedPointer.y;
    isPointerInside = true;
  }

  updatePointerReadout();
});

// Si el cursor sale de la ventana: la cabeza regresa al centro y ya no empuja
document.documentElement.addEventListener("mouseleave", () => {
  normalizedPointer.x = 0;
  normalizedPointer.y = 0;
  isPointerInside = false;

  updatePointerReadout();
});



//---------Animación---------
function animate(timestamp) {
  timer.update(timestamp);              // el Timer necesita actualizarse en cada cuadro
  const time = timer.getElapsed();      // segundos desde que empezó

  calculateNormalizedLerpPointer();
  translateNormalsToDegrees();
  updatePupils();

  head.rotation.x = THREE.MathUtils.degToRad(headRotation.x);
  head.rotation.y = THREE.MathUtils.degToRad(headRotation.y);

  head.position.y = Math.sin(time * 1.5) * 0.06; //flota 

  minisGroup.rotation.x = THREE.MathUtils.degToRad(headRotation.x * MINIS.followHead);
  minisGroup.rotation.y = THREE.MathUtils.degToRad(headRotation.y * MINIS.followHead);

  updateFloatingMinis(time);

  renderer.render(scene, camera);

  requestAnimationFrame(animate);
}

createHead();
createEyes();
setMiniCount(MINIS.count);
requestAnimationFrame(animate);