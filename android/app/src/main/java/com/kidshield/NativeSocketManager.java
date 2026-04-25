package com.kidshield;

import android.util.Log;
import io.socket.client.IO;
import io.socket.client.Socket;
import org.json.JSONObject;

public class NativeSocketManager {
    private static final String TAG = "KidShieldNativeSocket";
    private static final String SERVER_URL = "https://kidshield-0757.onrender.com";
    private static NativeSocketManager instance;
    private Socket mSocket;
    private String parentId;
    private String childId;

    private NativeSocketManager() {
        try {
            IO.Options options = new IO.Options();
            options.transports = new String[]{"websocket"};
            options.reconnection = true;
            mSocket = IO.socket(SERVER_URL, options);

            mSocket.on(Socket.EVENT_CONNECT, args -> Log.d(TAG, "🔥 Native Java Socket Connected!"));
            mSocket.on(Socket.EVENT_DISCONNECT, args -> Log.d(TAG, "❌ Native Java Socket Disconnected!"));
            
        } catch (Exception e) {
            Log.e(TAG, "Socket init error", e);
        }
    }

    public static synchronized NativeSocketManager getInstance() {
        if (instance == null) {
            instance = new NativeSocketManager();
        }
        return instance;
    }

    public void setIds(String childId, String parentId) {
        this.childId = childId;
        this.parentId = parentId;
    }

    public void connect() {
        if (!mSocket.connected()) {
            mSocket.connect();
            try {
                if (parentId != null) {
                    JSONObject data = new JSONObject();
                    data.put("parentId", parentId);
                    mSocket.emit("join_room", data);
                    Log.d(TAG, "Joined room natively: " + parentId);
                }
            } catch (Exception e) {}
        }
    }

    public void disconnect() {
        if (mSocket.connected()) {
            mSocket.disconnect();
        }
    }

    public void sendFrame(String base64Frame, String type) {
        if (mSocket.connected() && parentId != null) {
            try {
                JSONObject data = new JSONObject();
                data.put("parentId", parentId);
                data.put("childId", childId);
                data.put("type", type);
                data.put("frameBase64", base64Frame);
                mSocket.emit("stream_frame", data);
            } catch (Exception e) {
                Log.e(TAG, "Error sending frame natively", e);
            }
        }
    }
}