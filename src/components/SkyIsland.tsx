'use client';

import { useEffect, useRef, useState, forwardRef, useImperativeHandle, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { unityAnimParser, type AnimationData } from '@/lib/unity-anim-parser';
import { type GameState, playCollectSound } from '@/lib/secret-world';

// Animation files for the robot (subset for Sky Island)
const ANIMATION_FILES = [
  '/animations/Happy.anim',
  '/animations/Waving.anim',
  '/animations/Victory Idle.anim',
  '/animations/Default/a_Idle.anim',
  '/animations/Default/a_Walking.anim',
];

// ============================================
// COLLECTIBLE ORB COMPONENT
// ============================================

interface CollectibleOrbProps {
  position: [number, number, number];
  collected: boolean;
  id: number;
}

function CollectibleOrb({ position, collected, id }: CollectibleOrbProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.PointLight>(null);
  const [opacity, setOpacity] = useState(1);
  
  // Animate the orb floating and spinning
  useFrame((state) => {
    if (!meshRef.current || collected) return;
    
    // Floating motion
    const time = state.clock.elapsedTime;
    meshRef.current.position.y = position[1] + Math.sin(time * 2 + id) * 0.1;
    
    // Slow rotation
    meshRef.current.rotation.y = time * 0.5;
    meshRef.current.rotation.x = Math.sin(time * 0.3) * 0.2;
    
    // Pulsing glow
    if (glowRef.current) {
      glowRef.current.intensity = 2 + Math.sin(time * 3) * 0.5;
    }
  });
  
  // Fade out when collected
  useEffect(() => {
    if (collected) {
      setOpacity(0);
    }
  }, [collected]);
  
  if (collected && opacity === 0) return null;
  
  return (
    <group position={position}>
      {/* Main orb */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[0.15, 32, 32]} />
        <meshStandardMaterial
          color="#00ffff"
          emissive="#00ffff"
          emissiveIntensity={1.5}
          transparent
          opacity={opacity}
        />
      </mesh>
      
      {/* Outer glow shell */}
      <mesh scale={1.5}>
        <sphereGeometry args={[0.15, 16, 16]} />
        <meshBasicMaterial
          color="#00ffff"
          transparent
          opacity={0.2 * opacity}
          side={THREE.BackSide}
        />
      </mesh>
      
      {/* Point light for actual glow effect */}
      <pointLight
        ref={glowRef}
        color="#00ffff"
        intensity={2}
        distance={3}
        decay={2}
      />
    </group>
  );
}

// ============================================
// ROBOT MODEL FOR SKY ISLAND
// ============================================

interface IslandRobotProps {
  position: [number, number, number];
  rotation: number;
  currentAnimation: string;
  emotionGlow: string | null;
}

function IslandRobot({ position, rotation, currentAnimation, emotionGlow }: IslandRobotProps) {
  const groupRef = useRef<THREE.Group>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const currentActionRef = useRef<THREE.AnimationAction | null>(null);
  const animationsRef = useRef<Map<string, { clip: THREE.AnimationClip; data: AnimationData }>>(new Map());
  const [isLoaded, setIsLoaded] = useState(false);
  const modelRef = useRef<THREE.Group | null>(null);
  
  // Target position for smooth movement
  const targetPositionRef = useRef(new THREE.Vector3(...position));
  const targetRotationRef = useRef(rotation);
  
  // Update targets when props change
  useEffect(() => {
    targetPositionRef.current.set(...position);
    targetRotationRef.current = rotation;
  }, [position, rotation]);

  // Load model and animations
  useEffect(() => {
    let mounted = true;

    const loadModel = async () => {
      const textureLoader = new THREE.TextureLoader();
      const loadTexture = (path: string): Promise<THREE.Texture> => {
        return new Promise((resolve, reject) => {
          textureLoader.load(path, resolve, undefined, reject);
        });
      };

      try {
        const [albedo, normal, ao, metalSmoothness, eyes] = await Promise.all([
          loadTexture('/textures/jammo_albedo_alpha.png'),
          loadTexture('/textures/jammo_normal.png'),
          loadTexture('/textures/jammo_ambientocclusion.png'),
          loadTexture('/textures/jammo_metal_smoothness.png'),
          loadTexture('/textures/jammo_eyes.png'),
        ]);

        albedo.colorSpace = THREE.SRGBColorSpace;
        eyes.colorSpace = THREE.SRGBColorSpace;

        const manager = new THREE.LoadingManager();
        manager.setURLModifier((url) => {
          if (url.includes('Users/') || url.includes('Dropbox') || url.includes('mixbot_low')) {
            return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
          }
          return url;
        });

        const loader = new FBXLoader(manager);

        loader.load('/models/jammo_v1.fbx', async (fbx) => {
          if (!mounted || !groupRef.current) return;

          while (groupRef.current.children.length > 0) {
            groupRef.current.remove(groupRef.current.children[0]);
          }

          fbx.scale.set(0.01, 0.01, 0.01);
          fbx.position.set(0, 0, 0);

          fbx.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              const mesh = child as THREE.Mesh;
              mesh.castShadow = true;
              mesh.receiveShadow = true;

              if (mesh.name === 'head_screen_low') {
                mesh.material = new THREE.MeshStandardMaterial({
                  map: albedo,
                  normalMap: normal,
                  roughness: 0.2,
                  metalness: 0.8,
                  transparent: true,
                  opacity: 0.3,
                  side: THREE.DoubleSide,
                  depthWrite: false,
                });
                mesh.renderOrder = 1;
              } else if (mesh.name === 'head_eyes_low') {
                mesh.material = new THREE.MeshStandardMaterial({
                  map: eyes,
                  roughness: 0.3,
                  metalness: 0.0,
                  emissive: new THREE.Color(0xffffff),
                  emissiveMap: eyes,
                  emissiveIntensity: 0.5,
                  side: THREE.DoubleSide,
                });
                mesh.renderOrder = 0;
              } else {
                mesh.material = new THREE.MeshStandardMaterial({
                  map: albedo,
                  normalMap: normal,
                  aoMap: ao,
                  roughness: 0.7,
                  metalness: 0.3,
                  metalnessMap: metalSmoothness,
                  roughnessMap: metalSmoothness,
                  transparent: true,
                  alphaTest: 0.5,
                  side: THREE.FrontSide,
                });
              }

              if (mesh.geometry && !mesh.geometry.attributes.uv2) {
                mesh.geometry.setAttribute('uv2', mesh.geometry.attributes.uv);
              }
            }
          });

          groupRef.current.add(fbx);
          modelRef.current = fbx;

          mixerRef.current = new THREE.AnimationMixer(fbx);

          // Load animations
          for (const file of ANIMATION_FILES) {
            try {
              const animData = await unityAnimParser.loadAnimation(file);
              const clip = unityAnimParser.createThreeJSClip(animData, fbx);
              
              if (clip.tracks.length > 0) {
                animationsRef.current.set(animData.name, { clip, data: animData });
              }
            } catch (error) {
              console.error(`Failed to load animation ${file}:`, error);
            }
          }

          if (mounted) {
            setIsLoaded(true);
          }
        });
      } catch (error) {
        console.error('Failed to load model:', error);
      }
    };

    loadModel();

    return () => {
      mounted = false;
    };
  }, []);

  // Play animation
  const playAnimation = (name: string, speed = 1, loop = true) => {
    const anim = animationsRef.current.get(name);
    if (!anim || !mixerRef.current) return;

    if (currentActionRef.current) {
      currentActionRef.current.fadeOut(0.3);
    }

    const action = mixerRef.current.clipAction(anim.clip);
    action.reset();
    action.timeScale = speed;
    action.loop = loop ? THREE.LoopRepeat : THREE.LoopOnce;
    action.clampWhenFinished = !loop;
    action.fadeIn(0.3);
    action.play();

    currentActionRef.current = action;
  };

  // Handle animation changes
  useEffect(() => {
    if (!isLoaded) return;
    playAnimation(currentAnimation, 1, true);
  }, [currentAnimation, isLoaded]);

  // Update emotion glow
  useEffect(() => {
    if (!modelRef.current || !emotionGlow) return;

    modelRef.current.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const material = mesh.material as THREE.MeshStandardMaterial;
        
        if (mesh.name === 'head_eyes_low' && material.emissive) {
          material.emissive.set(emotionGlow);
          material.emissiveIntensity = 0.8;
        }
      }
    });
  }, [emotionGlow]);

  // Animation frame update
  useFrame((_, delta) => {
    if (mixerRef.current) {
      mixerRef.current.update(delta);
    }
    
    // Smooth position interpolation
    if (groupRef.current) {
      groupRef.current.position.lerp(targetPositionRef.current, 0.1);
      
      // Smooth rotation interpolation
      const currentY = groupRef.current.rotation.y;
      const targetY = targetRotationRef.current;
      let diff = targetY - currentY;
      
      // Handle angle wrapping
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      
      groupRef.current.rotation.y += diff * 0.1;
    }
  });

  return <group ref={groupRef} position={position} rotation={[0, rotation, 0]} />;
}

// ============================================
// SKY ISLAND ENVIRONMENT
// ============================================

interface IslandEnvironmentProps {
  gameState: GameState;
  currentAnimation: string;
  emotionGlow: string | null;
}

function IslandEnvironment({ gameState, currentAnimation, emotionGlow }: IslandEnvironmentProps) {
  const islandRef = useRef<THREE.Group>(null);
  const [islandLoaded, setIslandLoaded] = useState(false);

  // Load the Sky Island model (GLTF version with proper materials)
  useEffect(() => {
    let mounted = true;

    const loader = new GLTFLoader();
    loader.load('/models/skyisland/scene.gltf', (gltf) => {
      if (!mounted || !islandRef.current) return;

      // Clear previous
      while (islandRef.current.children.length > 0) {
        islandRef.current.remove(islandRef.current.children[0]);
      }

      const model = gltf.scene;
      
      // Scale and position the island
      // Scaled for larger island (0.276 = 0.24 * 1.15)
      model.scale.set(0.276, 0.276, 0.276);
      model.position.set(0, -0.69, 0);

      // Enable shadows on all meshes - GLTF materials are already correct
      model.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        }
      });

      islandRef.current.add(model);
      setIslandLoaded(true);
    }, undefined, (error) => {
      console.error('Failed to load Sky Island:', error);
    });

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <>
      {/* Sky gradient background - darker purple/blue */}
      <color attach="background" args={['#0a0515']} />
      
      {/* Ambient light - soft fill */}
      <ambientLight intensity={0.3} color="#6a7fdb" />
      
      {/* Main sun light - warm, reduced intensity */}
      <directionalLight
        position={[5, 10, 5]}
        intensity={0.8}
        color="#ffeedd"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-far={50}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
      />
      
      {/* Cool rim/fill light from opposite side */}
      <directionalLight
        position={[-5, 3, -5]}
        intensity={0.4}
        color="#4a9eff"
      />
      
      {/* Subtle hemisphere light for natural sky/ground color variation */}
      <hemisphereLight
        args={['#87ceeb', '#3d2817', 0.3]}
      />
      
      {/* Stars in the background */}
      <mesh>
        <sphereGeometry args={[50, 32, 32]} />
        <meshBasicMaterial color="#0a0a1a" side={THREE.BackSide} />
      </mesh>
      
      {/* Simple star points */}
      <points>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[new Float32Array(
              Array.from({ length: 500 * 3 }, () => (Math.random() - 0.5) * 80)
            ), 3]}
          />
        </bufferGeometry>
        <pointsMaterial size={0.1} color="#ffffff" sizeAttenuation />
      </points>
      
      {/* The island */}
      <group ref={islandRef} />
      
      {/* Collectible orbs */}
      {gameState.orbs.map((orb) => (
        <CollectibleOrb
          key={orb.id}
          id={orb.id}
          position={orb.position}
          collected={orb.collected}
        />
      ))}
      
      {/* The robot */}
      {islandLoaded && (
        <IslandRobot
          position={gameState.robotPosition}
          rotation={gameState.robotRotation}
          currentAnimation={currentAnimation}
          emotionGlow={emotionGlow}
        />
      )}
      
      {/* Camera controls */}
      <OrbitControls
        enablePan={false}
        enableZoom={true}
        minDistance={3}
        maxDistance={12}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 2.5}
        target={[0, 0.5, 0]}
      />
    </>
  );
}

// ============================================
// LOADING FALLBACK
// ============================================

function LoadingFallback() {
  return (
    <mesh>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color="#4a90d9" wireframe />
    </mesh>
  );
}

// ============================================
// MAIN SKY ISLAND COMPONENT
// ============================================

export interface SkyIslandRef {
  playAnimation: (name: string) => void;
  celebrateVictory: () => void;
}

interface SkyIslandProps {
  gameState: GameState;
  onOrbCollected?: (orbId: number) => void;
  onGameComplete?: () => void;
  className?: string;
}

const SkyIsland = forwardRef<SkyIslandRef, SkyIslandProps>(function SkyIsland(
  { gameState, className },
  ref
) {
  const [currentAnimation, setCurrentAnimation] = useState('a_Idle');
  const [emotionGlow, setEmotionGlow] = useState<string | null>('#00ffff');

  useImperativeHandle(ref, () => ({
    playAnimation: (name: string) => {
      setCurrentAnimation(name);
    },
    celebrateVictory: () => {
      setCurrentAnimation('Victory Idle');
      setEmotionGlow('#ffeb3b');
      playCollectSound();
    },
  }));

  // Play walking animation when robot is moving
  useEffect(() => {
    // Check if robot just moved by comparing animation
    if (currentAnimation === 'a_Walking') {
      const timeout = setTimeout(() => {
        setCurrentAnimation('a_Idle');
      }, 1000);
      return () => clearTimeout(timeout);
    }
  }, [gameState.robotPosition, currentAnimation]);

  return (
    <div className={className} style={{ background: '#1a0a2e' }}>
      <Canvas
        shadows
        camera={{ position: [0, 3, 7], fov: 45 }}
        gl={{ antialias: true, powerPreference: 'default', alpha: true }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.0;
        }}
      >
        <Suspense fallback={<LoadingFallback />}>
          <IslandEnvironment
            gameState={gameState}
            currentAnimation={currentAnimation}
            emotionGlow={emotionGlow}
          />
        </Suspense>
      </Canvas>
    </div>
  );
});

export default SkyIsland;
