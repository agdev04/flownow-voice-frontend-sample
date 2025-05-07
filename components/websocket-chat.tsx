"use client"

import { useState, useEffect, useRef, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { onAuthStateChanged } from "firebase/auth"
import { auth } from "@/app/firebase" // Ensured correct import path for this file
import { Loader2, Send, Volume2, VolumeX, Play } from "lucide-react" // Play icon is already here
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"

// Define ChatMessage interface
interface ChatMessage {
  id: string;
  type: "text" | "audio";
  content: string | AudioBuffer;
  sender: "user" | "ai";
}

export default function WebSocketChat() {
  const [message, setMessage] = useState("")
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [audioEnabled, setAudioEnabled] = useState(true)

  const wsRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  // Refs for accumulating audio chunks and managing stream timeout
  const currentAiAudioChunksRef = useRef<AudioBuffer[]>([]);
  const audioStreamTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const router = useRouter()

  // Check for Firebase authentication
  useEffect(() => {
    // Use the initialized auth instance
    if (!auth) return

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const idToken = await user.getIdToken(true)
          setToken(idToken)
        } catch (err) {
          console.error("Error getting token:", err)
          setError("Failed to get authentication token")
        }
      } else {
        // Redirect to login if not authenticated
        router.push("/login")
      }
    })

    return () => unsubscribe()
  }, [router])

  // Initialize WebSocket connection when token is available
  useEffect(() => {
    if (!token) return

    // Initialize AudioContext
    if (!audioContextRef.current) { // Ensure AudioContext is initialized only once
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
            sampleRate: 24000, // Standard sample rate for many speech services
        });
    }

    // Connect to WebSocket server
    const connectWebSocket = () => {
      try {
        wsRef.current = new WebSocket(`ws://localhost:8000/ws?token=${token}`)

        wsRef.current.onopen = () => {
          setConnected(true)
          setError(null)
        }

        wsRef.current.onclose = () => {
          setConnected(false)
        }

        wsRef.current.onerror = (event) => {
          console.error("WebSocket error:", event)
          setError("WebSocket connection error")
          setConnected(false)
        }

        wsRef.current.onmessage = (event) => {
          setLoading(false)

          if (event.data instanceof Blob) {
            // AI sent an audio message, handle chunk accumulation
            handleAudioChunk(event.data)
          } else {
            // AI sent a text message
            const newAiTextMessage: ChatMessage = {
              id: `${Date.now()}-${Math.random()}`,
              type: "text",
              content: event.data as string,
              sender: "ai",
            };
            setMessages((prev) => [...prev, newAiTextMessage])
          }
        }
      } catch (err) {
        console.error("Failed to connect to WebSocket:", err)
        setError("Failed to connect to WebSocket server")
        setConnected(false)
      }
    }

    connectWebSocket()

    // Clean up WebSocket connection and AudioContext
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }

      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close()
      }
    }
  }, [token])

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // New function to process accumulated audio chunks for a single AI response turn
  const processAccumulatedAudio = () => {
    if (!audioContextRef.current || currentAiAudioChunksRef.current.length === 0) {
      currentAiAudioChunksRef.current = []; // Clear if empty or no context
      return;
    }

    const chunks = currentAiAudioChunksRef.current;
    currentAiAudioChunksRef.current = []; // Clear chunks immediately

    try {
      let totalLength = 0;
      chunks.forEach(buffer => {
        totalLength += buffer.length;
      });

      if (totalLength === 0) return;

      const firstChunk = chunks[0];
      const numChannels = firstChunk.numberOfChannels;
      const sampleRate = firstChunk.sampleRate;

      const combinedBuffer = audioContextRef.current.createBuffer(
        numChannels,
        totalLength,
        sampleRate
      );

      let offset = 0;
      chunks.forEach(buffer => {
        for (let channel = 0; channel < numChannels; channel++) {
          combinedBuffer.copyToChannel(buffer.getChannelData(channel), channel, offset);
        }
        offset += buffer.length;
      });

      const newAiAudioMessage: ChatMessage = {
        id: `${Date.now()}-ai-audio-${Math.random()}`,
        type: "audio",
        content: combinedBuffer,
        sender: "ai",
      };
      setMessages((prevMessages) => [...prevMessages, newAiAudioMessage]);

    } catch (err) {
      console.error("Error processing accumulated audio:", err);
      setError("Failed to process AI audio response.");
    }
  };

  // Handle individual audio chunks from WebSocket
  const handleAudioChunk = (blob: Blob) => {
    if (!audioContextRef.current || !audioEnabled) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const arrayBuffer = e.target?.result as ArrayBuffer;
      if (audioContextRef.current) {
        audioContextRef.current.decodeAudioData(arrayBuffer)
          .then((buffer) => {
            currentAiAudioChunksRef.current.push(buffer);

            // Clear previous timeout and set a new one
            if (audioStreamTimeoutRef.current) {
              clearTimeout(audioStreamTimeoutRef.current);
            }
            audioStreamTimeoutRef.current = setTimeout(() => {
              processAccumulatedAudio();
            }, 500); // Adjust timeout as needed (e.g., 500ms)
          })
          .catch((err) => {
            console.error("Error decoding audio data chunk:", err);
          });
      }
    };
    reader.readAsArrayBuffer(blob);
  };

  // Removed playNextAudioBuffer function and related refs (audioBufferQueueRef, isPlayingRef)
  // The handleAudioMessage function is replaced by handleAudioChunk and processAccumulatedAudio

  // Play a specific audio message (AudioBuffer) from the chat
  const playAudioMessage = (audioBuffer: AudioBuffer) => {
    if (!audioContextRef.current || !audioEnabled || !audioBuffer) return;
    try {
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);
      source.start();
    } catch (err) {
      console.error("Error playing audio message:", err);
      setError("Failed to play audio message");
    }
  };

  // Send message to WebSocket server
  const sendMessage = (e: FormEvent) => {
    e.preventDefault()

    if (!message.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return

    // If AI is "speaking" (i.e. audio chunks are being received), finalize current audio before sending new user message
    if (audioStreamTimeoutRef.current) {
      clearTimeout(audioStreamTimeoutRef.current);
      audioStreamTimeoutRef.current = null; // Prevent it from firing after manual processing
      processAccumulatedAudio(); // Process any pending chunks immediately
    }

    setLoading(true)
    // Add user's text message to the messages state
    const newUserMessage: ChatMessage = {
      id: `${Date.now()}-${Math.random()}`,
      type: "text",
      content: message,
      sender: "user",
    };
    setMessages((prevMessages) => [...prevMessages, newUserMessage]);

    wsRef.current.send(message)
    setMessage("")
  }

  // Toggle audio playback
  const toggleAudio = () => {
    setAudioEnabled(!audioEnabled)
  }

  return (
    <Card className="w-full max-w-md mx-auto shadow-lg">
      <CardHeader className="border-b">
        <div className="flex items-center justify-between">
          <CardTitle>WebSocket Chat</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant={connected ? "default" : "destructive"}>{connected ? "Connected" : "Disconnected"}</Badge>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleAudio}
              title={audioEnabled ? "Mute Audio" : "Enable Audio"}
            >
              {audioEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4">
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="h-[300px] overflow-y-auto border rounded-md p-3 mb-4">
          {messages.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">No messages yet</p>
          ) : (
            <ul className="flex flex-col space-y-2">
              {messages.map((msg) => (
                <li
                  key={msg.id}
                  className={`p-3 rounded-lg max-w-[75%] break-words ${ // Added break-words for long text
                    msg.sender === "user"
                      ? "bg-primary text-primary-foreground self-end"
                      : "bg-muted self-start"
                  }`}
                >
                  {msg.type === "text" ? (
                    <span>{msg.content as string}</span>
                  ) : (
                    <Button
                      onClick={() => {
                        if (msg.content instanceof AudioBuffer) {
                           playAudioMessage(msg.content);
                        } else {
                           console.error("Attempted to play non-AudioBuffer content for message ID:", msg.id);
                           setError("Cannot play this audio message.")
                        }
                      }}
                      disabled={!audioEnabled || !(msg.content instanceof AudioBuffer)}
                      variant="outline"
                      size="sm"
                      className="flex items-center"
                    >
                      <Play className="mr-2 h-4 w-4" />
                      <span>Play AI Response</span>
                    </Button>
                  )}
                </li>
              ))}
              <div ref={messagesEndRef} />
            </ul>
          )}
        </div>
        {/* Removed Playback All Audio Button and related logic */}
      </CardContent>

      <CardFooter className="border-t p-4">
        <form onSubmit={sendMessage} className="flex w-full gap-2">
          <Input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type your message..."
            disabled={!connected || loading}
          />
          <Button type="submit" disabled={!connected || loading || !message.trim()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </CardFooter>
    </Card>
  )
}
