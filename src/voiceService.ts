import * as sdk from "microsoft-cognitiveservices-speech-sdk";

/**
 * Transcribe audio to text using Azure Speech Services SDK
 * @param audioBuffer - Audio data as Buffer (WebM/Opus from browser)
 * @returns Transcribed text
 */
export async function transcribeAudio(audioBuffer: Buffer): Promise<string> {
  const speechKey = process.env.AZURE_SPEECH_KEY;
  const speechRegion = process.env.AZURE_SPEECH_REGION;

  if (!speechKey || !speechRegion) {
    throw new Error("Azure Speech credentials not configured");
  }

  console.log(`[STT] Starting transcription with SDK. Buffer size: ${audioBuffer.length} bytes`);

  const speechConfig = sdk.SpeechConfig.fromSubscription(speechKey, speechRegion);
  speechConfig.speechRecognitionLanguage = "en-US";

  // Make short utterances ("yes", "no") easier to catch by relaxing silence windows
  speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs, "3000");
  speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs, "800");

  // Hint format: prefer PCM 16k mono if available, else default
  let pushStream: sdk.PushAudioInputStream;
  try {
    const pcmFormat = (sdk as any).AudioStreamFormat?.getWaveFormatPCM?.(16000, 16, 1);
    if (pcmFormat) {
      pushStream = sdk.AudioInputStream.createPushStream(pcmFormat);
      console.log('[STT] Using PCM 16k mono format');
    } else {
      pushStream = sdk.AudioInputStream.createPushStream();
      console.log('[STT] Using default audio stream format');
    }
  } catch (err) {
    console.log('[STT] Falling back to default stream format:', err);
    pushStream = sdk.AudioInputStream.createPushStream();
  }
  
  // If WAV, strip 44-byte header to feed raw PCM16 to SDK
  const isWav = audioBuffer.length > 44 && audioBuffer[0] === 0x52 && audioBuffer[1] === 0x49 && audioBuffer[2] === 0x46 && audioBuffer[3] === 0x46;
  const pcmBuffer = isWav ? audioBuffer.subarray(44) : audioBuffer;
  const audioArrayBuffer = pcmBuffer.buffer.slice(pcmBuffer.byteOffset, pcmBuffer.byteOffset + pcmBuffer.byteLength);
  pushStream.write(audioArrayBuffer as ArrayBuffer);
  pushStream.close();

  const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);
  const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

  // Bias recognition toward short confirmations/denials which are easy to miss
  const phraseList = sdk.PhraseListGrammar.fromRecognizer(recognizer);
  phraseList.addPhrase("yes");
  phraseList.addPhrase("yeah");
  phraseList.addPhrase("yep");
  phraseList.addPhrase("sure");
  phraseList.addPhrase("okay");
  phraseList.addPhrase("ok");
  phraseList.addPhrase("no");
  phraseList.addPhrase("nope");
  phraseList.addPhrase("nah");

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      console.error('[STT] Recognition timed out after 30s');
      recognizer.close();
      reject(new Error('Speech recognition timed out. Please speak clearly and try again.'));
    }, 30000);

    recognizer.recognizeOnceAsync(
      (result) => {
        clearTimeout(timeout);
        recognizer.close();
        
        console.log(`[STT] Recognition completed. Result reason: ${sdk.ResultReason[result.reason]}`);
        console.log(`[STT] Result text: "${result.text}"`);
        
        if (result.reason === sdk.ResultReason.RecognizedSpeech) {
          console.log(`[STT] ✓ Recognized: "${result.text}"`);
          resolve(result.text);
        } else if (result.reason === sdk.ResultReason.NoMatch) {
          const noMatchDetail = sdk.NoMatchDetails.fromResult(result);
          console.log(`[STT] No match. Reason: ${sdk.NoMatchReason[noMatchDetail.reason]}`);
          reject(new Error('Could not recognize speech. The audio format may not be compatible. Please try again.'));
        } else if (result.reason === sdk.ResultReason.Canceled) {
          const cancellation = sdk.CancellationDetails.fromResult(result);
          console.log(`[STT] Canceled. Reason: ${sdk.CancellationReason[cancellation.reason]}`);
          console.log(`[STT] Error details: ${cancellation.errorDetails}`);
          reject(new Error(`Recognition failed: ${cancellation.errorDetails || 'Audio format not supported'}`));
        } else {
          console.log(`[STT] Unexpected reason: ${sdk.ResultReason[result.reason]}`);
          reject(new Error('Unexpected recognition result'));
        }
      },
      (error) => {
        clearTimeout(timeout);
        recognizer.close();
        const errMsg = typeof error === 'string' ? error : (error as any)?.message || String(error);
        console.error('[STT] Recognition error:', errMsg);
        reject(new Error(`Recognition error: ${errMsg}`));
      }
    );
  });
}

/**
 * Synthesize text to speech using Azure Speech Services
 * @param text - Text to synthesize
 * @returns Audio data as base64 string
 */
export async function synthesizeSpeech(text: string): Promise<string> {
  const speechKey = process.env.AZURE_SPEECH_KEY;
  const speechRegion = process.env.AZURE_SPEECH_REGION;

  if (!speechKey || !speechRegion) {
    throw new Error("Azure Speech credentials not configured");
  }

  const speechConfig = sdk.SpeechConfig.fromSubscription(speechKey, speechRegion);
  
  // Use a natural, friendly voice for healthcare context
  speechConfig.speechSynthesisVoiceName = "en-US-JennyNeural";
  speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;

  const synthesizer = new sdk.SpeechSynthesizer(speechConfig, undefined);

  return new Promise((resolve, reject) => {
    synthesizer.speakTextAsync(
      text,
      (result) => {
        if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
          const audioData = Buffer.from(result.audioData).toString("base64");
          synthesizer.close();
          resolve(audioData);
        } else {
          synthesizer.close();
          reject(new Error(`Speech synthesis failed: ${result.errorDetails}`));
        }
      },
      (error) => {
        synthesizer.close();
        reject(error);
      }
    );
  });
}
