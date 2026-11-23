/**
 * Cena 3D da home. Renderiza o grafo de src/lib/nexus-graph e anima o resultado
 * dos algoritmos (ondas de BFS, caminho do Dijkstra, agentes percorrendo arestas).
 *
 * No centro fica o núcleo de linguagem: uma esfera de shader com anéis de tokens.
 * Quando o terminal interpreta uma frase, feixes saem do núcleo até os nós com a
 * atenção calculada em src/lib/nexus-graph/intent.ts, com brilho proporcional ao peso.
 *
 * Desempenho: um draw call para todos os nós (InstancedMesh), um para as arestas,
 * um para os agentes; pixel ratio ≤ 2; bloom só em telas grandes; pausa fora da tela.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import type { Graph, NodeKind } from '../../lib/nexus-graph/graph';
import type { Attention } from '../../lib/nexus-graph/intent';

const KIND_STYLE: Record<NodeKind, { size: number; color: string }> = {
  core: { size: 0.5, color: '#fff3ea' },
  section: { size: 0.55, color: '#3fd0ff' },
  experiment: { size: 0.42, color: '#b98bff' },
  project: { size: 0.48, color: '#3fe0b0' },
  dust: { size: 0.085, color: '#6b4f80' },
};
const PULSE = new THREE.Color('#ff3d8b');
// Caminho mínimo em branco-papel: o rosa fica para a onda e para a atenção.
const PATH = new THREE.Color('#fff3ea');
const EDGE = new THREE.Color('#3b2650');
const MAX_AGENTS = 600;
const LAYER_DELAY = 0.11; // segundos entre camadas da onda
const MAX_BEAMS = 6;
const TOKENS_PER_BEAM = 14;
const THINK_SECONDS = 3.2;

const CORE_VERTEX = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vPos;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    vPos = position;
    gl_Position = projectionMatrix * mv;
  }
`;
// Borda de Fresnel + faixas que correm pela superfície; uHeat (0–1) é o quanto o núcleo está "pensando".
const CORE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uHeat;
  uniform vec3 uCool;
  uniform vec3 uWarm;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vPos;
  void main() {
    float rim = pow(1.0 - max(dot(vNormal, vView), 0.0), 2.2);
    float bands = 0.5 + 0.5 * sin(vPos.y * 16.0 - uTime * (2.0 + uHeat * 9.0)) * sin(vPos.x * 7.0 + uTime * 1.3);
    vec3 color = mix(uCool, uWarm, clamp(uHeat * 0.85 + bands * 0.25, 0.0, 1.0));
    float alpha = rim * (0.75 + uHeat) + bands * (0.08 + 0.3 * uHeat);
    gl_FragColor = vec4(color * (1.0 + uHeat), alpha);
  }
`;

export interface SceneCallbacks {
  onHover?: (node: number | null) => void;
  onClick?: (node: number) => void;
  /** Chamado a cada quadro com a projeção dos nós rotulados, para posicionar rótulos em DOM. */
  onFrame?: (project: (node: number) => { x: number; y: number; visible: boolean; depth: number }) => void;
}

export interface SceneStats {
  fps: number;
  drawCalls: number;
  triangles: number;
  agents: number;
  bloom: boolean;
}

export class NexusScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private composer: EffectComposer | null = null;
  private nodes: THREE.InstancedMesh;
  private edges: THREE.LineSegments;
  private agents: THREE.Points;
  private shock: THREE.Mesh;
  private core: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private rings: THREE.Points[] = [];
  private grid: THREE.PolarGridHelper;
  private beams: THREE.LineSegments;
  private tokens: THREE.Points;
  private attention: Attention[] = [];
  private thinkStart = -99;
  private heat = 0;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2(9, 9);
  private timer = new THREE.Timer();
  private observers: { disconnect(): void }[] = [];
  private listeners: [EventTarget, string, EventListener][] = [];

  private energy: Float32Array;
  private baseColors: THREE.Color[];
  private pending: { node: number; at: number }[] = [];
  private pathNodes = new Set<number>();
  private pathEdges = new Set<number>();
  private pathUntil = 0;
  private shockStart = -1;
  private hovered: number | null = null;
  /** Tempo da simulação (agentes, respiração): para quando pausado. */
  private time = 0;
  /** Tempo dos efeitos de interação (ondas, caminhos): nunca pausa, para toda ação ter resposta. */
  private fxTime = 0;
  private speed = 1;
  private paused = false;
  private visible = true;
  private reducedMotion: boolean;
  private fpsFrames = 0;
  private fpsLast = 0;
  private fps = 0;
  private focusTween: { from: THREE.Vector3; to: THREE.Vector3; camFrom: THREE.Vector3; camTo: THREE.Vector3; t: number } | null = null;

  private agentCount = 0;
  private agentFrom = new Int32Array(MAX_AGENTS);
  private agentTo = new Int32Array(MAX_AGENTS);
  private agentT = new Float32Array(MAX_AGENTS);
  private agentRate = new Float32Array(MAX_AGENTS);

  private tmpMatrix = new THREE.Matrix4();
  private tmpColor = new THREE.Color();
  private tmpVec = new THREE.Vector3();

  constructor(
    private canvas: HTMLCanvasElement,
    private graph: Graph,
    private callbacks: SceneCallbacks = {},
  ) {
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const large = Math.min(innerWidth, innerHeight) >= 700;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, large ? 2 : 1.5));
    // Contagem manual: com pós-processamento, o reset automático só deixaria o último passo.
    this.renderer.info.autoReset = false;
    this.scene.background = new THREE.Color('#0f0818');
    this.scene.fog = new THREE.FogExp2('#0f0818', 0.035);

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);
    this.camera.position.set(0, 4, 21);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.enableZoom = false; // não sequestrar a rolagem da página
    this.controls.enablePan = false;
    this.controls.autoRotate = !this.reducedMotion;
    this.controls.autoRotateSpeed = 0.45;
    // OrbitControls define touch-action: none, o que prenderia a rolagem no celular.
    // pan-y devolve o gesto vertical à página; o horizontal continua girando a cena.
    canvas.style.touchAction = 'pan-y';

    // Nós
    const n = graph.nodes.length;
    this.energy = new Float32Array(n);
    this.baseColors = graph.nodes.map((node) => new THREE.Color(KIND_STYLE[node.kind].color));
    this.nodes = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshBasicMaterial({ toneMapped: false }), n);
    graph.nodes.forEach((_, i) => this.nodes.setColorAt(i, this.baseColors[i]));
    // Posiciona os nós antes do primeiro raycast: o InstancedMesh calcula a esfera envolvente
    // uma vez só, e com matrizes ainda vazias ela ficaria no centro e os cliques errariam.
    this.updateNodes(0);
    this.nodes.computeBoundingSphere();
    this.nodes.boundingSphere!.radius += 2; // folga para os nós crescendo nos pulsos
    this.scene.add(this.nodes);

    // Arestas
    const positions = new Float32Array(graph.edges.length * 6);
    graph.edges.forEach(([a, b], e) => {
      positions.set(graph.nodes[a].pos, e * 6);
      positions.set(graph.nodes[b].pos, e * 6 + 3);
    });
    const edgeGeometry = new THREE.BufferGeometry();
    edgeGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    edgeGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(graph.edges.length * 6), 3));
    this.edges = new THREE.LineSegments(
      edgeGeometry,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, toneMapped: false }),
    );
    this.scene.add(this.edges);

    // Agentes
    const agentGeometry = new THREE.BufferGeometry();
    agentGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_AGENTS * 3), 3));
    agentGeometry.setDrawRange(0, 0);
    this.agents = new THREE.Points(
      agentGeometry,
      new THREE.PointsMaterial({ color: '#3fd0ff', size: 0.14, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    this.scene.add(this.agents);

    // Núcleo de linguagem: casca de shader + anéis de tokens girando em planos diferentes.
    this.core = new THREE.Mesh(
      new THREE.SphereGeometry(1.25, 48, 32),
      new THREE.ShaderMaterial({
        vertexShader: CORE_VERTEX,
        fragmentShader: CORE_FRAGMENT,
        uniforms: {
          uTime: { value: 0 },
          uHeat: { value: 0 },
          uCool: { value: new THREE.Color('#8a3ffc') },
          uWarm: { value: new THREE.Color('#ffb03a') },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.scene.add(this.core);
    [
      { radius: 1.9, count: 96, tilt: [1.2, 0, 0.3], color: '#ffb03a' },
      { radius: 2.35, count: 120, tilt: [0.4, 0, -0.9], color: '#ff3d8b' },
      { radius: 2.8, count: 64, tilt: [-0.7, 0, 0.5], color: '#8a3ffc' },
    ].forEach((ring) => {
      const pts = new Float32Array(ring.count * 3);
      for (let i = 0; i < ring.count; i++) {
        // Falhas no anel parecem uma sequência de tokens, não um traço contínuo.
        const a = (i / ring.count) * Math.PI * 2;
        const r = ring.radius * (i % 7 === 0 ? 1.06 : 1);
        pts.set([Math.cos(a) * r, 0, Math.sin(a) * r], i * 3);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(pts, 3));
      const points = new THREE.Points(
        geometry,
        new THREE.PointsMaterial({ color: ring.color, size: 0.07, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
      );
      points.rotation.set(ring.tilt[0], ring.tilt[1], ring.tilt[2]);
      this.rings.push(points);
      this.scene.add(points);
    });

    // Grade holográfica abaixo da rede.
    this.grid = new THREE.PolarGridHelper(18, 16, 9, 96, '#ff3d8b', '#3b2650');
    this.grid.position.y = -7.5;
    (this.grid.material as THREE.LineBasicMaterial).transparent = true;
    (this.grid.material as THREE.LineBasicMaterial).opacity = 0.55;
    this.scene.add(this.grid);

    // Feixes de atenção (núcleo → nó) e tokens viajando por eles.
    const beamGeometry = new THREE.BufferGeometry();
    beamGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_BEAMS * 6), 3));
    beamGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_BEAMS * 6), 3));
    this.beams = new THREE.LineSegments(
      beamGeometry,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    this.beams.frustumCulled = false;
    this.scene.add(this.beams);
    const tokenGeometry = new THREE.BufferGeometry();
    tokenGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_BEAMS * TOKENS_PER_BEAM * 3), 3));
    tokenGeometry.setDrawRange(0, 0);
    this.tokens = new THREE.Points(
      tokenGeometry,
      new THREE.PointsMaterial({ color: PULSE, size: 0.16, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    this.tokens.frustumCulled = false;
    this.scene.add(this.tokens);

    // Onda de choque do clique
    this.shock = new THREE.Mesh(
      new THREE.SphereGeometry(1, 32, 16),
      new THREE.MeshBasicMaterial({ color: PULSE, transparent: true, opacity: 0, wireframe: true, depthWrite: false, toneMapped: false }),
    );
    this.scene.add(this.shock);

    if (large) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.85, 0.45, 0.12));
      this.composer.addPass(new OutputPass());
    }

    this.setAgents(this.reducedMotion ? 0 : 90);
    this.bindEvents();
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ——— API usada pela interface ———

  /** Onda de BFS: cada camada acende depois da anterior. */
  pulse(origin: number, layers: number[][]) {
    const delay = this.reducedMotion ? 0 : LAYER_DELAY / this.speed;
    layers.forEach((layer, k) => layer.forEach((node) => this.pending.push({ node, at: this.fxTime + k * delay })));
    this.shock.position.set(...this.graph.nodes[origin].pos);
    this.shockStart = this.reducedMotion ? -1 : this.fxTime;
  }

  /** O núcleo "pensa": feixes até os nós com a atenção recebida, e tokens percorrendo cada feixe. */
  think(attention: Attention[]) {
    this.attention = attention.slice(0, MAX_BEAMS);
    this.thinkStart = this.fxTime;
    this.heat = 1;
    const travel = this.reducedMotion ? 0 : 0.6;
    for (const a of this.attention) this.pending.push({ node: a.node, at: this.fxTime + travel });
  }

  showPath(path: number[]) {
    this.pathNodes = new Set(path);
    this.pathEdges.clear();
    const onPath = new Set(path.slice(1).map((v, i) => `${Math.min(v, path[i])}-${Math.max(v, path[i])}`));
    this.graph.edges.forEach(([a, b], e) => {
      if (onPath.has(`${Math.min(a, b)}-${Math.max(a, b)}`)) this.pathEdges.add(e);
    });
    this.pathUntil = this.fxTime + 8;
    // Cometa: agentes extras percorrendo o caminho, um atrás do outro.
    path.forEach((node) => this.pending.push({ node, at: this.fxTime }));
  }

  focus(node: number) {
    const target = new THREE.Vector3(...this.graph.nodes[node].pos);
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this.focusTween = {
      from: this.controls.target.clone(),
      to: target,
      camFrom: this.camera.position.clone(),
      camTo: target.clone().add(dir.multiplyScalar(9)),
      t: 0,
    };
  }

  setAgents(count: number) {
    const edges = this.graph.edges;
    for (let i = this.agentCount; i < count; i++) {
      const [a, b] = edges[Math.floor(Math.random() * edges.length)];
      this.agentFrom[i] = a;
      this.agentTo[i] = b;
      this.agentT[i] = Math.random();
      this.agentRate[i] = 0.35 + Math.random() * 0.5;
    }
    this.agentCount = Math.min(count, MAX_AGENTS);
    this.agents.geometry.setDrawRange(0, this.agentCount);
  }

  setSpeed(value: number) {
    this.speed = value;
  }

  setPaused(paused: boolean) {
    this.paused = paused;
    this.controls.autoRotate = !paused && !this.reducedMotion;
  }

  get isPaused() {
    return this.paused;
  }

  stats(): SceneStats {
    return {
      fps: this.fps,
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      agents: this.agentCount,
      bloom: this.composer !== null,
    };
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    this.timer.dispose();
    for (const [target, type, fn] of this.listeners) target.removeEventListener(type, fn);
    this.observers.forEach((o) => o.disconnect());
    this.controls.dispose();
    for (const obj of [this.nodes, this.edges, this.agents, this.shock, this.core, this.beams, this.tokens, this.grid, ...this.rings]) {
      obj.geometry.dispose();
      (obj.material as THREE.Material).dispose();
    }
    this.nodes.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
  }

  // ——— Internos ———

  private on(target: EventTarget, type: string, fn: EventListener) {
    target.addEventListener(type, fn);
    this.listeners.push([target, type, fn]);
  }

  private bindEvents() {
    this.on(this.canvas, 'pointermove', (e) => {
      const ev = e as PointerEvent;
      const rect = this.canvas.getBoundingClientRect();
      this.pointer.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    });
    this.on(this.canvas, 'pointerleave', () => this.pointer.set(9, 9));

    // Clique = soltar sem arrastar (arrastar gira a câmera).
    let down: { x: number; y: number } | null = null;
    this.on(this.canvas, 'pointerdown', (e) => {
      const ev = e as PointerEvent;
      down = { x: ev.clientX, y: ev.clientY };
    });
    this.on(this.canvas, 'pointerup', (e) => {
      const ev = e as PointerEvent;
      if (!down || Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 6) return;
      const rect = this.canvas.getBoundingClientRect();
      this.pointer.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
      const hit = this.pick();
      if (hit !== null) this.callbacks.onClick?.(hit);
    });

    const resize = new ResizeObserver(() => this.resize());
    resize.observe(this.canvas);
    this.observers.push(resize);

    const io = new IntersectionObserver(([entry]) => (this.visible = entry.isIntersecting));
    io.observe(this.canvas);
    this.observers.push(io);
    this.on(document, 'visibilitychange', () => (this.visible = !document.hidden));
  }

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    // Em telas estreitas, afasta a câmera para o grafo caber.
    this.camera.fov = w < h ? 70 : 55;
    // Em telas largas, a rede se desloca para a direita e libera a coluna do texto.
    // O deslocamento entra na projeção, então rótulos e cliques continuam alinhados.
    if (w >= 1024 && w > h) this.camera.setViewOffset(w, h, -w * 0.16, 0, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  private pick(): number | null {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObject(this.nodes);
    // Prefere nós rotulados: a poeira é pequena e não deve roubar o clique.
    const labeled = hits.find((h) => h.instanceId !== undefined && this.graph.nodes[h.instanceId].kind !== 'dust');
    const hit = labeled ?? hits[0];
    return hit?.instanceId ?? null;
  }

  private frame() {
    this.timer.update();
    if (!this.visible) return;
    const rawDt = Math.min(this.timer.getDelta(), 0.05);
    const dt = this.paused ? 0 : rawDt * this.speed;
    this.time += dt;
    const fxDt = rawDt * this.speed;
    this.fxTime += fxDt;
    this.measureFps();

    if (this.focusTween) {
      const tw = this.focusTween;
      tw.t = Math.min(1, tw.t + rawDt / (this.reducedMotion ? 0.01 : 0.9));
      const k = 1 - Math.pow(1 - tw.t, 3); // ease-out
      this.controls.target.lerpVectors(tw.from, tw.to, k);
      this.camera.position.lerpVectors(tw.camFrom, tw.camTo, k);
      if (tw.t >= 1) this.focusTween = null;
    }
    this.controls.update(rawDt);

    // Ativações agendadas (ondas e caminhos).
    if (this.pending.length) {
      const due = this.pending.filter((p) => p.at <= this.fxTime);
      for (const p of due) this.energy[p.node] = 1;
      if (due.length) this.pending = this.pending.filter((p) => p.at > this.fxTime);
    }

    const hover = this.pick();
    if (hover !== this.hovered) {
      this.hovered = hover;
      this.canvas.style.cursor = hover === null ? 'grab' : 'pointer';
      this.callbacks.onHover?.(hover);
    }

    this.updateAgents(dt);
    this.updateNodes(fxDt);
    this.updateEdges();
    this.updateShock();
    this.updateCore(rawDt);
    this.updateBeams();

    this.callbacks.onFrame?.((node) => this.project(node));
    this.renderer.info.reset();
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  private measureFps() {
    this.fpsFrames++;
    const now = performance.now();
    if (now - this.fpsLast >= 1000) {
      this.fps = Math.round((this.fpsFrames * 1000) / (now - this.fpsLast));
      this.fpsFrames = 0;
      this.fpsLast = now;
    }
  }

  private updateNodes(dt: number) {
    const decay = Math.exp(-dt * 1.8);
    const pathActive = this.fxTime < this.pathUntil;
    const wobble = this.reducedMotion ? 0 : 1;
    this.graph.nodes.forEach((node, i) => {
      this.energy[i] *= decay;
      const onPath = pathActive && this.pathNodes.has(i);
      const e = Math.max(this.energy[i], onPath ? 0.75 : 0, i === this.hovered ? 0.6 : 0);
      const breathe = 1 + wobble * 0.06 * Math.sin(this.time * 1.7 + i);
      const scale = KIND_STYLE[node.kind].size * breathe * (1 + e * (node.kind === 'dust' ? 2.2 : 0.7));
      this.tmpMatrix.makeScale(scale, scale, scale).setPosition(...node.pos);
      this.nodes.setMatrixAt(i, this.tmpMatrix);
      this.tmpColor.copy(this.baseColors[i]).lerp(onPath ? PATH : PULSE, Math.min(1, e));
      this.nodes.setColorAt(i, this.tmpColor);
    });
    this.nodes.instanceMatrix.needsUpdate = true;
    this.nodes.instanceColor!.needsUpdate = true;
  }

  private updateEdges() {
    const colors = this.edges.geometry.getAttribute('color') as THREE.BufferAttribute;
    const pathActive = this.fxTime < this.pathUntil;
    this.graph.edges.forEach(([a, b], e) => {
      const onPath = pathActive && this.pathEdges.has(e);
      const glow = Math.min(1, Math.max(this.energy[a], this.energy[b]) * 1.1);
      this.tmpColor.copy(EDGE).lerp(onPath ? PATH : PULSE, onPath ? 1 : glow);
      colors.setXYZ(e * 2, this.tmpColor.r, this.tmpColor.g, this.tmpColor.b);
      colors.setXYZ(e * 2 + 1, this.tmpColor.r, this.tmpColor.g, this.tmpColor.b);
    });
    colors.needsUpdate = true;
  }

  private updateAgents(dt: number) {
    if (this.agentCount === 0) return;
    const pos = this.agents.geometry.getAttribute('position') as THREE.BufferAttribute;
    const nodes = this.graph.nodes;
    for (let i = 0; i < this.agentCount; i++) {
      this.agentT[i] += dt * this.agentRate[i];
      if (this.agentT[i] >= 1) {
        // Chegou: deixa um rastro de energia no nó e segue para um vizinho aleatório.
        const at = this.agentTo[i];
        this.energy[at] = Math.max(this.energy[at], 0.12);
        const options = this.graph.adjacency[at];
        this.agentFrom[i] = at;
        this.agentTo[i] = options[Math.floor(Math.random() * options.length)];
        this.agentT[i] = 0;
      }
      const a = nodes[this.agentFrom[i]].pos;
      const b = nodes[this.agentTo[i]].pos;
      const t = this.agentT[i];
      pos.setXYZ(i, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
    }
    pos.needsUpdate = true;
  }

  private updateShock() {
    const mat = this.shock.material as THREE.MeshBasicMaterial;
    if (this.shockStart < 0) {
      mat.opacity = 0;
      return;
    }
    const age = this.fxTime - this.shockStart;
    if (age > 1.4) {
      this.shockStart = -1;
      mat.opacity = 0;
      return;
    }
    const s = 0.5 + age * 11;
    this.shock.scale.setScalar(s);
    mat.opacity = 0.35 * (1 - age / 1.4);
  }

  private updateCore(rawDt: number) {
    const idle = this.reducedMotion ? 0.15 : 0.12 + 0.08 * Math.sin(this.time * 1.4);
    this.heat = Math.max(idle, this.heat * Math.exp(-rawDt * 0.9));
    const u = this.core.material.uniforms;
    u.uTime.value = this.fxTime;
    u.uHeat.value = this.heat;
    const spin = this.reducedMotion ? 0 : rawDt * (0.25 + this.heat * 2.2);
    this.rings.forEach((ring, i) => {
      ring.rotateY(spin * (i % 2 ? -1 : 1) * (1 + i * 0.35));
      (ring.material as THREE.PointsMaterial).opacity = 0.45 + this.heat * 0.5;
    });
    this.core.scale.setScalar(1 + this.heat * 0.12);
  }

  private updateBeams() {
    const age = this.fxTime - this.thinkStart;
    const active = age < THINK_SECONDS && this.attention.length > 0;
    const pos = this.beams.geometry.getAttribute('position') as THREE.BufferAttribute;
    const colors = this.beams.geometry.getAttribute('color') as THREE.BufferAttribute;
    const tokenPos = this.tokens.geometry.getAttribute('position') as THREE.BufferAttribute;
    if (!active) {
      this.beams.geometry.setDrawRange(0, 0);
      this.tokens.geometry.setDrawRange(0, 0);
      return;
    }
    // Entra rápido, sai devagar: o feixe fica visível o bastante para ler os pesos.
    const envelope = Math.min(1, age / 0.25) * Math.min(1, (THINK_SECONDS - age) / 1.2);
    let t = 0;
    this.attention.forEach((a, b) => {
      const p = this.graph.nodes[a.node].pos;
      pos.setXYZ(b * 2, 0, 0, 0);
      pos.setXYZ(b * 2 + 1, p[0], p[1], p[2]);
      const k = envelope * (0.25 + a.weight * 1.6);
      colors.setXYZ(b * 2, PULSE.r * k, PULSE.g * k, PULSE.b * k);
      colors.setXYZ(b * 2 + 1, PATH.r * k * 0.6, PATH.g * k * 0.6, PATH.b * k * 0.6);
      // Mais atenção, mais tokens no feixe.
      const n = Math.max(2, Math.round(TOKENS_PER_BEAM * a.weight));
      for (let j = 0; j < n; j++) {
        const f = ((age * 0.9 + j / n) % 1) * envelope;
        tokenPos.setXYZ(t++, p[0] * f, p[1] * f, p[2] * f);
      }
    });
    this.beams.geometry.setDrawRange(0, this.attention.length * 2);
    this.tokens.geometry.setDrawRange(0, this.reducedMotion ? 0 : t);
    pos.needsUpdate = true;
    colors.needsUpdate = true;
    tokenPos.needsUpdate = true;
  }

  private project(node: number) {
    this.tmpVec.set(...this.graph.nodes[node].pos);
    const depth = this.tmpVec.distanceTo(this.camera.position);
    this.tmpVec.project(this.camera);
    return {
      x: (this.tmpVec.x * 0.5 + 0.5) * this.canvas.clientWidth,
      y: (-this.tmpVec.y * 0.5 + 0.5) * this.canvas.clientHeight,
      visible: this.tmpVec.z < 1,
      depth,
    };
  }
}

export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}
