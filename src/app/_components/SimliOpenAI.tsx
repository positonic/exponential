import React, { useCallback, useRef, useState } from "react";
import { RealtimeClient } from "@openai/realtime-api-beta";
import { SimliClient } from "simli-client";
import IconSparkleLoader from "./IconSparkleLoader";

function VideoBox(props: any) {
  return (
      <div className="aspect-video flex rounded-sm overflow-hidden items-center h-[350px] w-[350px] justify-center bg-simligray">
          <video ref={props.video} autoPlay playsInline></video>
          <audio ref={props.audio} autoPlay ></audio>
      </div>
  );
}

interface SimliOpenAIProps {
  simli_faceid: string;
  openai_voice: "alloy"|"ash"|"ballad"|"coral"|"echo"|"sage"|"shimmer"|"verse";
  openai_model: string;
  initialPrompt: string;
  onStart: () => void;
  onClose: () => void;
  showDottedFace: boolean;
}

const simliClient = new SimliClient();

const SimliOpenAI: React.FC<SimliOpenAIProps> = ({
  simli_faceid,
  openai_voice,
  openai_model,
  initialPrompt,
  onStart,
  onClose,
  showDottedFace,
}) => {
  const simliKey = process.env.NEXT_PUBLIC_SIMLI_API_KEY;
  if (!simliKey) {
    throw new Error("NEXT_PUBLIC_SIMLI_API_KEY is not set");
  }

  // State management
  const [isLoading, setIsLoading] = useState(false);
  const [isAvatarVisible, setIsAvatarVisible] = useState(false);
  const [userMessage, setUserMessage] = useState("...");

  // Refs for various components and states
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const openAIClientRef = useRef<RealtimeClient | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  // New refs for managing audio chunk delay
  const audioChunkQueueRef = useRef<Int16Array[]>([]);
  const isProcessingChunkRef = useRef(false);


  /**
   * Processes the next audio chunk in the queue.
   */
  const processNextAudioChunk = useCallback(() => {
    if (
      audioChunkQueueRef.current.length > 0 &&
      !isProcessingChunkRef.current
    ) {
      isProcessingChunkRef.current = true;
      const audioChunk = audioChunkQueueRef.current.shift();
      if (audioChunk) {
        const chunkDurationMs = (audioChunk.length / 16000) * 1000; // Calculate chunk duration in milliseconds

        // Send audio chunks to Simli immediately
        simliClient?.sendAudioData(audioChunk as any);
        console.log(
          "Sent audio chunk to Simli:",
          chunkDurationMs,
          "Duration:",
          chunkDurationMs.toFixed(2),
          "ms"
        );
        isProcessingChunkRef.current = false;
        processNextAudioChunk();
      }
    }
  }, []);


/**
   * Starts audio recording from the user's microphone.
   */
const startRecording = useCallback(async () => {
  if (!audioContextRef.current) {
    audioContextRef.current = new AudioContext({ sampleRate: 24000 });
  }

  try {
    console.log("Starting audio recording...");
    streamRef.current = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });
    const source = audioContextRef.current.createMediaStreamSource(
      streamRef.current
    );
    processorRef.current = audioContextRef.current.createScriptProcessor(
      2048,
      1,
      1
    );

    processorRef.current.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      const audioData = new Int16Array(inputData.length);
      let sum = 0;

      for (let i = 0; i < inputData.length; i++) {
        const sample = Math.max(-1, Math.min(1, inputData[i]!));
        audioData[i] = Math.floor(sample * 32767);
        sum += Math.abs(sample);
      }

      openAIClientRef.current?.appendInputAudio(audioData);
    };

    source.connect(processorRef.current);
    processorRef.current.connect(audioContextRef.current.destination);
    console.log("Audio recording started");
  } catch (err) {
    console.error("Error accessing microphone:", err);
    throw err; // Re-throw to be handled by caller
  }
}, []);

  const initializeOpenAIClient = useCallback(async () => {
    try {
      console.log("Initializing OpenAI client...");
      openAIClientRef.current = new RealtimeClient({
        model: openai_model,
        apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
        dangerouslyAllowAPIKeyInBrowser: true,
      });

      openAIClientRef.current.updateSession({
        instructions: initialPrompt,
        voice: openai_voice,
        turn_detection: { type: "server_vad" },
        input_audio_transcription: { model: "whisper-1" },
      });

      // Set up event listeners
      openAIClientRef.current.on(
        "conversation.updated",
        handleConversationUpdate
      );

      openAIClientRef.current.on(
        "conversation.interrupted",
        interruptConversation
      );

      openAIClientRef.current.on(
        "input_audio_buffer.speech_stopped",
        handleSpeechStopped
      );
      // openAIClientRef.current.on('response.canceled', handleResponseCanceled);

      
      await openAIClientRef.current.connect();
      console.log("OpenAI Client connected successfully");
      openAIClientRef.current?.createResponse();
      await startRecording();

      setIsAvatarVisible(true);
    } catch (error: any) {  
      console.error("Error initializing OpenAI client:", error);
      throw error; // Re-throw to be handled by caller
    }
  }, [openai_model, openai_voice, initialPrompt, startRecording]);

  const eventListenerSimli = useCallback(() => {
    if (simliClient) {
      simliClient?.on("connected", async () => {
        console.log("SimliClient connected");
        const audioData = new Uint8Array(6000).fill(0);
        simliClient?.sendAudioData(audioData);
        console.log("Sent initial audio data");
        await initializeOpenAIClient();
      });

      simliClient?.on("disconnected", () => {
        console.log("SimliClient disconnected");
        openAIClientRef.current?.disconnect();
        if (audioContextRef.current) {
          audioContextRef.current?.close();
        }
      });
    }
  }, [initializeOpenAIClient]);
/**
   * Downsamples audio data from one sample rate to another using linear interpolation
   * and anti-aliasing filter.
   *
   * @param audioData - Input audio data as Int16Array
   * @param inputSampleRate - Original sampling rate in Hz
   * @param outputSampleRate - Target sampling rate in Hz
   * @returns Downsampled audio data as Int16Array
   */
const downsampleAudio = (
  audioData: Int16Array,
  inputSampleRate: number,
  outputSampleRate: number
): Int16Array => {
  if (inputSampleRate === outputSampleRate) {
    return audioData;
  }

  if (inputSampleRate < outputSampleRate) {
    throw new Error("Upsampling is not supported");
  }

  // Apply low-pass filter to prevent aliasing
  // Cut off at slightly less than the Nyquist frequency of the target sample rate
  const filteredData = applyLowPassFilter(
    audioData,
    outputSampleRate * 0.45, // Slight margin below Nyquist frequency
    inputSampleRate
  );

  const ratio = inputSampleRate / outputSampleRate;
  const newLength = Math.floor(audioData.length / ratio);
  const result = new Int16Array(newLength);

  // Linear interpolation
  for (let i = 0; i < newLength; i++) {
    const position = i * ratio;
    const index = Math.floor(position);
    const fraction = position - index;

    if (index + 1 < filteredData.length) {
      const a = filteredData[index]!;
      const b = filteredData[index + 1]!;
      result[i] = Math.round(a + fraction * (b - a));
    } else {
      result[i] = filteredData[index]!;
    }
  }

  return result;
};

  /**
   * Handles conversation updates, including user and assistant messages.
   */
  const handleConversationUpdate = useCallback((event: any) => {
    console.log("Conversation updated:", event);
    const { item, delta } = event;

    if (item.type === "message" && item.role === "assistant") {
      console.log("Assistant message detected");
      if (delta && delta.audio) {
        const downsampledAudio = downsampleAudio(delta.audio, 24000, 16000);
        audioChunkQueueRef.current.push(downsampledAudio);
        if (!isProcessingChunkRef.current) {
          processNextAudioChunk();
        }
      }
    } else if (item.type === "message" && item.role === "user") {
      setUserMessage(item.content[0].transcript);
    }
  }, [processNextAudioChunk, downsampleAudio]);

  /**
   * Handles interruptions in the conversation flow.
   */
  const interruptConversation = () => {
    console.warn("User interrupted the conversation");
    simliClient?.ClearBuffer();
    openAIClientRef.current?.cancelResponse("");
  };

  /**
   * Handles the end of user speech.
   */
  const handleSpeechStopped = useCallback((event: any) => {
    console.log("Speech stopped event received", event);
  }, []);

  /**
   * Applies a simple low-pass filter to prevent aliasing of audio
   */
  const applyLowPassFilter = (
    data: Int16Array,
    cutoffFreq: number,
    sampleRate: number
  ): Int16Array => {
    // Simple FIR filter coefficients
    const numberOfTaps = 31; // Should be odd
    const coefficients = new Float32Array(numberOfTaps);
    const fc = cutoffFreq / sampleRate;
    const middle = (numberOfTaps - 1) / 2;

    // Generate windowed sinc filter
    for (let i = 0; i < numberOfTaps; i++) {
      if (i === middle) {
        coefficients[i] = 2 * Math.PI * fc;
      } else {
        const x = 2 * Math.PI * fc * (i - middle);
        coefficients[i] = Math.sin(x) / (i - middle);
      }
      // Apply Hamming window
      coefficients[i]! *=
        0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (numberOfTaps - 1));
    }

    // Normalize coefficients
    const sum = coefficients.reduce((acc, val) => acc + val, 0);
    coefficients.forEach((_, i) => (coefficients[i]! /= sum));

    // Apply filter
    const result = new Int16Array(data.length);
    for (let i = 0; i < data.length; i++) {
      let sum = 0;
      for (let j = 0; j < numberOfTaps; j++) {
        const idx = i - j + middle;
        if (idx >= 0 && idx < data.length) {
          sum += coefficients[j]! * data[idx]!;
        }
      }
      result[i] = Math.round(sum);
    }

    return result;
  };

  
  
  /**
   * Stops audio recording from the user's microphone
   */
  const stopRecording = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    console.log("Audio recording stopped");
  }, []);

  /**
   * Handles the start of the interaction, initializing clients and starting recording.
   */
  const handleStart = useCallback(async () => {
    setIsLoading(true);
    try {
      console.log("Starting...");
      await new Promise(resolve => setTimeout(resolve, 100));
      
      simliClient?.Initialize({
        apiKey: simliKey,
        faceID: simli_faceid,
        videoRef: videoRef.current!,
        audioRef: audioRef.current!,
        handleSilence: true,
        maxSessionLength: 3600,
        maxIdleTime: 300,
        session_token: "",
        SimliURL: "",
        enableConsoleLogs: true
      });
      await simliClient?.start();
      eventListenerSimli();
    } catch (error: any) {
      console.error("Error starting interaction:", error);
    } finally {
      setIsAvatarVisible(true);
      setIsLoading(false);
    }
  }, [onStart, simliKey, simli_faceid, videoRef, audioRef, eventListenerSimli]);

  /**
   * Handles stopping the interaction, cleaning up resources and resetting states.
   */
  const handleStop = useCallback(() => {
    console.log("Stopping interaction...");
    setIsLoading(false);
    stopRecording();
    setIsAvatarVisible(false);
    simliClient?.close();
    openAIClientRef.current?.disconnect();
    if (audioContextRef.current) {
      audioContextRef.current?.close();
      audioContextRef.current = null;
    }
    stopRecording();
    onClose();
    console.log("Interaction stopped");
  }, [stopRecording, onClose]);

  return (
    <>
      <div
        className={`transition-all duration-300 ${
          showDottedFace ? "h-0 overflow-hidden" : "h-auto"
        }`}
      >
        <VideoBox video={videoRef} audio={audioRef} />
      </div>
      
      {/* Add conversation display */}
      <div className="w-full max-w-md mx-auto mt-4 p-4 bg-gray-800 rounded-lg">
        <p className="text-white mb-2">
          <span className="font-bold">User:</span> {userMessage}
        </p>
      </div>

      <div className="flex flex-col items-center">
        {!isAvatarVisible ? (
          <button
            onClick={handleStart}
            disabled={isLoading}
            className={
              "w-full h-[52px] mt-4 flex justify-center items-center bg-blue-600 text-white rounded-full py-3 px-6 transition-all duration-300 hover:text-black hover:bg-white hover:rounded disabled:bg-neutral-700 disabled:text-white disabled:hover:rounded-full"
            }
          >
            {isLoading ? (
              <IconSparkleLoader className="h-[20px] animate-loader" />
            ) : (
              <span className="font-abc-repro-mono font-bold w-[164px]">
                Test Interaction
              </span>
            )}
          </button>
        ) : (
          <>
            <div className="flex items-center gap-4 w-full">
              <button
                onClick={handleStop}
                
              >
                <span className="font-abc-repro-mono group-hover:text-black font-bold w-[164px] transition-all duration-300">
                  Stop Interaction
                </span>
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
};

export default SimliOpenAI;
