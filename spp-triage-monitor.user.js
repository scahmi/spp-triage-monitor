// ==UserScript==
// @name         SPP Triage Monitor
// @namespace    https://github.com/scahmi/spp-triage-monitor
// @version      1.1.0
// @description  Auto monitor SPP triage, reset polling, Telegram alerts (Level 4 & 5 only)
// @author       ETD HPG
// @match        https://hpgspp.emrai.my/spp/*
// @grant        GM_xmlhttpRequest
// @updateURL    https://raw.githubusercontent.com/scahmi/spp-triage-monitor/main/spp-triage-monitor.user.js
// @downloadURL  https://raw.githubusercontent.com/scahmi/spp-triage-monitor/main/spp-triage-monitor.user.js
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    /* ================= SETTINGS ================= */
    const interval = 15000;       // Reset click interval
    const updateDelay = 1200;     // Wait after Reset
    let running = true;

    // Track known patients (deduplication)
    let knownPatients = new Set();

    /* ================= TELEGRAM ================= */
    const TELEGRAM_BOT_TOKEN = "8551613313:AAHDkj9A0V6iLFsoQ0yJzLBh1Cgac-7tTts";
    const TELEGRAM_CHAT_ID  = "-1003658002044";

    const alarmSound = "https://actions.google.com/sounds/v1/alarms/beep_short.ogg";
    const beep = new Audio(alarmSound);

    if (Notification.permission !== "granted") {
        Notification.requestPermission();
    }

    /* ================= STATUS BAR ================= */
    let statusBox;

    function formatDate(d) {
        const pad = n => n.toString().padStart(2, "0");
        return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear().toString().slice(-2)} ` +
               `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }

    function updateStatus(isRunning, lastUpdate = "-") {
        if (!statusBox) return;

        statusBox.innerHTML = `
            <div>
                <strong>Monitoring Status:</strong>
                <span style="color:${isRunning ? "#2e7d32" : "#777"};font-weight:600">
                    ${isRunning ? "Monitoring" : "Not monitoring"}
                </span>
            </div>
            <div><strong>Last Update:</strong> ${lastUpdate}</div>
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
            background: "#ffffff",
            color: "#222",
            border: "1px solid rgba(0,0,0,0.12)",
            borderRadius: "8px",
            fontSize: "13px",
            lineHeight: "1.4",
            minWidth: "260px",
            boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
            fontFamily: `
                system-ui,
                -apple-system,
                BlinkMacSystemFont,
                "Segoe UI",
                Roboto,
                Helvetica,
                Arial,
                sans-serif
            `
        });

        document.body.appendChild(statusBox);
        updateStatus(true, "-");
    }

    /* ================= TELEGRAM SEND ================= */
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

    /* ================= EXTRACTION LOGIC ================= */

    function extractPatients() {
        const rows = document.querySelectorAll("table tbody tr");
        const patients = [];

        rows.forEach(row => {
            const cells = row.querySelectorAll("td");
            if (cells.length < 3) return;

            // ----- TRIAGE CATEGORY (Column 1) -----
            const triageText = cells[1].innerText.trim(); // e.g. LEVEL 5 - Routine care
            const triageMatch = triageText.match(/level\s*(\d)/i);
            if (!triageMatch) return;

            const triageLevel = `Level ${triageMatch[1]}`;

            // ----- NAME + IDENTIFICATION (Column 2) -----
            const identityText = cells[2].innerText.trim();
            const lines = identityText.split("\n").map(l => l.trim());

            const name = lines[0] || "UNKNOWN";

            // NRIC = 12 digits
            const nricMatch = identityText.match(/\b\d{12}\b/);
            const rawNRIC = nricMatch ? nricMatch[0] : "UNKNOWN";

            const maskedNRIC = rawNRIC !== "UNKNOWN"
                ? rawNRIC.replace(/(\d{6})(\d{2})\d{4}/, "$1-$2-XXXX")
                : "UNKNOWN";

            const signature = `${name}|${rawNRIC}|${triageLevel}`;

            patients.push({
                name,
                nric: maskedNRIC,
                triage: triageLevel,
                signature
            });
        });

        return patients;
    }

    function shouldNotify(triageLevel) {
        return triageLevel === "Level 4" || triageLevel === "Level 5";
    }

    /* ================= RESET HANDLING ================= */
    function waitForReset(cb) {
        const t = setInterval(() => {
            const btn = document.getElementById("Reset");
            if (btn) {
                clearInterval(t);
                cb();
            }
        }, 500);
    }

    function clickResetButton() {
        const btn = document.getElementById("Reset");
        if (btn) btn.click();
    }

    /* ================= MAIN LOOP ================= */
    function monitor() {
        if (!running) {
            updateStatus(false);
            return;
        }

        clickResetButton();

        setTimeout(() => {
            const patients = extractPatients();
            const now = formatDate(new Date());

            patients.forEach(p => {
                if (!knownPatients.has(p.signature)) {

                    // Skip baseline
                    if (knownPatients.size > 0 && shouldNotify(p.triage)) {
                        beep.play().catch(()=>{});

                        sendTelegram(
                            `⚠️ SPP TRIAGE ALERT ⚠️\n` +
                            `New patient registered\n` +
                            `Time: ${new Date().toLocaleString()}\n` +
                            `Name: ${p.name}\n` +
                            `NRIC: ${p.nric}\n` +
                            `Triage Category : ${p.triage}`
                        );
                    }

                    knownPatients.add(p.signature);
                }
            });

            updateStatus(true, now);

        }, updateDelay);

        setTimeout(monitor, interval);
    }

    /* ================= START ================= */
    waitForReset(() => {
        createStatusBox();
        monitor();
    });

})();
