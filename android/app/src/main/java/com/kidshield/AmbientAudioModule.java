// android/app/src/main/java/com/kidshield/AmbientAudioModule.java
// AirDroid-style one-way ambient audio monitoring

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
    private HandlerThread recordThread;
    private Handler recordHandler;
    private FirebaseFirestore db;

    private static final int SAMPLE_RATE = 16000;
    private static final int CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO;
    private static final int AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT;
    private static final int RECORD_DURATION_SEC = 30; // 30 second clips

    public AmbientAudioModule(ReactApplicationContext context) {
        super(context);
        this.reactContext = context;
        this.db = FirebaseFirestore.getInstance();
    }

    @Override
    public String getName() { return "AmbientAudio"; }

    // ── Start recording ambient audio ──
    @ReactMethod
    public void startAmbientCapture(String requestId, Promise promise) {
        if (isRecording) {
            promise.reject("ALREADY_RECORDING", "Already recording");
            return;
        }

        recordThread = new HandlerThread("AudioRecordThread");
        recordThread.start();
        recordHandler = new Handler(recordThread.getLooper());

        recordHandler.post(() -> {
            try {
                int bufferSize = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT);
                audioRecord = new AudioRecord(
                    MediaRecorder.AudioSource.MIC,
                    SAMPLE_RATE,
                    CHANNEL_CONFIG,
                    AUDIO_FORMAT,
                    bufferSize * 4
                );

                if (audioRecord.getState() != AudioRecord.STATE_INITIALIZED) {
                    promise.reject("INIT_FAILED", "AudioRecord init failed");
                    return;
                }

                audioRecord.startRecording();
                isRecording = true;

                ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
                byte[] buffer = new byte[bufferSize];
                long startTime = System.currentTimeMillis();
                long duration = RECORD_DURATION_SEC * 1000L;

                // Record for specified duration
                while (isRecording && (System.currentTimeMillis() - startTime) < duration) {
                    int read = audioRecord.read(buffer, 0, buffer.length);
                    if (read > 0) {
                        outputStream.write(buffer, 0, read);
                    }
                }

                audioRecord.stop();
                audioRecord.release();
                isRecording = false;

                // PCM to WAV convert
                byte[] pcmData = outputStream.toByteArray();
                byte[] wavData = pcmToWav(pcmData, SAMPLE_RATE, 1, 16);

                // Base64 encode + Firebase upload
                String base64Audio = Base64.encodeToString(wavData, Base64.DEFAULT);
                uploadAudioToFirebase(base64Audio, requestId, promise);

            } catch (Exception e) {
                isRecording = false;
                promise.reject("RECORD_ERROR", e.getMessage());
            }
        });
    }

    // ── Stop recording ──
    @ReactMethod
    public void stopAmbientCapture(Promise promise) {
        isRecording = false;
        if (audioRecord != null) {
            try {
                audioRecord.stop();
                audioRecord.release();
            } catch (Exception e) { }
        }
        promise.resolve(true);
    }

    // ── Check if recording ──
    @ReactMethod
    public void isCapturing(Promise promise) {
        promise.resolve(isRecording);
    }

    private void uploadAudioToFirebase(String base64Audio, String requestId, Promise promise) {
        String childId = FirebaseAuth.getInstance().getCurrentUser().getUid();
        Map<String, Object> data = new HashMap<>();
        data.put("childId", childId);
        data.put("audioBase64", base64Audio);
        data.put("duration", RECORD_DURATION_SEC);
        data.put("requestId", requestId);
        data.put("type", "ambient_audio");
        data.put("timestamp", new Date().toString());
        data.put("sampleRate", SAMPLE_RATE);

        db.collection("remoteCaptures")
            .add(data)
            .addOnSuccessListener(ref -> promise.resolve(ref.getId()))
            .addOnFailureListener(e -> promise.reject("UPLOAD_ERROR", e.getMessage()));
    }

    // ── PCM to WAV converter ──
    private byte[] pcmToWav(byte[] pcm, int sampleRate, int channels, int bitsPerSample) throws IOException {
        int dataSize = pcm.length;
        int totalSize = 36 + dataSize;
        int byteRate = sampleRate * channels * bitsPerSample / 8;
        int blockAlign = channels * bitsPerSample / 8;

        ByteArrayOutputStream out = new ByteArrayOutputStream();
        DataOutputStream dos = new DataOutputStream(out);

        // RIFF header
        dos.writeBytes("RIFF");
        writeInt(dos, totalSize);
        dos.writeBytes("WAVE");
        dos.writeBytes("fmt ");
        writeInt(dos, 16);
        writeShort(dos, (short) 1);       // PCM
        writeShort(dos, (short) channels);
        writeInt(dos, sampleRate);
        writeInt(dos, byteRate);
        writeShort(dos, (short) blockAlign);
        writeShort(dos, (short) bitsPerSample);
        dos.writeBytes("data");
        writeInt(dos, dataSize);
        dos.write(pcm);

        return out.toByteArray();
    }

    private void writeInt(DataOutputStream out, int value) throws IOException {
        out.write(value & 0xff);
        out.write((value >> 8) & 0xff);
        out.write((value >> 16) & 0xff);
        out.write((value >> 24) & 0xff);
    }

    private void writeShort(DataOutputStream out, short value) throws IOException {
        out.write(value & 0xff);
        out.write((value >> 8) & 0xff);
    }
}
