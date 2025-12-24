// ==UserScript==
// @name         SPP Triage Monitor
// @namespace    https://github.com/scahmi/spp-triage-monitor
// @version      1.0.2
// @description  Auto monitor SPP triage, reset polling, Telegram alerts
// @author       ETD HPG
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

    // ===== TELEGRAM =====
    const TELEGRAM_BOT_TOKEN = "8551613313:AAHDkj9A0V6iLFsoQ0yJzLBh1Cgac-7tTts";
    const TELEGRAM_CHAT_ID  = "-1003658002044";

    const alarmSound = "https://actions.google.com/sounds/v1/alarms/beep_short.ogg";
    const beep = new Audio(alarmSound);

    // ===== REQUEST NOTIFICATION PERMISSION =====
    if (Notification.permission !== "granted") {
        Notification.requestPermission();
    }

    // ===== STATUS PANEL (BOTTOM LEFT) =====
    let statusBox;

    function formatDate(d) {
        const pad = n => n.toString().padStart(2, "0");
        return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear().toString().slice(-2)} ` +
               `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }

    function updateStatus(isRunning, lastUpdate = null) {
        if (!statusBox) return;

        statusBox.innerHTML = `
            <b>Monitoring Status:</b> ${isRunning ? "Monitoring" : "Not monitoring"}<br>
            <b>Last Update:</b> ${lastUpdate || "-"}
        `;
    }

    function createStatusBox() {
        statusBox = document.createElement("div");
        Object.assign(statusBox.style, {
            position: "fixed",
            bottom: "20px",
            left: "20px",
            zIndex: "999999",
            padding: "10px 14px",
            background: "#f8f9fa",
            color: "#333",
            border: "1px solid #ccc",
            borderRadius: "8px",
            fontSize: "13px",
            boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
            minWidth: "220px"
        });

        document.body.appendChild(statusBox);
        updateStatus(true, "-");
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

    // ===== WAIT FOR RESET BUTTON =====
    function waitForReset(cb) {
        const t = setInterval(() => {
            const btn = document.getElementById("Reset");
            if (btn) {
                clearInterval(t);
                cb();
            }
        }, 500);
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

        beep.play().catch(() => {});

        if (Notification.permission === "granted") {
            new Notification("⚠️ New Patient Registered", {
                body: "A new patient has appeared in the triage list."
            });
        }

        sendTelegram(
            `⚠️ SPP TRIAGE ALERT\n` +
            `New patient registered.\n` +
            `Total patients: ${newCount}\n` +
            `Time: ${new Date().toLocaleString()}`
        );

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
        if (!running) {
            updateStatus(false);
            return;
        }

        clickResetButton();

        setTimeout(() => {
            if (!running) {
                updateStatus(false);
                return;
            }

            const newCount = getRowCount();
            const now = formatDate(new Date());

            if (oldCount !== null && newCount > oldCount) {
                alertNewPatient(newCount);
            }

            oldCount = newCount;
            updateStatus(true, now);

        }, updateDelay);

        setTimeout(monitor, interval);
    }

    // ===== START =====
    waitForReset(() => {
        createStatusBox();
        monitor();
    });

})();
