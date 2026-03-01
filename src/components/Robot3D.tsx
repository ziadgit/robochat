'use client';

import { useEffect, useRef, useState, forwardRef, useImperativeHandle, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { unityAnimParser, type AnimationData } from '@/lib/unity-anim-parser';
import { type AnimationMapping } from '@/lib/emotion-mapping';
import CosmicAquarium, { type QualityLevel } from './CosmicAquarium';

// Re-export QualityLevel for use in other components
export type { QualityLevel } from './CosmicAquarium';

interface JammoModelProps {
  currentAnimation: string;
  animationSpeed: number;
  emotionGlow: string | null;
  isMoving: boolean;
  movementType: 'walk' | 'run' | 'none';
  onAnimationsLoaded?: (animations: string[]) => void;
}

// Animation files configuration
const ANIMATION_FILES = {
  'Actions': [
    '/animations/Fist Pump.anim',
    '/animations/Happy.anim',
    '/animations/Jump.anim',
    '/animations/Puzzled.anim',
    '/animations/Victory Idle.anim',
    '/animations/Waving.anim',
    '/animations/Standing.anim',
    '/animations/Falling To Landing.anim',
  ],
  'Default': [
    '/animations/Default/a_Idle.anim',
    '/animations/Default/a_Idle_Battle.anim',
    '/animations/Default/a_Idle_Happy.anim',
    '/animations/Default/a_Idle_Relaxed.anim',
    '/animations/Default/a_Idle_Scared.anim',
    '/animations/Default/a_Running.anim',
    '/animations/Default/a_Walking.anim',
  ],
};

function JammoModel({ 
  currentAnimation, 
  animationSpeed, 
  emotionGlow, 
  isMoving, 
  movementType,
  onAnimationsLoaded 
}: JammoModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const currentActionRef = useRef<THREE.AnimationAction | null>(null);
  const animationsRef = useRef<Map<string, { clip: THREE.AnimationClip; data: AnimationData }>>(new Map());
  const [isLoaded, setIsLoaded] = useState(false);
  const modelRef = useRef<THREE.Group | null>(null);
  
  // Movement state
  const strollPathRef = useRef<THREE.Vector3[]>([]);
  const strollIndexRef = useRef(0);
  const strollProgressRef = useRef(0);

  // Load model and animations
  useEffect(() => {
    let mounted = true;

    const loadModel = async () => {
      // Load textures first
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

        // Set color space
        albedo.colorSpace = THREE.SRGBColorSpace;
        eyes.colorSpace = THREE.SRGBColorSpace;

        // Create a loading manager that ignores embedded texture paths
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

          // Clear previous model
          while (groupRef.current.children.length > 0) {
            groupRef.current.remove(groupRef.current.children[0]);
          }

          // Scale and position
          fbx.scale.set(0.01, 0.01, 0.01);
          fbx.position.set(0, 0, 0);

          // Apply materials
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

              // Ensure UV2 for AO map
              if (mesh.geometry && !mesh.geometry.attributes.uv2) {
                mesh.geometry.setAttribute('uv2', mesh.geometry.attributes.uv);
              }
            }
          });

          groupRef.current.add(fbx);
          modelRef.current = fbx;

          // Create animation mixer
          mixerRef.current = new THREE.AnimationMixer(fbx);

          // Load all animations
          const loadedAnimations: string[] = [];
          for (const [, files] of Object.entries(ANIMATION_FILES)) {
            for (const file of files) {
              try {
                const animData = await unityAnimParser.loadAnimation(file);
                const clip = unityAnimParser.createThreeJSClip(animData, fbx);
                
                if (clip.tracks.length > 0) {
                  animationsRef.current.set(animData.name, { clip, data: animData });
                  loadedAnimations.push(animData.name);
                }
              } catch (error) {
                console.error(`Failed to load animation ${file}:`, error);
              }
            }
          }

          if (mounted) {
            setIsLoaded(true);
            onAnimationsLoaded?.(loadedAnimations);
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
  }, [onAnimationsLoaded]);

  // Play animation function
  const playAnimation = (name: string, speed = 1, loop = true) => {
    const anim = animationsRef.current.get(name);
    if (!anim || !mixerRef.current) return;

    // Fade out current animation
    if (currentActionRef.current) {
      currentActionRef.current.fadeOut(0.3);
    }

    // Play new animation
    const action = mixerRef.current.clipAction(anim.clip);
    action.reset();
    action.timeScale = speed;
    action.loop = loop ? THREE.LoopRepeat : THREE.LoopOnce;
    action.clampWhenFinished = !loop;
    action.fadeIn(0.3);
    action.play();

    currentActionRef.current = action;
  };

  // Generate movement path
  const generatePath = () => {
    const points: THREE.Vector3[] = [];
    const radius = 2;
    const numPoints = 6;

    for (let i = 0; i < numPoints; i++) {
      const angle = (i / numPoints) * Math.PI * 2 + Math.random() * 0.5;
      const r = radius * (0.5 + Math.random() * 0.5);
      points.push(new THREE.Vector3(
        Math.cos(angle) * r,
        0,
        Math.sin(angle) * r
      ));
    }

    return points;
  };

  // Handle animation changes
  useEffect(() => {
    if (!isLoaded) return;
    playAnimation(currentAnimation, animationSpeed);
  }, [currentAnimation, animationSpeed, isLoaded]);

  // Handle movement start
  useEffect(() => {
    if (isMoving && movementType !== 'none') {
      strollPathRef.current = generatePath();
      strollIndexRef.current = 0;
      strollProgressRef.current = 0;
    } else if (!isMoving && modelRef.current) {
      // Reset position
      modelRef.current.position.set(0, 0, 0);
      modelRef.current.rotation.y = 0;
    }
  }, [isMoving, movementType]);

  // Update emotion glow effect
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

    // Update movement
    if (isMoving && movementType !== 'none' && strollPathRef.current.length > 1 && modelRef.current) {
      const model = modelRef.current;

      const speed = movementType === 'run' ? 1.5 : 0.5;
      const currentTarget = strollPathRef.current[strollIndexRef.current];
      const nextIndex = (strollIndexRef.current + 1) % strollPathRef.current.length;
      const nextTarget = strollPathRef.current[nextIndex];

      const segmentLength = currentTarget.distanceTo(nextTarget);
      strollProgressRef.current += (speed * delta) / segmentLength;

      if (strollProgressRef.current >= 1) {
        strollProgressRef.current = 0;
        strollIndexRef.current = nextIndex;
      }

      // Interpolate position
      model.position.lerpVectors(currentTarget, nextTarget, strollProgressRef.current);

      // Face movement direction
      const direction = new THREE.Vector3().subVectors(nextTarget, currentTarget).normalize();
      if (direction.length() > 0.01) {
        const targetRotation = Math.atan2(direction.x, direction.z);
        const currentRotation = model.rotation.y;
        let rotationDiff = targetRotation - currentRotation;
        
        while (rotationDiff > Math.PI) rotationDiff -= Math.PI * 2;
        while (rotationDiff < -Math.PI) rotationDiff += Math.PI * 2;
        
        model.rotation.y += rotationDiff * Math.min(1, delta * 5);
      }
    }
  });

  return <group ref={groupRef} position={[0, 0.5, 0]} />;
}

// Scene component with cosmic aquarium environment
interface SceneProps extends JammoModelProps {
  quality: QualityLevel;
}

function Scene({ quality, ...props }: SceneProps) {
  return (
    <>
      {/* Cosmic Aquarium Environment */}
      <CosmicAquarium quality={quality} robotAction={props.currentAnimation} />

      {/* Robot */}
      <JammoModel {...props} />

      {/* Camera controls */}
      <OrbitControls
        target={[0, 1, 0]}
        minDistance={1.5}
        maxDistance={15}
        maxPolarAngle={Math.PI * 0.85}
        enableDamping
        dampingFactor={0.05}
      />
    </>
  );
}

// Loading fallback
function LoadingFallback() {
  return (
    <mesh>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#e94560" wireframe />
    </mesh>
  );
}

// Export interface for controlling the robot
export interface RobotControllerRef {
  playAnimation: (mapping: AnimationMapping) => void;
  setEmotion: (glow: string | null) => void;
  startMovement: (type: 'walk' | 'run') => void;
  stopMovement: () => void;
}

interface Robot3DProps {
  className?: string;
  quality?: QualityLevel;
}

const Robot3D = forwardRef<RobotControllerRef, Robot3DProps>(function Robot3D({ className, quality = 'medium' }, ref) {
  const [currentAnimation, setCurrentAnimation] = useState('a_Idle');
  const [animationSpeed, setAnimationSpeed] = useState(1);
  const [emotionGlow, setEmotionGlow] = useState<string | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const [movementType, setMovementType] = useState<'walk' | 'run' | 'none'>('none');
  const [, setLoadedAnimations] = useState<string[]>([]);

  useImperativeHandle(ref, () => ({
    playAnimation: (mapping: AnimationMapping) => {
      setCurrentAnimation(mapping.animation);
      setAnimationSpeed(mapping.speed || 1);
      if (mapping.emotionGlow) {
        setEmotionGlow(mapping.emotionGlow);
      }
    },
    setEmotion: (glow: string | null) => {
      setEmotionGlow(glow);
    },
    startMovement: (type: 'walk' | 'run') => {
      setIsMoving(true);
      setMovementType(type);
    },
    stopMovement: () => {
      setIsMoving(false);
      setMovementType('none');
    },
  }));

  return (
    <div className={className} style={{ background: '#0a0a1a' }}>
      <Canvas
        shadows
        camera={{ position: [0, 1.5, 4], fov: 45 }}
        gl={{ antialias: true, powerPreference: 'default', alpha: true }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.2;
          gl.setClearColor(0x000000, 0); // Transparent background
        }}
      >
        <Suspense fallback={<LoadingFallback />}>
          <Scene
            quality={quality}
            currentAnimation={currentAnimation}
            animationSpeed={animationSpeed}
            emotionGlow={emotionGlow}
            isMoving={isMoving}
            movementType={movementType}
            onAnimationsLoaded={setLoadedAnimations}
          />
        </Suspense>
      </Canvas>
    </div>
  );
});

export default Robot3D;
