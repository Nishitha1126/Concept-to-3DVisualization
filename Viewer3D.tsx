import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { ConceptData, ConceptComponent } from '../utils/conceptEngine';

interface Viewer3DProps {
  concept: ConceptData;
  isDark: boolean;
  simpleMode: boolean;
  onComponentHover: (component: ConceptComponent | null) => void;
}

function createGeometry(shape: ConceptComponent['shape'], simple: boolean): THREE.BufferGeometry {
  const detail = simple ? 0 : 1;
  const segments = simple ? 8 : 32;
  switch (shape) {
    case 'sphere': return new THREE.SphereGeometry(1, segments, segments);
    case 'box': return new THREE.BoxGeometry(1, 1, 1);
    case 'cylinder': return new THREE.CylinderGeometry(1, 1, 1, segments);
    case 'cone': return new THREE.ConeGeometry(1, 1, segments);
    case 'torus': return new THREE.TorusGeometry(1, 0.15, simple ? 6 : 16, segments);
    case 'ring': return new THREE.TorusGeometry(1, 0.3, simple ? 4 : 8, segments);
    case 'plane': return new THREE.PlaneGeometry(1, 1);
    case 'dodecahedron': return new THREE.DodecahedronGeometry(1, detail);
    case 'octahedron': return new THREE.OctahedronGeometry(1, detail);
    case 'icosahedron': return new THREE.IcosahedronGeometry(1, detail);
    case 'tetrahedron': return new THREE.TetrahedronGeometry(1, detail);
    case 'capsule': return new THREE.CapsuleGeometry(1, 1, simple ? 4 : 8, segments);
    default: return new THREE.SphereGeometry(1, segments, segments);
  }
}

export default function Viewer3D({ concept, isDark, simpleMode, onComponentHover }: Viewer3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animFrameRef = useRef<number>(0);
  const meshesRef = useRef<THREE.Mesh[]>([]);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const [isFullscreen, setIsFullscreen] = useState(false);

  const buildScene = useCallback(() => {
    if (!containerRef.current) return;

    // Clean up existing
    if (rendererRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      rendererRef.current.dispose();
      containerRef.current.removeChild(rendererRef.current.domElement);
    }

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: !simpleMode, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !simpleMode;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Scene
    const scene = new THREE.Scene();
    const bgColor = isDark ? 0x0a0a1a : 0xf0f4f8;
    scene.background = new THREE.Color(bgColor);
    scene.fog = new THREE.Fog(bgColor, 15, 40);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
    const dist = concept.cameraDistance || 8;
    camera.position.set(dist * 0.7, dist * 0.5, dist * 0.7);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enableZoom = true;
    controls.enablePan = true;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.8;
    controls.minDistance = 2;
    controls.maxDistance = 30;
    controlsRef.current = controls;

    // Lighting
    const ambientLight = new THREE.AmbientLight(isDark ? 0x334466 : 0x667799, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
    directionalLight.position.set(5, 8, 5);
    directionalLight.castShadow = !simpleMode;
    scene.add(directionalLight);

    const fillLight = new THREE.DirectionalLight(isDark ? 0x4466aa : 0x8899bb, 0.4);
    fillLight.position.set(-5, 3, -5);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(isDark ? 0x6644aa : 0xaa8866, 0.3);
    rimLight.position.set(0, -3, 5);
    scene.add(rimLight);

    // Grid helper
    const gridHelper = new THREE.GridHelper(20, 20, isDark ? 0x222244 : 0xccccdd, isDark ? 0x111133 : 0xddddee);
    gridHelper.position.y = -3;
    scene.add(gridHelper);

    // Build model from components
    const meshes: THREE.Mesh[] = [];
    concept.components.forEach((comp) => {
      const geometry = createGeometry(comp.shape, simpleMode);

      const materialParams: THREE.MeshStandardMaterialParameters = {
        color: new THREE.Color(comp.color),
        metalness: comp.metalness ?? 0.3,
        roughness: comp.roughness ?? 0.5,
        transparent: (comp.opacity !== undefined && comp.opacity < 1),
        opacity: comp.opacity ?? 1,
        wireframe: simpleMode ? (comp.wireframe ?? false) : (comp.wireframe ?? false),
      };

      if (comp.emissive) {
        materialParams.emissive = new THREE.Color(comp.emissive);
        materialParams.emissiveIntensity = 0.5;
      }

      const material = new THREE.MeshStandardMaterial(materialParams);
      const mesh = new THREE.Mesh(geometry, material);

      mesh.position.set(...comp.position);
      mesh.scale.set(...comp.scale);
      if (comp.rotation) {
        mesh.rotation.set(...comp.rotation);
      }

      mesh.castShadow = !simpleMode;
      mesh.receiveShadow = !simpleMode;
      mesh.userData = { component: comp };

      scene.add(mesh);
      meshes.push(mesh);
    });

    meshesRef.current = meshes;

    // Animation loop
    const clock = new THREE.Clock();

    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      // Gentle component animations
      meshes.forEach((mesh, i) => {
        const comp = mesh.userData.component as ConceptComponent;
        if (comp.emissive) {
          const mat = mesh.material as THREE.MeshStandardMaterial;
          mat.emissiveIntensity = 0.3 + Math.sin(elapsed * 2 + i) * 0.2;
        }
        // Subtle floating for small elements
        if (comp.shape === 'sphere' && comp.scale[0] < 0.3) {
          mesh.position.y = comp.position[1] + Math.sin(elapsed * 1.5 + i * 0.7) * 0.05;
        }
      });

      controls.update();
      renderer.render(scene, camera);
    };

    animate();
  }, [concept, isDark, simpleMode]);

  useEffect(() => {
    buildScene();

    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      rendererRef.current.setSize(width, height);
      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animFrameRef.current);
      if (rendererRef.current && containerRef.current) {
        rendererRef.current.dispose();
        if (rendererRef.current.domElement.parentNode === containerRef.current) {
          containerRef.current.removeChild(rendererRef.current.domElement);
        }
      }
    };
  }, [buildScene]);

  const handleMouseMove = useCallback((event: React.MouseEvent) => {
    if (!containerRef.current || !cameraRef.current || !sceneRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
    const intersects = raycasterRef.current.intersectObjects(meshesRef.current);

    // Reset all highlights
    meshesRef.current.forEach(mesh => {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      const comp = mesh.userData.component as ConceptComponent;
      mat.emissiveIntensity = comp.emissive ? 0.5 : 0;
      if (!comp.emissive) mat.emissive = new THREE.Color(0x000000);
    });

    if (intersects.length > 0) {
      const hit = intersects[0].object as THREE.Mesh;
      const mat = hit.material as THREE.MeshStandardMaterial;
      mat.emissive = new THREE.Color(isDark ? 0x4466ff : 0x2244aa);
      mat.emissiveIntensity = 0.4;
      onComponentHover(hit.userData.component as ConceptComponent);
    } else {
      onComponentHover(null);
    }
  }, [isDark, onComponentHover]);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const resetCamera = () => {
    if (!cameraRef.current || !controlsRef.current) return;
    const dist = concept.cameraDistance || 8;
    cameraRef.current.position.set(dist * 0.7, dist * 0.5, dist * 0.7);
    controlsRef.current.target.set(0, 0, 0);
    controlsRef.current.update();
  };

  const toggleAutoRotate = () => {
    if (controlsRef.current) {
      controlsRef.current.autoRotate = !controlsRef.current.autoRotate;
    }
  };

  return (
    <div className="relative w-full h-full rounded-2xl overflow-hidden">
      <div
        ref={containerRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        onMouseMove={handleMouseMove}
      />

      {/* Viewer Controls */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2">
        <button
          onClick={resetCamera}
          className={`px-3 py-2 rounded-lg text-xs font-medium transition-all backdrop-blur-md ${
            isDark ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-black/10 hover:bg-black/20 text-gray-800'
          }`}
          title="Reset Camera"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
            <path d="M3 3v5h5"/>
          </svg>
        </button>
        <button
          onClick={toggleAutoRotate}
          className={`px-3 py-2 rounded-lg text-xs font-medium transition-all backdrop-blur-md ${
            isDark ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-black/10 hover:bg-black/20 text-gray-800'
          }`}
          title="Toggle Auto-Rotate"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/>
          </svg>
        </button>
        <button
          onClick={toggleFullscreen}
          className={`px-3 py-2 rounded-lg text-xs font-medium transition-all backdrop-blur-md ${
            isDark ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-black/10 hover:bg-black/20 text-gray-800'
          }`}
          title="Toggle Fullscreen"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {isFullscreen ? (
              <>
                <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
              </>
            ) : (
              <>
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
              </>
            )}
          </svg>
        </button>
      </div>

      {/* Control hints */}
      <div className={`absolute top-4 right-4 text-xs space-y-1 backdrop-blur-md rounded-lg px-3 py-2 ${
        isDark ? 'bg-white/5 text-white/50' : 'bg-black/5 text-gray-500'
      }`}>
        <div>🖱️ Drag to rotate</div>
        <div>📌 Scroll to zoom</div>
        <div>🤚 Right-click to pan</div>
      </div>
    </div>
  );
}
