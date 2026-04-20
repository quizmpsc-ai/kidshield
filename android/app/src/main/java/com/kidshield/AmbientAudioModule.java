package com.kidshield;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.Handler;
import android.os.HandlerThread;
import android.util.Base64;
import com.facebook.react.bridge.*;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.firestore.FirebaseFirestore;
import java.io.*;
import java.util.HashMap;
import java.util.Map;

public class AmbientAudioModule extends ReactContextBaseJavaModule {
    private final ReactApplicationContext reactContext;
    private AudioRecord audioRecord;
    private boolean isRecording = false;
    private HandlerThread recordThread;
    private Handler recordHandler;
    private String childId, parentId, childDocId;
    private static final int SAMPLE_RATE = 16000;
    private static final int CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO;
    private static final int AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT;

    public AmbientAudioModule(ReactApplicationContext context) {
        super(context);
        this.reactContext = context;
    }
    @Override public String getName() { return "AmbientAudio"; }

    @ReactMethod
    public void setChildInfo(String cId, String pId, String docId, Promise promise) {
        this.childId = cId; this.parentId = pId; this.childDocId = docId;
        promise.resolve(true);
    }

    @ReactMethod
    public void startAmbientCapture(String requestId, Promise promise) {
        if (isRecording) { promise.resolve(true); return; }
        if (childId == null && FirebaseAuth.getInstance().getCurrentUser() != null)
            childId = FirebaseAuth.getInstance().getCurrentUser().getUid();
        recordThread = new HandlerThread("AudioRecordThread");
        recordThread.start();
        recordHandler = new Handler(recordThread.getLooper());
        recordHandler.post(() -> {
            try {
                int bufferSize = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT);
                audioRecord = new AudioRecord(MediaRecorder.AudioSource.MIC, SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT, bufferSize * 4);
                if (audioRecord.getState() != AudioRecord.STATE_INITIALIZED) { promise.reject("INIT_FAILED", "AudioRecord init failed"); return; }
                audioRecord.startRecording();
                isRecording = true;
                promise.resolve(true);
                byte[] buffer = new byte[bufferSize];
                // Real-time audio level streaming loop
                while (isRecording) {
                    int read = audioRecord.read(buffer, 0, buffer.length);
                    if (read > 0) {
                        double level = calculateRmsLevel(buffer, read);
                        updateAudioLevel(level);
                    }
                    Thread.sleep(200);
                }
            } catch (Exception e) { isRecording = false; }
        });
    }

    private double calculateRmsLevel(byte[] buffer, int read) {
        double sum = 0;
        for (int i = 0; i < read - 1; i += 2) {
            short sample = (short) ((buffer[i + 1] << 8) | (buffer[i] & 0xFF));
            sum += sample * sample;
        }
        double rms = Math.sqrt(sum / (read / 2));
        return Math.min(rms / 32768.0, 1.0);
    }

    private void updateAudioLevel(double level) {
        try {
            FirebaseFirestore db = FirebaseFirestore.getInstance();
            Map<String, Object> data = new HashMap<>();
            data.put("liveAudioLevel", level);
            data.put("liveAudioAt", com.google.firebase.Timestamp.now());
            if (parentId != null && childDocId != null) {
                db.collection("families").document(parentId)
                    .collection("children").document(childDocId)
                    .update(data);
            }
        } catch (Exception e) {}
    }

    @ReactMethod
    public void stopAmbientCapture(Promise promise) {
        isRecording = false;
        if (audioRecord != null) {
            try { audioRecord.stop(); audioRecord.release(); } catch (Exception e) {}
            audioRecord = null;
        }
        if (recordThread != null) { recordThread.quitSafely(); recordThread = null; }
        try {
            if (parentId != null && childDocId != null) {
                FirebaseFirestore db = FirebaseFirestore.getInstance();
                Map<String, Object> data = new HashMap<>();
                data.put("liveAudioLevel", 0.0);
                db.collection("families").document(parentId)
                    .collection("children").document(childDocId).update(data);
            }
        } catch (Exception e) {}
        promise.resolve(true);
    }

    @ReactMethod
    public void isCapturing(Promise promise) { promise.resolve(isRecording); }
}
