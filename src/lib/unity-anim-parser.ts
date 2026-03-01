/**
 * Unity .anim YAML file parser
 * Converts Unity animation clips to Three.js compatible format
 */

import * as THREE from 'three';
import jsyaml from 'js-yaml';

interface Keyframe {
  time: number;
  value: THREE.Quaternion | THREE.Vector3;
}

interface CurveData {
  path: string;
  boneName: string;
  keyframes: Keyframe[];
}

interface AnimationData {
  name: string;
  sampleRate: number;
  wrapMode: number;
  rotationCurves: CurveData[];
  positionCurves: CurveData[];
  scaleCurves: CurveData[];
  duration: number;
}

interface UnityKeyframe {
  time?: number;
  value?: {
    x?: number;
    y?: number;
    z?: number;
    w?: number;
  };
}

interface UnityCurve {
  path?: string;
  curve?: {
    m_Curve?: UnityKeyframe[];
  };
}

interface UnityAnimationClip {
  m_Name?: string;
  m_SampleRate?: number;
  m_WrapMode?: number;
  m_RotationCurves?: UnityCurve[];
  m_PositionCurves?: UnityCurve[];
  m_ScaleCurves?: UnityCurve[];
}

/**
 * Parse a Unity .anim YAML file and convert to Three.js AnimationClip
 */
export class UnityAnimParser {
  private animations: Map<string, AnimationData> = new Map();

  /**
   * Load and parse a Unity .anim file
   */
  async loadAnimation(url: string): Promise<AnimationData> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.status}`);
      }
      const yamlText = await response.text();
      return this.parseYAML(yamlText, url);
    } catch (error) {
      console.error(`Error loading animation from ${url}:`, error);
      throw error;
    }
  }

  /**
   * Parse Unity YAML animation data
   */
  parseYAML(yamlText: string, sourcePath: string = ''): AnimationData {
    // Remove Unity YAML header tags that js-yaml doesn't understand
    const cleanedYaml = yamlText
      .replace(/%YAML 1\.1/g, '')
      .replace(/%TAG !u! tag:unity3d\.com,2011:/g, '')
      .replace(/--- !u!\d+ &\d+/g, '---');

    // Parse YAML
    const docs = jsyaml.loadAll(cleanedYaml) as Array<{ AnimationClip?: UnityAnimationClip }>;
    
    // Find AnimationClip document
    const animClip = docs.find(doc => doc && doc.AnimationClip);
    
    if (!animClip || !animClip.AnimationClip) {
      throw new Error('No AnimationClip found in file');
    }

    const clip = animClip.AnimationClip;
    const animName = clip.m_Name || this.extractNameFromPath(sourcePath);
    
    return {
      name: animName,
      sampleRate: clip.m_SampleRate || 30,
      wrapMode: clip.m_WrapMode || 0,
      rotationCurves: this.parseRotationCurves(clip.m_RotationCurves || []),
      positionCurves: this.parsePositionCurves(clip.m_PositionCurves || []),
      scaleCurves: this.parseScaleCurves(clip.m_ScaleCurves || []),
      duration: this.calculateDuration(clip)
    };
  }

  /**
   * Extract animation name from file path
   */
  extractNameFromPath(path: string): string {
    const filename = path.split('/').pop() || '';
    return filename.replace('.anim', '');
  }

  /**
   * Parse rotation curves (quaternion keyframes)
   */
  parseRotationCurves(curves: UnityCurve[]): CurveData[] {
    return curves.map(curveData => {
      const path = curveData.path || '';
      const boneName = this.extractBoneName(path);
      const keyframes = this.parseCurveKeyframes(curveData.curve, 'quaternion');
      
      return {
        path: path,
        boneName: boneName,
        keyframes: keyframes
      };
    });
  }

  /**
   * Parse position curves (Vector3 keyframes)
   */
  parsePositionCurves(curves: UnityCurve[]): CurveData[] {
    return curves.map(curveData => {
      const path = curveData.path || '';
      const boneName = this.extractBoneName(path);
      const keyframes = this.parseCurveKeyframes(curveData.curve, 'vector3');
      
      return {
        path: path,
        boneName: boneName,
        keyframes: keyframes
      };
    });
  }

  /**
   * Parse scale curves (Vector3 keyframes)
   */
  parseScaleCurves(curves: UnityCurve[]): CurveData[] {
    return curves.map(curveData => {
      const path = curveData.path || '';
      const boneName = this.extractBoneName(path);
      const keyframes = this.parseCurveKeyframes(curveData.curve, 'vector3');
      
      return {
        path: path,
        boneName: boneName,
        keyframes: keyframes
      };
    });
  }

  /**
   * Parse curve keyframes from Unity format
   */
  parseCurveKeyframes(
    curve: { m_Curve?: UnityKeyframe[] } | undefined, 
    type: 'quaternion' | 'vector3'
  ): Keyframe[] {
    if (!curve || !curve.m_Curve) {
      return [];
    }

    return curve.m_Curve.map(keyframe => {
      const time = keyframe.time || 0;
      const value = keyframe.value || {};
      
      if (type === 'quaternion') {
        return {
          time: time,
          value: new THREE.Quaternion(
            value.x || 0,
            value.y || 0,
            value.z || 0,
            value.w || 1
          )
        };
      } else {
        return {
          time: time,
          value: new THREE.Vector3(
            value.x || 0,
            value.y || 0,
            value.z || 0
          )
        };
      }
    });
  }

  /**
   * Extract the bone name from a Unity bone path
   */
  extractBoneName(path: string): string {
    if (!path) return '';
    const parts = path.split('/');
    return parts[parts.length - 1];
  }

  /**
   * Calculate total animation duration from curves
   */
  calculateDuration(clip: UnityAnimationClip): number {
    let maxTime = 0;
    
    const allCurves = [
      ...(clip.m_RotationCurves || []),
      ...(clip.m_PositionCurves || []),
      ...(clip.m_ScaleCurves || [])
    ];
    
    for (const curveData of allCurves) {
      if (curveData.curve && curveData.curve.m_Curve) {
        for (const keyframe of curveData.curve.m_Curve) {
          if (keyframe.time && keyframe.time > maxTime) {
            maxTime = keyframe.time;
          }
        }
      }
    }
    
    return maxTime;
  }

  /**
   * Convert parsed animation data to Three.js AnimationClip
   */
  createThreeJSClip(animData: AnimationData, skeleton: THREE.Object3D): THREE.AnimationClip {
    const tracks: THREE.KeyframeTrack[] = [];
    
    // Create a map of bone names to their objects
    const boneMap = new Map<string, THREE.Bone>();
    skeleton.traverse((obj) => {
      if ((obj as THREE.Bone).isBone) {
        boneMap.set(obj.name, obj as THREE.Bone);
        // Also map without prefix for flexibility
        const shortName = obj.name.replace('mixamorig:', '');
        boneMap.set(shortName, obj as THREE.Bone);
      }
    });

    // Process rotation curves
    for (const curve of animData.rotationCurves) {
      const bone = this.findBone(curve, boneMap, skeleton);
      if (!bone) continue;

      if (curve.keyframes.length === 0) continue;

      const times = curve.keyframes.map(kf => kf.time);
      const values: number[] = [];
      
      for (const kf of curve.keyframes) {
        const q = kf.value as THREE.Quaternion;
        // Unity (left-handed, Z-forward) to Three.js (right-handed, Z-toward-camera)
        // Negate X and W components to flip rotation handedness
        values.push(-q.x, q.y, q.z, -q.w);
      }

      const track = new THREE.QuaternionKeyframeTrack(
        `${bone.name}.quaternion`,
        times,
        values
      );
      tracks.push(track);
    }

    // Process position curves
    for (const curve of animData.positionCurves) {
      const bone = this.findBone(curve, boneMap, skeleton);
      if (!bone) continue;

      if (curve.keyframes.length === 0) continue;

      const times = curve.keyframes.map(kf => kf.time);
      const values: number[] = [];
      
      for (const kf of curve.keyframes) {
        const v = kf.value as THREE.Vector3;
        values.push(v.x, v.y, v.z);
      }

      const track = new THREE.VectorKeyframeTrack(
        `${bone.name}.position`,
        times,
        values
      );
      tracks.push(track);
    }

    // Process scale curves
    for (const curve of animData.scaleCurves) {
      const bone = this.findBone(curve, boneMap, skeleton);
      if (!bone) continue;

      if (curve.keyframes.length === 0) continue;

      const times = curve.keyframes.map(kf => kf.time);
      const values: number[] = [];
      
      for (const kf of curve.keyframes) {
        const v = kf.value as THREE.Vector3;
        values.push(v.x, v.y, v.z);
      }

      const track = new THREE.VectorKeyframeTrack(
        `${bone.name}.scale`,
        times,
        values
      );
      tracks.push(track);
    }

    return new THREE.AnimationClip(animData.name, animData.duration, tracks);
  }

  /**
   * Find a bone in the skeleton that matches the curve's path
   */
  findBone(curve: CurveData, boneMap: Map<string, THREE.Bone>, skeleton: THREE.Object3D): THREE.Bone | null {
    // Try direct bone name match
    if (boneMap.has(curve.boneName)) {
      return boneMap.get(curve.boneName) || null;
    }

    // Try without mixamorig: prefix
    const cleanName = curve.boneName.replace('mixamorig:', '');
    if (boneMap.has(cleanName)) {
      return boneMap.get(cleanName) || null;
    }

    // Try to match by path segments
    const pathParts = curve.path.split('/');
    for (let i = pathParts.length - 1; i >= 0; i--) {
      const part = pathParts[i];
      if (boneMap.has(part)) {
        return boneMap.get(part) || null;
      }
      const cleanPart = part.replace('mixamorig:', '');
      if (boneMap.has(cleanPart)) {
        return boneMap.get(cleanPart) || null;
      }
    }

    // Search skeleton directly
    let found: THREE.Bone | null = null;
    skeleton.traverse((obj) => {
      if (found) return;
      if (obj.name === curve.boneName || 
          obj.name === cleanName ||
          obj.name.includes(cleanName)) {
        found = obj as THREE.Bone;
      }
    });

    return found;
  }

  /**
   * Load multiple animation files
   */
  async loadAnimations(urls: string[]): Promise<AnimationData[]> {
    const promises = urls.map(url => this.loadAnimation(url));
    return Promise.all(promises);
  }
}

// Export singleton instance
export const unityAnimParser = new UnityAnimParser();
export type { AnimationData };
