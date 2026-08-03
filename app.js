/* =========================================================
   BARKO — invio del modulo di contatto

   Sta in un file separato (e non più inline nella pagina)
   perché la Content-Security-Policy di index.html vieta gli
   script scritti dentro l'HTML: è quella regola che rende
   inutile un eventuale tentativo di iniettare codice.
   ========================================================= */

(function () {
    "use strict";

    var form   = document.getElementById("contact-form");
    var status = document.getElementById("form-status");
    if (!form || !status) { return; }

    var button = form.querySelector("button[type=submit]");
    var label  = button.querySelector(".btn__label");
    var idle   = label.getAttribute("data-idle");

    // Con JavaScript attivo mostriamo i nostri messaggi; senza,
    // resta la validazione nativa del browser.
    if (window.fetch) { form.noValidate = true; }

    function show(text, kind) {
        // textContent, mai innerHTML: qualsiasi cosa arrivi qui
        // dentro viene stampata come testo e non eseguita.
        status.textContent = text;
        status.className = "form__status is-" + kind;
    }

    function firstInvalid() {
        var fields = form.querySelectorAll("input[required], textarea[required]");
        for (var i = 0; i < fields.length; i++) {
            if (!fields[i].value.trim()) { return fields[i]; }
        }
        var mail = form.elements.email;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail.value.trim())) { return mail; }
        return null;
    }

    form.addEventListener("submit", function (event) {

        if (!window.fetch) { return; }
        event.preventDefault();

        var bad = firstInvalid();
        if (bad) {
            bad.focus();
            show(
                bad.name === "email" && bad.value.trim()
                    ? "That email doesn't look right."
                    : "Please fill in name, email and message.",
                "error"
            );
            return;
        }

        var data = {};
        new FormData(form).forEach(function (value, key) { data[key] = value; });
        data._subject = "BARKO — " + (data.topic || "New message");

        button.disabled = true;
        label.textContent = "Sending…";
        show("", "idle");

        fetch(form.action.replace("formsubmit.co/", "formsubmit.co/ajax/"), {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify(data)
        })
        .then(function (response) {
            if (!response.ok) { throw new Error("HTTP " + response.status); }
            return response.json();
        })
        .then(function () {
            form.reset();
            show("Message sent. Thanks — I'll get back to you soon.", "ok");
        })
        .catch(function () {
            show("Something went wrong. Try again, or reach me on Instagram.", "error");
        })
        .then(function () {
            button.disabled = false;
            label.textContent = idle;
        });
    });
}());
