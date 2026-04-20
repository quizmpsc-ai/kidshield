package com.kidshield;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.Handler;
import android.os.HandlerThread;
import android.util.Base64;
import com.facebook.react.bridge.*;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import java.io.*;

public class AmbientAudioModule extends ReactContextBaseJavaModule {
    private final ReactApplicationContext reactContext;
    private AudioRecord audioRecord;
    private boolean isRecording = false;
    private boolean isMuted = false;
    private HandlerThread recordThread;
    private Handler recordHandler;

    private static final int SAMPLE_RATE = 16000;
    private static final int CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO;
    private static final int AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT;
    // 1-second chunks for real-time live streaming
    private static final int CHUNK_DURATION_SEC = 1; 

    public AmbientAudioModule(ReactApplicationContext context) {
        super(context);
        this.reactContext = context;
    }

    @Override public String getName() { return "AmbientAudio"; }

    @ReactMethod public void setChildInfo(String cId, String pId, Promise promise) { promise.resolve(true); }

    @ReactMethod
    public void startAmbientCapture(String requestId, Promise promise) {
        if (isRecording) { promise.resolve(true); return; }
        
        recordThread = new HandlerThread("AudioRecordThread");
        recordThread.start();
        recordHandler = new Handler(recordThread.getLooper());

        recordHandler.post(() -> {
            try {
                int bufferSize = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT);
                audioRecord = new AudioRecord(MediaRecorder.AudioSource.MIC, SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT, bufferSize * 4);
                audioRecord.startRecording();
                isRecording = true;
                promise.resolve(true);

                while (isRecording) {
                    ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
                    byte[] buffer = new byte[bufferSize];
                    long startTime = System.currentTimeMillis();
                    long chunkDuration = CHUNK_DURATION_SEC * 1000L;

                    while (isRecording && (System.currentTimeMillis() - startTime) < chunkDuration) {
                        int read = audioRecord.read(buffer, 0, buffer.length);
                        if (read > 0 && !isMuted) { outputStream.write(buffer, 0, read); }
                    }

                    if (outputStream.size() > 0 && !isMuted) {
                        byte[] pcm = outputStream.toByteArray();
                        byte[] wav = pcmToWav(pcm, SAMPLE_RATE, 1, 16);
                        String base64Audio = Base64.encodeToString(wav, Base64.NO_WRAP);
                        
                        // Emit audio frame to JS for Socket.io
                        reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                            .emit("onAudioFrame", base64Audio);
                    }
                }
                audioRecord.stop();
                audioRecord.release();
                audioRecord = null;
            } catch (Exception e) { isRecording = false; }
        });
    }

    @ReactMethod
    public void stopAmbientCapture(Promise promise) {
        isRecording = false;
        promise.resolve(true);
    }

    @ReactMethod public void setMuted(boolean muted, Promise promise) { this.isMuted = muted; promise.resolve(true); }

    private byte[] pcmToWav(byte[] pcm, int sampleRate, int channels, int bitsPerSample) throws IOException {
        int dataSize = pcm.length;
        int totalSize = 36 + dataSize;
        int byteRate = sampleRate * channels * bitsPerSample / 8;
        int blockAlign = channels * bitsPerSample / 8;
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        DataOutputStream dos = new DataOutputStream(out);
        dos.writeBytes("RIFF"); writeInt(dos, totalSize);
        dos.writeBytes("WAVE"); dos.writeBytes("fmt ");
        writeInt(dos, 16); writeShort(dos, (short) 1);
        writeShort(dos, (short) channels); writeInt(dos, sampleRate);
        writeInt(dos, byteRate); writeShort(dos, (short) blockAlign);
        writeShort(dos, (short) bitsPerSample);
        dos.writeBytes("data"); writeInt(dos, dataSize);
        dos.write(pcm);
        return out.toByteArray();
    }
    private void writeInt(DataOutputStream out, int v) throws IOException {
        out.write(v & 0xff); out.write((v >> 8) & 0xff); out.write((v >> 16) & 0xff); out.write((v >> 24) & 0xff);
    }
    private void writeShort(DataOutputStream out, short v) throws IOException {
        out.write(v & 0xff); out.write((v >> 8) & 0xff);
    }
}