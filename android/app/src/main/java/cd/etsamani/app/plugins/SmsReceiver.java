package cd.etsamani.app.plugins;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.telephony.SmsMessage;
import android.telephony.SubscriptionManager;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

public class SmsReceiver extends BroadcastReceiver {

    private static final String TAG =
        "EtsAmaniSmsReceiver";

    private static final String PREFS_NAME =
        "EtsAmaniSmsReader";

    private static final String KEY_PENDING_SMS =
        "pending_sms";

    @Override
    public void onReceive(
        Context context,
        Intent intent
    ) {

        if (
            !"android.provider.Telephony.SMS_RECEIVED"
                .equals(intent.getAction())
        ) {
            return;
        }

        Bundle bundle =
            intent.getExtras();

        if (bundle == null) {
            return;
        }

        Object[] pdus =
            (Object[]) bundle.get("pdus");

        if (
            pdus == null ||
            pdus.length == 0
        ) {
            return;
        }

        String format =
            bundle.getString("format");

        int subscriptionId =
            bundle.getInt(
                SubscriptionManager.EXTRA_SUBSCRIPTION_INDEX,
                SubscriptionManager.INVALID_SUBSCRIPTION_ID
            );

        Log.d(
            TAG,
            "subscriptionId=" +
                subscriptionId
        );

        for (Object pdu : pdus) {

            SmsMessage sms;

            if (
                android.os.Build.VERSION.SDK_INT >=
                android.os.Build.VERSION_CODES.M
            ) {

                sms =
                    SmsMessage.createFromPdu(
                        (byte[]) pdu,
                        format
                    );

            } else {

                sms =
                    SmsMessage.createFromPdu(
                        (byte[]) pdu
                    );
            }

            if (sms == null) {
                continue;
            }

            String sender =
                sms.getOriginatingAddress();

            String message =
                sms.getMessageBody();

            long timestamp =
                sms.getTimestampMillis();

            Log.d(
                TAG,
                "SMS reçu | sender=" +
                    sender +
                    " | subscriptionId=" +
                    subscriptionId +
                    " | timestamp=" +
                    timestamp
            );

            savePendingSms(
                context,
                sender,
                message,
                timestamp,
                subscriptionId
            );
        }
    }

    private void savePendingSms(
        Context context,
        String sender,
        String message,
        long timestamp,
        int subscriptionId
    ) {

        try {

            android.content.SharedPreferences prefs =
                context.getSharedPreferences(
                    PREFS_NAME,
                    Context.MODE_PRIVATE
                );

            String existing =
                prefs.getString(
                    KEY_PENDING_SMS,
                    "[]"
                );

            JSONArray smsArray =
                new JSONArray(existing);

            JSONObject sms =
                new JSONObject();

            sms.put(
                "sender",
                sender
            );

            sms.put(
                "message",
                message
            );

            sms.put(
                "timestamp",
                timestamp
            );

            sms.put(
                "subscriptionId",
                subscriptionId
            );

            smsArray.put(sms);

            prefs.edit()
                .putString(
                    KEY_PENDING_SMS,
                    smsArray.toString()
                )
                .apply();

        } catch (JSONException e) {

            Log.e(
                TAG,
                "Erreur lors du stockage du SMS",
                e
            );
        }
    }
}
