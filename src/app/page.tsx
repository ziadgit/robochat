'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { 
  type Emotion, 
  detectCommand, 
  getAnimationForInput,
  getResponseEmotion,
  parseResponseActions,
  getPrimaryAction,
  type ParsedAction,
} from '@/lib/emotion-mapping';
import type { RobotControllerRef } from '@/components/Robot3D';

// Dynamic import for the 3D component (client-side only)
const Robot3D = dynamic(() => import('@/components/Robot3D'), { 
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-gradient-to-br from-[#1a1a2e] to-[#16213e]">
      <div className="text-white text-lg animate-pulse">Loading 3D Robot...</div>
    </div>
  ),
});

interface Message {
  role: 'user' | 'assistant';
  content: string;
  displayContent?: string;  // Clean content without actions
  actions?: ParsedAction[]; // Parsed actions from response
  emotion?: string;
}

// Message bubble component with expandable actions
function MessageBubble({ message }: { message: Message }) {
  const [showActions, setShowActions] = useState(false);
  const hasActions = message.actions && message.actions.length > 0;
  const displayText = message.displayContent || message.content;
  
  return (
    <div className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2 ${
          message.role === 'user'
            ? 'bg-[#e94560] text-white'
            : 'bg-[#0f3460] text-gray-100'
        }`}
      >
        {message.emotion && (
          <div className="text-xs opacity-70 mb-1">
            Feeling: {message.emotion}
          </div>
        )}
        <p className="text-sm">{displayText}</p>
        
        {/* Actions indicator and expandable section */}
        {hasActions && (
          <div className="mt-2">
            <button
              onClick={() => setShowActions(!showActions)}
              className="text-xs opacity-60 hover:opacity-100 flex items-center gap-1 transition-opacity"
            >
              <svg 
                className={`w-3 h-3 transition-transform ${showActions ? 'rotate-90' : ''}`} 
                fill="currentColor" 
                viewBox="0 0 20 20"
              >
                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
              {message.actions!.length} action{message.actions!.length > 1 ? 's' : ''}
            </button>
            
            {showActions && (
              <div className="mt-2 space-y-1 border-t border-white/10 pt-2">
                {message.actions!.map((action, i) => (
                  <div 
                    key={i} 
                    className="text-xs opacity-70 italic flex items-center gap-2"
                  >
                    <span 
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: action.emotionGlow || '#9e9e9e' }}
                    />
                    <span>*{action.text}*</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [currentEmotion, setCurrentEmotion] = useState<Emotion | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  
  const robotRef = useRef<RobotControllerRef>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Initialize audio element
  useEffect(() => {
    audioRef.current = new Audio();
    audioRef.current.onended = () => setIsSpeaking(false);
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Speak text using ElevenLabs
  const speakText = useCallback(async (text: string, emotion?: string) => {
    if (!voiceEnabled) return;
    
    try {
      setIsSpeaking(true);
      const response = await fetch('/api/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, emotion }),
      });

      if (response.ok) {
        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        
        if (audioRef.current) {
          audioRef.current.src = audioUrl;
          await audioRef.current.play();
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('Speech API error:', response.status, errorData);
        setIsSpeaking(false);
      }
    } catch (error) {
      console.error('Speech error:', error);
      setIsSpeaking(false);
    }
  }, [voiceEnabled]);

  // Handle robot animation based on emotion and command
  const animateRobot = useCallback((emotion: Emotion | null, text: string) => {
    const command = detectCommand(text);
    const mapping = getAnimationForInput(emotion, command);
    
    if (robotRef.current) {
      robotRef.current.playAnimation(mapping);
      
      if (mapping.movement && mapping.movement !== 'none') {
        robotRef.current.startMovement(mapping.movement);
      } else {
        robotRef.current.stopMovement();
      }
    }
  }, []);

  // Send message to chat API
  const sendMessage = async (text: string, emotion: Emotion | null = null) => {
    if (!text.trim() || isLoading) return;

    const userMessage: Message = { 
      role: 'user', 
      content: text,
      emotion: emotion || undefined,
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // Animate robot based on user's emotion and potential commands
    animateRobot(emotion, text);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage].map(m => ({
            role: m.role,
            content: m.content,
          })),
          userEmotion: emotion,
        }),
      });

      const data = await response.json();
      
      if (data.content) {
        // Parse the response to extract actions
        const parsed = parseResponseActions(data.content);
        
        const assistantMessage: Message = {
          role: 'assistant',
          content: data.content,
          displayContent: parsed.displayText,
          actions: parsed.actions,
        };
        setMessages(prev => [...prev, assistantMessage]);

        // If there are parsed actions, use the primary action for animation
        const primaryAction = getPrimaryAction(parsed.actions);
        if (primaryAction) {
          if (robotRef.current) {
            robotRef.current.playAnimation({
              animation: primaryAction.animation,
              emotionGlow: primaryAction.emotionGlow,
            });
            robotRef.current.stopMovement();
          }
        } else {
          // Fall back to emotion-based animation
          const responseEmotion = emotion ? getResponseEmotion(emotion) : 'neutral';
          const responseMapping = getAnimationForInput(responseEmotion as Emotion, null);
          
          if (robotRef.current) {
            robotRef.current.playAnimation(responseMapping);
            robotRef.current.stopMovement();
          }
        }

        // Speak the clean response (without action text)
        const responseEmotion = emotion ? getResponseEmotion(emotion) : 'neutral';
        speakText(parsed.spokenText, responseEmotion);
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I had trouble processing that. Please try again!',
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Convert WebM audio to WAV
  const convertToWav = async (webmBlob: Blob): Promise<Blob> => {
    const audioContext = new AudioContext();
    const arrayBuffer = await webmBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    const numberOfChannels = 1;
    const sampleRate = 16000;
    const length = Math.ceil(audioBuffer.duration * sampleRate);
    const offlineContext = new OfflineAudioContext(numberOfChannels, length, sampleRate);
    
    const source = offlineContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineContext.destination);
    source.start();
    
    const renderedBuffer = await offlineContext.startRendering();
    const wavEncoder = await import('wav-encoder');
    
    const wavData = await wavEncoder.encode({
      sampleRate: renderedBuffer.sampleRate,
      channelData: [renderedBuffer.getChannelData(0)],
    });
    
    return new Blob([wavData], { type: 'audio/wav' });
  };

  // Handle voice recording
  const toggleRecording = async () => {
    if (isRecording) {
      // Stop recording
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
    } else {
      // Start recording
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        
        audioChunksRef.current = [];
        
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };
        
        mediaRecorder.onstop = async () => {
          setIsTranscribing(true);
          
          try {
            const webmBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            const wavBlob = await convertToWav(webmBlob);
            
            const formData = new FormData();
            formData.append('audio', wavBlob, 'recording.wav');
            
            const response = await fetch('/api/transcribe', {
              method: 'POST',
              body: formData,
            });
            
            const data = await response.json();
            
            if (data.text) {
              const emotion = data.emotion as Emotion || 'neutral';
              setCurrentEmotion(emotion);
              
              // Send the transcribed message with emotion
              await sendMessage(data.text, emotion);
            }
          } catch (error) {
            console.error('Transcription error:', error);
          } finally {
            setIsTranscribing(false);
          }
          
          // Stop all tracks
          stream.getTracks().forEach(track => track.stop());
        };
        
        mediaRecorder.start();
        mediaRecorderRef.current = mediaRecorder;
        setIsRecording(true);
      } catch (error) {
        console.error('Recording error:', error);
      }
    }
  };

  // Handle form submit
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input, currentEmotion);
    setCurrentEmotion(null);
  };

  return (
    <div className="flex h-screen bg-[#1a1a2e]">
      {/* 3D Robot Viewer */}
      <div className="flex-1 relative">
        <Robot3D ref={robotRef} className="w-full h-full" />
        
        {/* Emotion indicator */}
        {currentEmotion && (
          <div className="absolute top-4 left-4 px-3 py-1 bg-[#e94560] text-white rounded-full text-sm font-medium">
            Detected: {currentEmotion}
          </div>
        )}
        
        {/* Speaking indicator */}
        {isSpeaking && (
          <div className="absolute top-4 right-4 px-3 py-1 bg-[#4caf50] text-white rounded-full text-sm font-medium animate-pulse">
            Speaking...
          </div>
        )}
      </div>

      {/* Chat Sidebar */}
      <div className="w-[400px] bg-[#16213e] flex flex-col border-l border-[#0f3460]">
        {/* Header */}
        <div className="p-4 border-b border-[#0f3460]">
          <h1 className="text-2xl font-bold text-[#e94560]">Jammo</h1>
          <p className="text-gray-400 text-sm">Your expressive robot companion</p>
          
          {/* Voice toggle */}
          <div className="mt-2 flex items-center gap-2">
            <input
              type="checkbox"
              id="voice-toggle"
              checked={voiceEnabled}
              onChange={(e) => setVoiceEnabled(e.target.checked)}
              className="w-4 h-4 accent-[#e94560]"
            />
            <label htmlFor="voice-toggle" className="text-gray-400 text-sm cursor-pointer">
              Voice responses (ElevenLabs)
            </label>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-gray-500 mt-8">
              <p className="text-lg mb-2">Say hello to Jammo!</p>
              <p className="text-sm">Try voice commands like &ldquo;wave&rdquo;, &ldquo;jump&rdquo;, or &ldquo;dance&rdquo;</p>
              <p className="text-sm mt-1">Your emotional tone affects how Jammo responds</p>
            </div>
          )}
          
          {messages.map((message, index) => (
            <MessageBubble key={index} message={message} />
          ))}
          
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-[#0f3460] text-gray-100 rounded-2xl px-4 py-2">
                <p className="text-sm animate-pulse">Thinking...</p>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 border-t border-[#0f3460]">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 bg-[#0f3460] text-white rounded-full px-4 py-2 outline-none focus:ring-2 focus:ring-[#e94560] placeholder-gray-500"
              disabled={isLoading || isRecording || isTranscribing}
            />
            
            {/* Voice Record Button */}
            <button
              type="button"
              onClick={toggleRecording}
              disabled={isLoading || isTranscribing}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                isRecording
                  ? 'bg-red-500 animate-pulse'
                  : isTranscribing
                  ? 'bg-yellow-500'
                  : 'bg-[#0f3460] hover:bg-[#1a4a7a]'
              }`}
            >
              {isTranscribing ? (
                <svg className="w-5 h-5 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1 1.93c-3.94-.49-7-3.85-7-7.93h2c0 3.31 2.69 6 6 6s6-2.69 6-6h2c0 4.08-3.06 7.44-7 7.93V20h4v2H8v-2h4v-4.07z" />
                </svg>
              )}
            </button>
            
            {/* Send Button */}
            <button
              type="submit"
              disabled={isLoading || isRecording || isTranscribing || !input.trim()}
              className="w-10 h-10 rounded-full bg-[#e94560] flex items-center justify-center hover:bg-[#ff6b6b] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </form>
          
          {/* Quick Commands */}
          <div className="mt-3 flex flex-wrap gap-2">
            {['wave', 'jump', 'dance', 'walk'].map((cmd) => (
              <button
                key={cmd}
                onClick={() => sendMessage(cmd)}
                disabled={isLoading}
                className="px-3 py-1 text-xs bg-[#0f3460] text-gray-300 rounded-full hover:bg-[#1a4a7a] transition-colors capitalize"
              >
                {cmd}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
