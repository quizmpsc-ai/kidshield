package com.kidshield;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.Handler;
import android.os.HandlerThread;
import android.util.Base64;
import com.facebook.react.bridge.*;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.firestore.FirebaseFirestore;
import java.io.*;
import java.util.*;

public class AmbientAudioModule extends ReactContextBaseJavaModule {
    private final ReactApplicationContext reactContext;
    private AudioRecord audioRecord;
    private boolean isRecording = false;
    private boolean isMuted = false;
    private HandlerThread recordThread;
    private Handler recordHandler;
    private FirebaseFirestore db;
    private String childId;
    private String parentId;

    private static final int SAMPLE_RATE = 16000;
    private static final int CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO;
    private static final int AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT;
    private static final int CHUNK_DURATION_SEC = 10; // 10 second chunks upload

    public AmbientAudioModule(ReactApplicationContext context) {
        super(context);
        this.reactContext = context;
        this.db = FirebaseFirestore.getInstance();
    }

    @Override public String getName() { return "AmbientAudio"; }

    @ReactMethod
    public void setChildInfo(String cId, String pId, Promise promise) {
        this.childId = cId;
        this.parentId = pId;
        promise.resolve(true);
    }

    // â”€â”€ Start ambient capture (continuous chunks) â”€â”€
    @ReactMethod
    public void startAmbientCapture(String requestId, Promise promise) {
        if (isRecording) { promise.reject("ALREADY_RECORDING", "Already recording"); return; }

        childId = childId != null ? childId :
            (FirebaseAuth.getInstance().getCurrentUser() != null ?
                FirebaseAuth.getInstance().getCurrentUser().getUid() : null);

        recordThread = new HandlerThread("AudioRecordThread");
        recordThread.start();
        recordHandler = new Handler(recordThread.getLooper());

        recordHandler.post(() -> {
            try {
                int bufferSize = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT);
                audioRecord = new AudioRecord(MediaRecorder.AudioSource.MIC, SAMPLE_RATE,
                    CHANNEL_CONFIG, AUDIO_FORMAT, bufferSize * 4);

                if (audioRecord.getState() != AudioRecord.STATE_INITIALIZED) {
                    promise.reject("INIT_FAILED", "AudioRecord init failed");
                    return;
                }

                audioRecord.startRecording();
                isRecording = true;
                promise.resolve(true);

                // Record in chunks and upload
                while (isRecording) {
                    ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
                    byte[] buffer = new byte[bufferSize];
                    long startTime = System.currentTimeMillis();
                    long chunkDuration = CHUNK_DURATION_SEC * 1000L;

                    while (isRecording && (System.currentTimeMillis() - startTime) < chunkDuration) {
                        int read = audioRecord.read(buffer, 0, buffer.length);
                        if (read > 0 && !isMuted) {
                            outputStream.write(buffer, 0, read);
                        }
                        // Send audio level every 200ms
                        sendAudioLevel(buffer, read);
                    }

                    if (outputStream.size() > 0) {
                        byte[] pcm = outputStream.toByteArray();
                        byte[] wav = pcmToWav(pcm, SAMPLE_RATE, 1, 16);
                        String base64Audio = Base64.encodeToString(wav, Base64.NO_WRAP);
                        uploadAudioChunk(base64Audio, requestId);
                    }
                }

                audioRecord.stop();
                audioRecord.release();
                audioRecord = null;

            } catch (Exception e) {
                isRecording = false;
                // promise already resolved
            }
        });
    }

    private void sendAudioLevel(byte[] buffer, int read) {
        if (read <= 0) return;
        // Calculate RMS audio level
        long sum = 0;
        for (int i = 0; i < read - 1; i += 2) {
            short sample = (short)((buffer[i+1] << 8) | (buffer[i] & 0xFF));
            sum += sample * sample;
        }
        double rms = Math.sqrt(sum / (read / 2.0));
        int level = (int) Math.min(100, rms / 100);

        // Send to JS
        reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
            .emit("onAudioLevel", level);

        // Update Firestore realtime
        if (childId != null && parentId != null) {
            Map<String, Object> data = new HashMap<>();
            data.put("audioLevel", level);
            data.put("audioLevelAt", new Date().getTime());
            data.put("isMuted", isMuted);
            db.collection("families").document(parentId)
                .collection("children").document(childId)
                .update(data);
        }
    }

    private void uploadAudioChunk(String base64Audio, String requestId) {
        if (childId == null) return;
        Map<String, Object> data = new HashMap<>();
        data.put("childId", childId);
        data.put("audioBase64", base64Audio);
        data.put("duration", CHUNK_DURATION_SEC);
        data.put("requestId", requestId);
        data.put("type", "ambient_audio");
        data.put("timestamp", new Date().toString());
        data.put("sampleRate", SAMPLE_RATE);
        db.collection("remoteCaptures").add(data);
    }

    // â”€â”€ Stop recording â”€â”€
    @ReactMethod
    public void stopAmbientCapture(Promise promise) {
        isRecording = false;
        if (audioRecord != null) {
            try { audioRecord.stop(); audioRecord.release(); } catch (Exception e) {}
            audioRecord = null;
        }
        promise.resolve(true);
    }

    // â”€â”€ Mute / Unmute â”€â”€
    @ReactMethod
    public void setMuted(boolean muted, Promise promise) {
        this.isMuted = muted;
        promise.resolve(true);
    }

    @ReactMethod
    public void isCapturing(Promise promise) { promise.resolve(isRecording); }

    @ReactMethod
    public void isMuted(Promise promise) { promise.resolve(isMuted); }

    @ReactMethod
    public void addListener(String eventName) {}
    @ReactMethod
    public void removeListeners(Integer count) {}

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
        out.write(v & 0xff); out.write((v >> 8) & 0xff);
        out.write((v >> 16) & 0xff); out.write((v >> 24) & 0xff);
    }
    private void writeShort(DataOutputStream out, short v) throws IOException {
        out.write(v & 0xff); out.write((v >> 8) & 0xff);
    }
}