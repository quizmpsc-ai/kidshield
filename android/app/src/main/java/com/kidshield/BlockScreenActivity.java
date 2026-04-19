package com.kidshield;
import android.app.Activity;
import android.os.Bundle;
import android.widget.TextView;
import android.view.View;
import android.view.WindowManager;
import android.graphics.Color;
import android.widget.LinearLayout;

public class BlockScreenActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setBackgroundColor(Color.parseColor("#060b14"));
        layout.setGravity(android.view.Gravity.CENTER);

        TextView icon = new TextView(this);
        icon.setText("🚫");
        icon.setTextSize(64);
        icon.setGravity(android.view.Gravity.CENTER);

        TextView title = new TextView(this);
        title.setText("App Blocked");
        title.setTextColor(Color.parseColor("#ff4444"));
        title.setTextSize(28);
        title.setGravity(android.view.Gravity.CENTER);
        title.setPadding(0, 20, 0, 0);

        TextView msg = new TextView(this);
        String pkg = getIntent().getStringExtra("blockedApp");
        msg.setText("This app is restricted by your parent.\n\n" + (pkg != null ? pkg : ""));
        msg.setTextColor(Color.parseColor("#8899aa"));
        msg.setTextSize(14);
        msg.setGravity(android.view.Gravity.CENTER);
        msg.setPadding(40, 20, 40, 0);

        layout.addView(icon);
        layout.addView(title);
        layout.addView(msg);
        setContentView(layout);
    }

    @Override
    public void onBackPressed() {
        moveTaskToBack(true);
    }
}