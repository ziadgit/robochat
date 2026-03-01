'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Stars, Edges } from '@react-three/drei';
import * as THREE from 'three';

// Quality presets
export type QualityLevel = 'low' | 'medium' | 'high';

const QUALITY_SETTINGS = {
  low: {
    starCount: 1000,
    planetCount: 3,
    asteroidCount: 5,
    bubbleCount: 15,
    enableNebula: false,
    enableReflections: false,
  },
  medium: {
    starCount: 3000,
    planetCount: 4,
    asteroidCount: 8,
    bubbleCount: 30,
    enableNebula: true,
    enableReflections: false,
  },
  high: {
    starCount: 5000,
    planetCount: 5,
    asteroidCount: 12,
    bubbleCount: 50,
    enableNebula: true,
    enableReflections: true,
  },
};

// Seeded random number generator for deterministic results
// This runs at module level so values are stable across renders
function createSeededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

// Pre-generate random values for all cosmic elements
const seededRandom = createSeededRandom(42);

// Pre-generate planet data
const PLANET_DATA = Array.from({ length: 10 }, (_, i) => ({
  id: i,
  radius: 0.08 + seededRandom() * 0.15,
  orbitRadiusBase: 1.8 + i * 0.5 + seededRandom() * 0.3,
  orbitSpeed: 0.15 + seededRandom() * 0.25,
  orbitOffset: seededRandom() * Math.PI * 2,
  orbitTilt: (seededRandom() - 0.5) * 0.5,
  yOffset: 1 + seededRandom() * 2,
  hasRings: i === 1 || seededRandom() > 0.7,
}));

// Pre-generate asteroid data
const ASTEROID_DATA = Array.from({ length: 20 }, () => ({
  orbitRadius: 2 + seededRandom() * 2,
  orbitSpeed: 0.1 + seededRandom() * 0.2,
  orbitOffset: seededRandom() * Math.PI * 2,
  orbitTilt: (seededRandom() - 0.5) * 1,
  yOffset: 0.5 + seededRandom() * 3,
  scale: 0.03 + seededRandom() * 0.06,
  rotationSpeed: (seededRandom() - 0.5) * 2,
}));

// Pre-generate bubble data
const BUBBLE_DATA = Array.from({ length: 60 }, (_, i) => {
  const isOrbiting = i < 60 * 0.3;
  return {
    isOrbiting,
    x: (seededRandom() - 0.5) * 5,
    z: (seededRandom() - 0.5) * 4,
    yStart: -0.5 + seededRandom() * 0.5,
    speed: 0.2 + seededRandom() * 0.3,
    wobbleSpeed: 1 + seededRandom() * 2,
    wobbleAmount: 0.1 + seededRandom() * 0.2,
    orbitRadius: 1 + seededRandom() * 2.5,
    orbitSpeed: 0.2 + seededRandom() * 0.3,
    orbitOffset: seededRandom() * Math.PI * 2,
    yOffset: 0.5 + seededRandom() * 3.5,
    scale: 0.02 + seededRandom() * 0.05,
    phase: seededRandom() * Math.PI * 2,
  };
});

// Pre-generate asteroid geometry vertex displacements
const ASTEROID_VERTEX_NOISE = Array.from({ length: 50 }, () => 0.7 + seededRandom() * 0.6);

interface CosmicAquariumProps {
  quality: QualityLevel;
  robotAction?: string | null;
}

// Subtle glass tank container
function GlassTank({ quality }: { quality: QualityLevel }) {
  const settings = QUALITY_SETTINGS[quality];
  
  // Tank dimensions
  const width = 7;
  const height = 5;
  const depth = 5;
  
  return (
    <group>
      {/* Glass walls - render only back faces for interior view */}
      <mesh position={[0, height / 2, 0]}>
        <boxGeometry args={[width, height, depth]} />
        {settings.enableReflections ? (
          <meshPhysicalMaterial
            color="#88ddff"
            transparent
            opacity={0.05}
            transmission={0.95}
            roughness={0.05}
            metalness={0}
            ior={1.5}
            thickness={0.1}
            side={THREE.BackSide}
            depthWrite={false}
          />
        ) : (
          <meshStandardMaterial
            color="#88ddff"
            transparent
            opacity={0.03}
            side={THREE.BackSide}
            depthWrite={false}
          />
        )}
        {/* Subtle edge glow */}
        <Edges
          threshold={15}
          color="#4fc3f7"
          scale={1.001}
          lineWidth={0.5}
        />
      </mesh>
      
      {/* Corner accent lights */}
      {[
        [-width/2 + 0.1, 0.1, -depth/2 + 0.1],
        [width/2 - 0.1, 0.1, -depth/2 + 0.1],
        [-width/2 + 0.1, 0.1, depth/2 - 0.1],
        [width/2 - 0.1, 0.1, depth/2 - 0.1],
      ].map((pos, i) => (
        <pointLight
          key={i}
          position={pos as [number, number, number]}
          intensity={0.1}
          color="#4fc3f7"
          distance={3}
          decay={2}
        />
      ))}
    </group>
  );
}

// Orbiting planets with rings
interface PlanetDisplayData {
  id: number;
  radius: number;
  orbitRadius: number;
  orbitSpeed: number;
  orbitOffset: number;
  orbitTilt: number;
  yOffset: number;
  color: string;
  emissive: string;
  hasRings: boolean;
  ringColor: string;
}

function OrbitingPlanetsAnimated({ 
  quality, 
  scatterForceRef 
}: { 
  quality: QualityLevel;
  scatterForceRef: React.RefObject<number>;
}) {
  const settings = QUALITY_SETTINGS[quality];
  const groupRef = useRef<THREE.Group>(null);
  
  // Use pre-generated planet data with colors
  const planets = useMemo<PlanetDisplayData[]>(() => {
    const colors = [
      { color: '#e74c3c', emissive: '#c0392b' }, // Red/Mars
      { color: '#f39c12', emissive: '#d68910' }, // Orange/Jupiter
      { color: '#9b59b6', emissive: '#8e44ad' }, // Purple
      { color: '#3498db', emissive: '#2980b9' }, // Blue/Neptune
      { color: '#1abc9c', emissive: '#16a085' }, // Teal
    ];
    
    return PLANET_DATA.slice(0, settings.planetCount).map((p, i) => ({
      ...p,
      orbitRadius: p.orbitRadiusBase,
      ...colors[i % colors.length],
      ringColor: '#f5e6d3',
    }));
  }, [settings.planetCount]);
  
  // Animate orbits
  useFrame((state) => {
    if (!groupRef.current) return;
    
    const time = state.clock.elapsedTime;
    const scatterForce = scatterForceRef.current ?? 0;
    
    groupRef.current.children.forEach((child, i) => {
      const planet = planets[i];
      if (!planet) return;
      
      // Add scatter effect
      const scatterOffset = scatterForce * 0.5 * Math.sin(time * 10 + i);
      const currentOrbitRadius = planet.orbitRadius + scatterOffset;
      
      const angle = time * planet.orbitSpeed + planet.orbitOffset;
      child.position.x = Math.cos(angle) * currentOrbitRadius;
      child.position.z = Math.sin(angle) * currentOrbitRadius;
      child.position.y = planet.yOffset + Math.sin(angle * 0.5) * planet.orbitTilt;
      
      // Rotate planet
      child.rotation.y += 0.01;
    });
  });
  
  return (
    <group ref={groupRef}>
      {planets.map((planet) => (
        <group key={planet.id}>
          {/* Planet sphere */}
          <mesh>
            <sphereGeometry args={[planet.radius, 16, 16]} />
            <meshStandardMaterial
              color={planet.color}
              emissive={planet.emissive}
              emissiveIntensity={0.2}
              roughness={0.7}
              metalness={0.3}
            />
          </mesh>
          
          {/* Rings */}
          {planet.hasRings && (
            <mesh rotation={[Math.PI / 2 + 0.3, 0, 0]}>
              <ringGeometry args={[planet.radius * 1.4, planet.radius * 2, 32]} />
              <meshStandardMaterial
                color={planet.ringColor}
                transparent
                opacity={0.6}
                side={THREE.DoubleSide}
                roughness={0.8}
              />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}

// Orbiting asteroids
function OrbitingAsteroidsAnimated({ 
  quality, 
  scatterForceRef 
}: { 
  quality: QualityLevel;
  scatterForceRef: React.RefObject<number>;
}) {
  const settings = QUALITY_SETTINGS[quality];
  const meshRef = useRef<THREE.InstancedMesh>(null);
  
  // Use pre-generated asteroid data
  const asteroids = useMemo(() => {
    return ASTEROID_DATA.slice(0, settings.asteroidCount);
  }, [settings.asteroidCount]);
  
  // Create irregular geometry using pre-generated noise values
  const asteroidGeometry = useMemo(() => {
    const geo = new THREE.IcosahedronGeometry(1, 0);
    const positions = geo.attributes.position;
    
    // Displace vertices for irregular shape using pre-generated noise
    for (let i = 0; i < positions.count; i++) {
      const noise = ASTEROID_VERTEX_NOISE[i % ASTEROID_VERTEX_NOISE.length];
      positions.setX(i, positions.getX(i) * noise);
      positions.setY(i, positions.getY(i) * noise);
      positions.setZ(i, positions.getZ(i) * noise);
    }
    
    geo.computeVertexNormals();
    return geo;
  }, []);
  
  // Animate
  useFrame((state) => {
    if (!meshRef.current) return;
    
    const time = state.clock.elapsedTime;
    const scatterForce = scatterForceRef.current ?? 0;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Euler();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    
    asteroids.forEach((asteroid, i) => {
      const scatterOffset = scatterForce * 0.8 * Math.sin(time * 8 + i * 0.5);
      const currentOrbitRadius = asteroid.orbitRadius + scatterOffset;
      
      const angle = time * asteroid.orbitSpeed + asteroid.orbitOffset;
      position.set(
        Math.cos(angle) * currentOrbitRadius,
        asteroid.yOffset + Math.sin(angle * 0.7) * asteroid.orbitTilt,
        Math.sin(angle) * currentOrbitRadius
      );
      
      rotation.set(
        time * asteroid.rotationSpeed,
        time * asteroid.rotationSpeed * 0.7,
        0
      );
      quaternion.setFromEuler(rotation);
      
      scale.setScalar(asteroid.scale);
      
      matrix.compose(position, quaternion, scale);
      meshRef.current!.setMatrixAt(i, matrix);
    });
    
    meshRef.current.instanceMatrix.needsUpdate = true;
  });
  
  return (
    <instancedMesh
      ref={meshRef}
      args={[asteroidGeometry, undefined, settings.asteroidCount]}
      castShadow
    >
      <meshStandardMaterial
        color="#5d4e37"
        roughness={0.9}
        metalness={0.1}
      />
    </instancedMesh>
  );
}

// Cosmic bubbles
function CosmicBubblesAnimated({ 
  quality, 
  scatterForceRef 
}: { 
  quality: QualityLevel;
  scatterForceRef: React.RefObject<number>;
}) {
  const settings = QUALITY_SETTINGS[quality];
  const meshRef = useRef<THREE.InstancedMesh>(null);
  
  // Use pre-generated bubble data
  const bubbles = useMemo(() => {
    return BUBBLE_DATA.slice(0, settings.bubbleCount);
  }, [settings.bubbleCount]);
  
  // Animate
  useFrame((state) => {
    if (!meshRef.current) return;
    
    const time = state.clock.elapsedTime;
    const scatterForce = scatterForceRef.current ?? 0;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    
    bubbles.forEach((bubble, i) => {
      let x: number, y: number, z: number;
      
      if (bubble.isOrbiting) {
        // Orbital motion
        const scatterOffset = scatterForce * 0.6 * Math.sin(time * 12 + i);
        const angle = time * bubble.orbitSpeed + bubble.orbitOffset;
        x = Math.cos(angle) * (bubble.orbitRadius + scatterOffset);
        z = Math.sin(angle) * bubble.orbitRadius;
        y = bubble.yOffset + Math.sin(time + bubble.phase) * 0.3;
      } else {
        // Rising motion with wobble
        const cycleTime = 4 / bubble.speed; // Time to rise full height
        const progress = ((time * bubble.speed + bubble.phase) % cycleTime) / cycleTime;
        
        x = bubble.x + Math.sin(time * bubble.wobbleSpeed + bubble.phase) * bubble.wobbleAmount;
        x += scatterForce * Math.sin(time * 10 + i) * 0.3;
        z = bubble.z + Math.cos(time * bubble.wobbleSpeed * 0.7 + bubble.phase) * bubble.wobbleAmount * 0.5;
        y = bubble.yStart + progress * 4.5; // Rise 4.5 units
      }
      
      position.set(x, y, z);
      scale.setScalar(bubble.scale);
      
      matrix.compose(position, quaternion, scale);
      meshRef.current!.setMatrixAt(i, matrix);
    });
    
    meshRef.current.instanceMatrix.needsUpdate = true;
  });
  
  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, settings.bubbleCount]}
    >
      <sphereGeometry args={[1, 12, 12]} />
      {settings.enableReflections ? (
        <meshPhysicalMaterial
          color="#ffffff"
          transparent
          opacity={0.4}
          transmission={0.8}
          roughness={0.1}
          metalness={0}
          ior={1.33}
          iridescence={0.8}
          iridescenceIOR={1.3}
        />
      ) : (
        <meshStandardMaterial
          color="#aaddff"
          transparent
          opacity={0.3}
          roughness={0.2}
          metalness={0.1}
        />
      )}
    </instancedMesh>
  );
}

// Nebula clouds in background
function NebulaClouds() {
  const groupRef = useRef<THREE.Group>(null);
  
  const clouds = useMemo(() => [
    { position: [-8, 3, -12], scale: 8, color: '#9b59b6', rotation: 0 },
    { position: [10, 5, -15], scale: 10, color: '#3498db', rotation: 1 },
    { position: [0, 8, -18], scale: 12, color: '#e91e63', rotation: 2 },
    { position: [-12, 6, -10], scale: 7, color: '#1abc9c', rotation: 0.5 },
  ], []);
  
  // Slow rotation
  useFrame((state) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y = state.clock.elapsedTime * 0.01;
  });
  
  return (
    <group ref={groupRef}>
      {clouds.map((cloud, i) => (
        <mesh
          key={i}
          position={cloud.position as [number, number, number]}
          rotation={[0, cloud.rotation, 0]}
        >
          <planeGeometry args={[cloud.scale, cloud.scale]} />
          <meshBasicMaterial
            color={cloud.color}
            transparent
            opacity={0.15}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

// Cosmic lighting setup
function CosmicLighting() {
  return (
    <>
      {/* Ambient base */}
      <ambientLight intensity={0.3} color="#4a5568" />
      
      {/* Main directional light */}
      <directionalLight
        position={[5, 10, 7]}
        intensity={0.8}
        castShadow
        shadow-mapSize={[2048, 2048]}
        color="#ffffff"
      />
      
      {/* Colored accent lights */}
      <directionalLight position={[-5, 5, -5]} intensity={0.25} color="#8888ff" />
      <directionalLight position={[0, 5, -10]} intensity={0.15} color="#ff88aa" />
      
      {/* Underwater-style point lights */}
      <pointLight position={[-2, 3, 2]} intensity={0.3} color="#4fc3f7" distance={8} decay={2} />
      <pointLight position={[2, 2, -2]} intensity={0.25} color="#ce93d8" distance={8} decay={2} />
      <pointLight position={[0, 4, 0]} intensity={0.2} color="#80deea" distance={10} decay={2} />
    </>
  );
}

// Aquarium floor
function AquariumFloor() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <circleGeometry args={[4, 64]} />
      <meshStandardMaterial
        color="#1a1a2e"
        roughness={0.9}
        metalness={0.1}
        transparent
        opacity={0.8}
      />
    </mesh>
  );
}

// Main component
export default function CosmicAquarium({ quality, robotAction }: CosmicAquariumProps) {
  const settings = QUALITY_SETTINGS[quality];
  const scatterForceRef = useRef(0);
  const prevRobotActionRef = useRef<string | null | undefined>(null);
  
  // Decay scatter force over time and check for robot action changes
  useFrame(() => {
    // Check for energetic robot actions (comparing with previous to detect changes)
    if (robotAction !== prevRobotActionRef.current) {
      if (
        robotAction === 'Jump' || 
        robotAction === 'Fist Pump' || 
        robotAction === 'Happy' ||
        robotAction === 'Victory Idle'
      ) {
        scatterForceRef.current = 1;
      }
      prevRobotActionRef.current = robotAction;
    }
    
    // Decay scatter force
    if (scatterForceRef.current > 0) {
      scatterForceRef.current = Math.max(0, scatterForceRef.current - 0.02);
    }
  });
  
  return (
    <group>
      {/* Background elements */}
      <Stars
        radius={100}
        depth={50}
        count={settings.starCount}
        factor={4}
        saturation={0.5}
        fade
        speed={0.3}
      />
      
      {settings.enableNebula && <NebulaClouds />}
      
      {/* Tank and floor */}
      <GlassTank quality={quality} />
      <AquariumFloor />
      
      {/* Cosmic elements - pass ref.current for reactivity through useFrame */}
      <OrbitingPlanetsAnimated quality={quality} scatterForceRef={scatterForceRef} />
      <OrbitingAsteroidsAnimated quality={quality} scatterForceRef={scatterForceRef} />
      <CosmicBubblesAnimated quality={quality} scatterForceRef={scatterForceRef} />
      
      {/* Lighting */}
      <CosmicLighting />
    </group>
  );
}
