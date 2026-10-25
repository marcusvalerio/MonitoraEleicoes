"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import brazil from "@svg-maps/brazil";

/** Uma coluna da cena: UF (sigla) ou "ZZ" (exterior). `height` ∈ [0, 1]; null ⇒ sem dado oficial (fica rente ao chão). */
export interface Column3D {
  key: string;
  color: string;
  height: number | null;
  /** Pulso suave enquanto a apuração do território está em andamento. */
  live?: boolean;
}

interface Props {
  columns: Column3D[];
  selected: string | null;
  reducedMotion: boolean;
  onHover: (key: string | null, pos: { x: number; y: number } | null) => void;
  onSelect: (key: string) => void;
  onFail: () => void;
}

const BASE = 2.2;
const MAX = 46;
const EMPTY = "#ddd8ce";
// Exterior: pilar hexagonal no Atlântico, a leste do Nordeste (coordenadas do viewBox do SVG, 613 × 639).
const EXTERIOR_AT = { x: 590, y: 255 };

interface Item {
  key: string;
  mesh: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
  center: THREE.Vector3;
  h: number;
  target: number;
  delay: number;
  lift: number;
  color: THREE.Color;
  live: boolean;
}

/**
 * Brasil em 3D: cada UF é um bloco extrudado do contorno oficial (SVG IBGE/@svg-maps), com altura = métrica escolhida
 * e cor = identidade do candidato que lidera (nunca ranking). Renderização sob demanda: pausa fora da tela e com a aba
 * oculta; DPR limitado no celular. Sem WebGL ⇒ onFail (a página volta ao mapa 2D).
 */
export default function Brazil3D({ columns, selected, reducedMotion, onHover, onSelect, onFail }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{ update: (c: Column3D[]) => void; focus: (k: string | null) => void } | null>(null);
  const cb = useRef({ onHover, onSelect });
  useEffect(() => {
    cb.current = { onHover, onSelect };
  });

  useEffect(() => {
    const el = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      onFail();
      return;
    }
    const mobile = window.matchMedia("(max-width: 640px)").matches;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.5 : 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = "pan-y";

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xf7f5f0, 2400, 4200);
    const camera = new THREE.PerspectiveCamera(32, 1, 1, 4000);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8478, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(-260, 520, 420);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x6b9cf2, 1.2);
    rim.position.set(380, -120, 260);
    scene.add(rim);

    // Mapa: o SVG tem y para baixo; viramos o grupo e centralizamos no viewBox.
    const world = new THREE.Group();
    world.rotation.x = -Math.PI / 2;
    scene.add(world);
    const map = new THREE.Group();
    map.scale.set(1, -1, 1);
    map.position.set(-306, 320, 0);
    world.add(map);

    const svg = `<svg xmlns="http://www.w3.org/2000/svg">${brazil.locations.map((l) => `<path id="${l.id}" d="${l.path}"/>`).join("")}</svg>`;
    const parsed = new SVGLoader().parse(svg);
    const items = new Map<string, Item>();
    const bevel = { bevelEnabled: true, bevelThickness: 0.6, bevelSize: 0.5, bevelSegments: 2, curveSegments: 6 };

    const addItem = (k: string, geo: THREE.BufferGeometry, i: number) => {
      geo.computeBoundingBox();
      const center = new THREE.Vector3();
      geo.boundingBox!.getCenter(center);
      const mat = new THREE.MeshStandardMaterial({ color: EMPTY, roughness: 0.42, metalness: 0.12, side: THREE.DoubleSide, emissive: new THREE.Color(0x000000) });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData.key = k;
      mesh.scale.z = 0.001;
      // Contorno fino das divisas: herda a escala do bloco (sobe junto).
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 35), new THREE.LineBasicMaterial({ color: 0xf7f5f0, transparent: true, opacity: 0.55 }));
      mesh.add(edges);
      map.add(mesh);
      items.set(k, { key: k, mesh, mat, center, h: 0.001, target: BASE, delay: reducedMotion ? 0 : i * 45, lift: 0, color: new THREE.Color(EMPTY), live: false });
    };

    parsed.paths.forEach((p, i) => {
      const k = String((p.userData?.node as Element | undefined)?.id ?? "").toUpperCase();
      const shapes = SVGLoader.createShapes(p);
      addItem(k, new THREE.ExtrudeGeometry(shapes, { depth: 1, ...bevel }), i);
    });
    // Exterior (TSE "ZZ"): hexágono flutuante no oceano.
    const hex = new THREE.CylinderGeometry(22, 22, 1, 6);
    hex.rotateX(Math.PI / 2);
    hex.translate(EXTERIOR_AT.x, EXTERIOR_AT.y, 0.5);
    addItem("ZZ", hex, parsed.paths.length);

    // Chão de pontos: textura "dados" discreta, ancora a cena.
    const dots: number[] = [];
    for (let x = -60; x <= 680; x += 14) for (let y = -40; y <= 680; y += 14) dots.push(x, y, -0.5);
    const dotGeo = new THREE.BufferGeometry();
    dotGeo.setAttribute("position", new THREE.Float32BufferAttribute(dots, 3));
    map.add(new THREE.Points(dotGeo, new THREE.PointsMaterial({ color: 0xd6d1c6, size: 1.6, sizeAttenuation: true })));

    // Câmera orbital: azimute por arraste (com inércia), inclinação fixa, alvo e distância animados ao focar uma UF.
    const cam = { az: -0.32, azV: 0, tilt: 0.92, base: 900, dist: 900, distT: 900, target: new THREE.Vector3(), targetT: new THREE.Vector3() };
    const place = () => {
      const r = cam.dist;
      camera.position.set(cam.target.x + r * Math.sin(cam.az) * Math.sin(cam.tilt), cam.target.y + r * Math.cos(cam.tilt), cam.target.z + r * Math.cos(cam.az) * Math.sin(cam.tilt));
      camera.lookAt(cam.target);
    };

    const resize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = `${w}px`;
      renderer.domElement.style.height = `${h}px`;
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      // Enquadra o mapa (largura e profundidade) em qualquer proporção: o eixo mais apertado manda.
      const tan = Math.tan((camera.fov / 2) * (Math.PI / 180));
      const fit = Math.max(300 / tan, 340 / (tan * camera.aspect));
      if (cam.distT === cam.base) cam.distT = fit;
      if (cam.dist === cam.base) cam.dist = fit;
      cam.base = fit;
      wake();
    };

    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let hovered: string | null = null;
    let selected_: string | null = null;
    const pick = (cx: number, cy: number) => {
      const b = renderer.domElement.getBoundingClientRect();
      ndc.set(((cx - b.left) / b.width) * 2 - 1, -((cy - b.top) / b.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects([...items.values()].map((i) => i.mesh), false)[0];
      return { key: (hit?.object.userData.key as string) ?? null, x: cx - b.left, y: cy - b.top };
    };
    let drag: { x: number; moved: number; id: number } | null = null;
    const down = (e: PointerEvent) => {
      drag = { x: e.clientX, moved: 0, id: e.pointerId };
      wake();
    };
    const move = (e: PointerEvent) => {
      if (drag && drag.id === e.pointerId) {
        const dx = e.clientX - drag.x;
        drag.x = e.clientX;
        drag.moved += Math.abs(dx);
        if (drag.moved > 6) {
          cam.azV = -dx * 0.0042;
          cam.az += cam.azV;
          if (e.pointerType !== "mouse") e.preventDefault();
        }
        wake();
        return;
      }
      if (e.pointerType !== "mouse") return;
      const p = pick(e.clientX, e.clientY);
      if (p.key !== hovered) {
        hovered = p.key;
        renderer.domElement.style.cursor = p.key ? "pointer" : "grab";
      }
      cb.current.onHover(p.key, p.key ? { x: p.x, y: p.y } : null);
      wake();
    };
    const up = (e: PointerEvent) => {
      const wasClick = drag && drag.moved <= 6;
      drag = null;
      if (wasClick) {
        const p = pick(e.clientX, e.clientY);
        if (p.key) {
          cb.current.onSelect(p.key);
          if (e.pointerType !== "mouse") cb.current.onHover(p.key, { x: p.x, y: p.y });
        }
      }
    };
    const leave = () => {
      hovered = null;
      cb.current.onHover(null, null);
      wake();
    };
    const c = renderer.domElement;
    c.addEventListener("pointerdown", down);
    c.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    c.addEventListener("pointerleave", leave);

    // Loop sob demanda: para quando tudo assentou (economia de bateria) e volta em qualquer interação/atualização.
    let raf = 0;
    let visible = true;
    let t0 = performance.now();
    let idleSince = 0;
    const tmp = new THREE.Color();
    function frame(now: number) {
      raf = 0;
      const t = now - t0;
      let busy = false;
      for (const it of items.values()) {
        const goal = (it.target + (hovered === it.key || selected_ === it.key ? 6 : 0)) || 0.001;
        if (t < it.delay) {
          busy = true;
          continue;
        }
        const k = reducedMotion ? 1 : 0.085;
        it.h += (goal - it.h) * k;
        if (Math.abs(goal - it.h) > 0.05) busy = true;
        it.mesh.scale.z = Math.max(0.001, it.h);
        tmp.copy(it.mat.color).lerp(it.color, reducedMotion ? 1 : 0.12);
        if (!tmp.equals(it.mat.color)) busy = true;
        it.mat.color.copy(tmp);
        const glow = hovered === it.key || selected_ === it.key ? 0.32 : it.live && !reducedMotion ? 0.1 + 0.08 * Math.sin(now / 420) : 0;
        it.mat.emissive.copy(it.color).multiplyScalar(glow);
        if (it.live && !reducedMotion) busy = true;
      }
      if (!reducedMotion && !drag) {
        cam.azV *= 0.92;
        cam.az += cam.azV;
        if (Math.abs(cam.azV) > 0.0002) busy = true;
      }
      cam.dist += (cam.distT - cam.dist) * 0.08;
      cam.target.lerp(cam.targetT, 0.08);
      if (Math.abs(cam.distT - cam.dist) > 0.5 || cam.target.distanceTo(cam.targetT) > 0.5) busy = true;
      place();
      renderer.render(scene, camera);
      if (busy) idleSince = now;
      if (visible && (busy || now - idleSince < 400)) raf = requestAnimationFrame(frame);
    }
    function wake() {
      if (!raf && visible) raf = requestAnimationFrame(frame);
    }

    api.current = {
      update(cols) {
        const by = new Map(cols.map((c) => [c.key, c]));
        for (const it of items.values()) {
          const c = by.get(it.key);
          it.target = c && c.height !== null ? BASE + Math.max(0, Math.min(1, c.height)) * MAX : BASE;
          it.color.set(c && c.height !== null ? c.color : EMPTY);
          it.live = !!c?.live;
        }
        wake();
      },
      focus(k) {
        selected_ = k;
        const it = k ? items.get(k) : null;
        if (it) {
          // centro do bloco no espaço do mundo (map é espelhado e girado)
          const v = it.center.clone();
          v.z = 0;
          map.localToWorld(v);
          cam.targetT.copy(v);
          cam.distT = cam.base * (k === "ZZ" ? 0.55 : 0.62);
        } else {
          cam.targetT.set(0, 0, 0);
          cam.distT = cam.base;
        }
        wake();
      },
    };

    const ro = new ResizeObserver(resize);
    ro.observe(el);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting && !document.hidden;
      if (visible) wake();
    });
    io.observe(el);
    const vis = () => {
      visible = !document.hidden;
      if (visible) {
        t0 = performance.now() - 1e6;
        wake();
      }
    };
    document.addEventListener("visibilitychange", vis);
    resize();
    t0 = performance.now();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", vis);
      window.removeEventListener("pointerup", up);
      c.removeEventListener("pointerdown", down);
      c.removeEventListener("pointermove", move);
      c.removeEventListener("pointerleave", leave);
      for (const it of items.values()) {
        it.mesh.geometry.dispose();
        for (const ch of it.mesh.children) (ch as THREE.LineSegments).geometry.dispose();
        it.mat.dispose();
      }
      dotGeo.dispose();
      renderer.dispose();
      c.remove();
      api.current = null;
    };
    // Cena criada uma vez; dados e foco chegam pelos efeitos abaixo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => api.current?.update(columns), [columns]);
  useEffect(() => api.current?.focus(selected), [selected]);

  return <div ref={host} className="absolute inset-0" aria-hidden />;
}
