'use client';

import { useEffect, useState, useMemo } from 'react';

interface TideProgressProps {
  percentage: number;
  statusPhrase: string;
  isAnimating?: boolean;
  showFullTideCelebration?: boolean;
}

/**
 * TideProgress - A flowing tide visualization for the mindful XP system
 * 
 * Features:
 * - Animated wave SVG that rises with XP percentage
 * - Gentle breathing animation (4s cycle)
 * - Bubbles rising within the tide
 * - Ripple effect on XP gain
 * - Subtle shimmer at wave crest
 * - Full tide celebration effect
 */
export default function TideProgress({ 
  percentage, 
  statusPhrase, 
  isAnimating = false,
  showFullTideCelebration = false 
}: TideProgressProps) {
  const [ripple, setRipple] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  
  // Trigger ripple animation on XP gain
  useEffect(() => {
    if (isAnimating) {
      setRipple(true);
      const timer = setTimeout(() => setRipple(false), 600);
      return () => clearTimeout(timer);
    }
  }, [isAnimating, percentage]);
  
  // Show celebration briefly when full tide is reached
  useEffect(() => {
    if (showFullTideCelebration) {
      setShowCelebration(true);
      const timer = setTimeout(() => setShowCelebration(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [showFullTideCelebration]);
  
  // Calculate wave height based on percentage (inverted - higher % = lower y = higher tide)
  const waveHeight = useMemo(() => {
    // Wave starts at y=45 (low tide) and rises to y=8 (full tide)
    return 45 - (percentage / 100) * 37;
  }, [percentage]);
  
  // Generate bubble count based on percentage
  const bubbleCount = useMemo(() => {
    return Math.floor(percentage / 15) + 1;
  }, [percentage]);
  
  // Color intensity increases with percentage
  const tideOpacity = useMemo(() => {
    return 0.6 + (percentage / 100) * 0.35;
  }, [percentage]);

  return (
    <div className="relative mt-3 overflow-hidden rounded-lg bg-[#0a1628] h-14 border border-[#1a3a5c]">
      {/* Wave SVG */}
      <svg 
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 400 56"
        preserveAspectRatio="none"
      >
        <defs>
          {/* Tide gradient - deep ocean to aqua surface */}
          <linearGradient id="tideGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#00bcd4" stopOpacity={tideOpacity} />
            <stop offset="40%" stopColor="#0077a3" stopOpacity={tideOpacity * 0.9} />
            <stop offset="100%" stopColor="#0f3460" stopOpacity={tideOpacity * 0.8} />
          </linearGradient>
          
          {/* Shimmer gradient for wave crest */}
          <linearGradient id="shimmerGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(255,255,255,0)">
              <animate 
                attributeName="offset" 
                values="-0.5;1.5" 
                dur="3s" 
                repeatCount="indefinite"
              />
            </stop>
            <stop offset="50%" stopColor="rgba(255,255,255,0.4)">
              <animate 
                attributeName="offset" 
                values="0;2" 
                dur="3s" 
                repeatCount="indefinite"
              />
            </stop>
            <stop offset="100%" stopColor="rgba(255,255,255,0)">
              <animate 
                attributeName="offset" 
                values="0.5;2.5" 
                dur="3s" 
                repeatCount="indefinite"
              />
            </stop>
          </linearGradient>
        </defs>
        
        {/* Main wave with breathing animation */}
        <path 
          fill="url(#tideGradient)"
          className={`transition-all duration-700 ease-out ${ripple ? 'animate-tide-ripple' : ''}`}
        >
          <animate 
            attributeName="d"
            dur="4s"
            repeatCount="indefinite"
            values={`
              M 0 ${waveHeight} 
              Q 50 ${waveHeight - 3} 100 ${waveHeight} 
              T 200 ${waveHeight} 
              T 300 ${waveHeight} 
              T 400 ${waveHeight} 
              L 400 56 L 0 56 Z;
              
              M 0 ${waveHeight + 1} 
              Q 50 ${waveHeight - 4} 100 ${waveHeight + 2} 
              T 200 ${waveHeight - 1} 
              T 300 ${waveHeight + 1} 
              T 400 ${waveHeight} 
              L 400 56 L 0 56 Z;
              
              M 0 ${waveHeight} 
              Q 50 ${waveHeight - 3} 100 ${waveHeight} 
              T 200 ${waveHeight} 
              T 300 ${waveHeight} 
              T 400 ${waveHeight} 
              L 400 56 L 0 56 Z
            `}
          />
        </path>
        
        {/* Secondary wave layer for depth */}
        <path 
          fill="url(#tideGradient)"
          opacity="0.5"
        >
          <animate 
            attributeName="d"
            dur="5s"
            repeatCount="indefinite"
            values={`
              M 0 ${waveHeight + 4} 
              Q 60 ${waveHeight + 1} 120 ${waveHeight + 4} 
              T 240 ${waveHeight + 4} 
              T 360 ${waveHeight + 4} 
              T 400 ${waveHeight + 4} 
              L 400 56 L 0 56 Z;
              
              M 0 ${waveHeight + 3} 
              Q 60 ${waveHeight + 5} 120 ${waveHeight + 2} 
              T 240 ${waveHeight + 5} 
              T 360 ${waveHeight + 3} 
              T 400 ${waveHeight + 4} 
              L 400 56 L 0 56 Z;
              
              M 0 ${waveHeight + 4} 
              Q 60 ${waveHeight + 1} 120 ${waveHeight + 4} 
              T 240 ${waveHeight + 4} 
              T 360 ${waveHeight + 4} 
              T 400 ${waveHeight + 4} 
              L 400 56 L 0 56 Z
            `}
          />
        </path>
        
        {/* Shimmer line at wave crest */}
        {percentage > 5 && (
          <line 
            x1="0" y1={waveHeight} 
            x2="400" y2={waveHeight}
            stroke="url(#shimmerGradient)"
            strokeWidth="2"
            opacity="0.6"
          />
        )}
      </svg>
      
      {/* Rising bubbles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {[...Array(bubbleCount)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-white/20 animate-tide-bubble"
            style={{
              width: `${3 + (i % 3) * 2}px`,
              height: `${3 + (i % 3) * 2}px`,
              left: `${10 + i * 15 + (i % 2) * 5}%`,
              bottom: '0',
              animationDelay: `${i * 0.7}s`,
              animationDuration: `${2.5 + (i % 3) * 0.5}s`,
            }}
          />
        ))}
      </div>
      
      {/* Status overlay */}
      <div className="absolute inset-0 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <span className="text-lg" role="img" aria-label="tide">🌊</span>
          <span className="text-sm text-gray-300 font-medium tracking-wide">
            {statusPhrase}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-lg font-bold text-[#00bcd4]">
            {Math.round(percentage)}
          </span>
          <span className="text-xs text-gray-400">%</span>
        </div>
      </div>
      
      {/* Full tide celebration overlay */}
      {showCelebration && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#00bcd4]/10 animate-pulse">
          <div className="flex items-center gap-2 text-[#00bcd4]">
            <span className="text-xl">✨</span>
            <span className="text-sm font-medium">Full Tide Achieved</span>
            <span className="text-xl">✨</span>
          </div>
        </div>
      )}
    </div>
  );
}
