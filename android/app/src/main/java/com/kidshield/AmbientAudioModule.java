package com.kidshield;

import android.Manifest;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioPlaybackCaptureConfiguration;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.media.projection.MediaProjection;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.util.Base64;

import androidx.core.app.ActivityCompat;

import com.facebook.react.bridge.*;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import java.io.*;

public class AmbientAudioModule extends ReactContextBaseJavaModule {
    private final ReactApplicationContext reactContext;
    private AudioRecord audioRecord;
    private boolean isRecording = false;
    private HandlerThread recordThread;
    private static final int SAMPLE_RATE = 16000;

    public AmbientAudioModule(ReactApplicationContext context) {
        super(context);
        this.reactContext = context;
    }

    @Override public String getName() { return "AmbientAudio"; }

    // 🔥 FIX: Required by React Native Event Emitter
    @ReactMethod public void addListener(String eventName) {}
    @ReactMethod public void removeListeners(double count) {}
    @ReactMethod public void setChildInfo(String cId, String pId, Promise promise) { promise.resolve(true); }

    @ReactMethod
    public void startAmbientCapture(String requestId, Promise promise) {
        if (isRecording) { promise.resolve(true); return; }

        if (ActivityCompat.checkSelfPermission(reactContext, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            promise.reject("NO_PERMISSION", "Microphone permission is required");
            return;
        }

        recordThread = new HandlerThread("AudioCaptureThread");
        recordThread.start();
        
        new Handler(recordThread.getLooper()).post(() -> {
            try {
                int bufferSize = AudioRecord.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
                
                // 🔥 Logic: Screen Audio (Internal) VS Camera Audio (Mic)
                if (requestId.equals("screen_audio") && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    MediaProjection projection = ScreenMirrorModule.mediaProjection;
                    if (projection != null) {
                        AudioPlaybackCaptureConfiguration config = new AudioPlaybackCaptureConfiguration.Builder(projection)
                                .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
                                .addMatchingUsage(AudioAttributes.USAGE_GAME)
                                .build();

                        AudioFormat audioFormat = new AudioFormat.Builder()
                                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                                .setSampleRate(SAMPLE_RATE)
                                .setChannelMask(AudioFormat.CHANNEL_IN_MONO)
                                .build();

                        audioRecord = new AudioRecord.Builder()
                                .setAudioFormat(audioFormat)
                                .setBufferSizeInBytes(bufferSize * 4)
                                .setAudioPlaybackCaptureConfig(config)
                                .build();
                    } else {
                        audioRecord = new AudioRecord(MediaRecorder.AudioSource.MIC, SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, bufferSize * 4);
                    }
                } else {
                    audioRecord = new AudioRecord(MediaRecorder.AudioSource.MIC, SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, bufferSize * 4);
                }

                if (audioRecord.getState() != AudioRecord.STATE_INITIALIZED) {
                    promise.reject("INIT_FAILED", "Failed to initialize AudioRecord");
                    return;
                }

                audioRecord.startRecording();
                isRecording = true;
                promise.resolve(true);

                byte[] buffer = new byte[bufferSize];
                while (isRecording) {
                    int read = audioRecord.read(buffer, 0, buffer.length);
                    if (read > 0) {
                        byte[] wav = pcmToWav(buffer, SAMPLE_RATE, 1, 16);
                        String base64Audio = Base64.encodeToString(wav, Base64.NO_WRAP);
                        reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                            .emit("onAudioFrame", base64Audio);
                    }
                }
            } catch (Exception e) { 
                isRecording = false;
                promise.reject("ERROR", e.getMessage()); 
            }
        });
    }

    @ReactMethod
    public void stopAmbientCapture(Promise promise) {
        isRecording = false;
        if (audioRecord != null) {
            try { audioRecord.stop(); audioRecord.release(); } catch(Exception e) {}
            audioRecord = null;
        }
        promise.resolve(true);
    }

    private byte[] pcmToWav(byte[] pcm, int sampleRate, int channels, int bitsPerSample) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        DataOutputStream dos = new DataOutputStream(out);
        dos.writeBytes("RIFF");
        dos.writeInt(Integer.reverseBytes(36 + pcm.length));
        dos.writeBytes("WAVE");
        dos.writeBytes("fmt ");
        dos.writeInt(Integer.reverseBytes(16));
        dos.writeShort(Short.reverseBytes((short) 1));
        dos.writeShort(Short.reverseBytes((short) channels));
        dos.writeInt(Integer.reverseBytes(sampleRate));
        dos.writeInt(Integer.reverseBytes(sampleRate * channels * bitsPerSample / 8));
        dos.writeShort(Short.reverseBytes((short) (channels * bitsPerSample / 8)));
        dos.writeShort(Short.reverseBytes((short) bitsPerSample));
        dos.writeBytes("data");
        dos.writeInt(Integer.reverseBytes(pcm.length));
        dos.write(pcm);
        return out.toByteArray();
    }
}