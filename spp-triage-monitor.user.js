// ==UserScript==
// @name         SPP Triage Monitor
// @namespace    https://github.com/scahmi/spp-triage-monitor
// @version      1.0.1
// @description  Auto monitor SPP triage, reset polling, Telegram alerts
// @author       scahmi-ETDHPG
// @match        https://hpgspp.emrai.my/spp/*
// @grant        GM_xmlhttpRequest
// @updateURL    https://raw.githubusercontent.com/scahmi/spp-triage-monitor/main/spp-triage-monitor.user.js
// @downloadURL  https://raw.githubusercontent.com/scahmi/spp-triage-monitor/main/spp-triage-monitor.user.js
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    // ===== SETTINGS =====
    const interval = 15000;       // how often to press Reset (ms)
    const updateDelay = 1200;     // wait after Reset click
    let oldCount = null;
    let running = true;

    // ===== TELEGRAM (PUT YOUR NEW TOKEN HERE) =====
    const TELEGRAM_BOT_TOKEN = "8551613313:AAHDkj9A0V6iLFsoQ0yJzLBh1Cgac-7tTts";
    const TELEGRAM_CHAT_ID  = "-1003658002044";

    const alarmSound = "https://actions.google.com/sounds/v1/alarms/beep_short.ogg";
    const beep = new Audio(alarmSound);

    // ===== REQUEST NOTIFICATION PERMISSION =====
    if (Notification.permission !== "granted") {
        Notification.requestPermission();
    }

    // ===== TELEGRAM SEND FUNCTION =====
    function sendTelegram(msg) {
        GM_xmlhttpRequest({
            method: "POST",
            url: `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
            headers: { "Content-Type": "application/json" },
            data: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: msg
            })
        });
    }

    // ===== WAIT FOR RESET BUTTON (VAADIN SAFE) =====
    function waitForReset(cb) {
        const t = setInterval(() => {
            const btn = document.getElementById("Reset");
            if (btn) {
                clearInterval(t);
                cb();
            }
        }, 500);
    }

    // ===== INSERT STOP BUTTON =====
    function insertStopButton() {
        const stopBtn = document.createElement("button");
        stopBtn.innerText = "🛑 STOP MONITORING";
        Object.assign(stopBtn.style, {
            position: "fixed",
            bottom: "20px",
            right: "20px",
            padding: "12px 18px",
            zIndex: "999999",
            background: "#d9534f",
            color: "white",
            fontSize: "16px",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
            boxShadow: "0 2px 8px rgba(0,0,0,0.3)"
        });

        document.body.appendChild(stopBtn);

        stopBtn.onclick = () => {
            running = false;
            stopBtn.innerText = "⛔ MONITORING STOPPED";
            stopBtn.style.background = "#777";
            console.log("🛑 Monitoring stopped by user.");
        };
    }

    // ===== CLICK RESET BUTTON =====
    function clickResetButton() {
        const btn = document.getElementById("Reset");
        if (btn) btn.click();
    }

    // ===== COUNT TABLE ROWS =====
    function getRowCount() {
        return document.querySelectorAll("table tbody tr").length;
    }

    // ===== ALERT WHEN NEW PATIENT =====
    function alertNewPatient(newCount) {

        // Sound
        beep.play().catch(() => {});

        // Desktop notification
        if (Notification.permission === "granted") {
            new Notification("⚠️ New Patient Registered", {
                body: "A new patient has appeared in the triage list."
            });
        }

        // Telegram notification
        sendTelegram(
            `⚠️ SPP TRIAGE ALERT\n` +
            `New patient registered.\n` +
            `Total patients: ${newCount}\n` +
            `Time: ${new Date().toLocaleString()}`
        );

        // Flash tab title
        let flashing = true;
        const flashInterval = setInterval(() => {
            document.title = flashing ? "⚠️ NEW PATIENT!" : "Triage Dashboard";
            flashing = !flashing;
        }, 600);

        setTimeout(() => {
            clearInterval(flashInterval);
            document.title = "Triage Dashboard";
        }, 10000);
    }

    // ===== MAIN MONITOR FUNCTION =====
    function monitor() {
        if (!running) return;

        clickResetButton();

        setTimeout(() => {
            if (!running) return;

            const newCount = getRowCount();

            if (oldCount !== null && newCount > oldCount) {
                console.log("🚨 NEW PATIENT DETECTED");
                alertNewPatient(newCount);
            }

            oldCount = newCount;
        }, updateDelay);

        setTimeout(monitor, interval);
    }

    // ===== START =====
    waitForReset(() => {
        console.log("SPP Reset detected, monitoring started");
        insertStopButton();
        monitor();
    });

})();
