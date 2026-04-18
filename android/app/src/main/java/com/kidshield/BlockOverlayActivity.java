package com.kidshield;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.TextView;

public class BlockOverlayActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Make it full screen overlay
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN
        );
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        setContentView(R.layout.activity_block_overlay);

        String blockedPackage = getIntent().getStringExtra("blocked_package");
        String appName = getAppName(blockedPackage);

        TextView tvAppName = findViewById(R.id.tv_blocked_app_name);
        TextView tvMessage = findViewById(R.id.tv_block_message);
        Button btnGoHome = findViewById(R.id.btn_go_home);

        tvAppName.setText(appName);
        tvMessage.setText("This app has been blocked by your parent.\nPlease ask your parent to unblock it.");

        btnGoHome.setOnClickListener(v -> {
            // Go to home screen
            Intent homeIntent = new Intent(Intent.ACTION_MAIN);
            homeIntent.addCategory(Intent.CATEGORY_HOME);
            homeIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(homeIntent);
            finish();
        });
    }

    private String getAppName(String packageName) {
        if (packageName == null) return "This App";
        try {
            PackageManager pm = getPackageManager();
            ApplicationInfo ai = pm.getApplicationInfo(packageName, 0);
            return (String) pm.getApplicationLabel(ai);
        } catch (PackageManager.NameNotFoundException e) {
            return packageName;
        }
    }

    @Override
    public void onBackPressed() {
        // Don't allow back press - force home
        Intent homeIntent = new Intent(Intent.ACTION_MAIN);
        homeIntent.addCategory(Intent.CATEGORY_HOME);
        homeIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(homeIntent);
        finish();
    }
}
