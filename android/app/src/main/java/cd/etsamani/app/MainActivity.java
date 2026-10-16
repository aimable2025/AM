package cd.etsamani.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

import cd.etsamani.app.plugins.SmsReaderPlugin;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SmsReaderPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
