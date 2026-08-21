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


/* =========================================================
   BARKO — visore delle schermate

   Sta qui per la stessa ragione del modulo di contatto: la
   Content-Security-Policy della pagina vieta gli script
   scritti dentro il markup.

   La galleria è completa anche senza questo file: ogni
   riquadro è già un link all'immagine grande. Questo pezzo
   intercetta il clic e mostra la stessa immagine dentro un
   <dialog> nativo, così non si perde il punto della pagina.

   Il <dialog> viene costruito qui e non sta in index.html:
   se JavaScript non parte, non resta in giro nessun comando
   morto: semplicemente non esiste.

   Esc, clic sullo sfondo, inertizzazione del resto della
   pagina, gabbia del Tab e ritorno del fuoco al riquadro di
   partenza li fa showModal() da solo. Niente pushState:
   il tasto "indietro" del telefono esce dalla pagina, ma in
   cambio non può succedere che una desincronizzazione porti
   il visitatore fuori da barko.io.

   Niente stili scritti da JavaScript: solo classi e
   attributi, così style-src 'self' resta intatta.
   ========================================================= */

(function () {
    "use strict";

    /* La sezione intera e non la sola griglia: il Placeholder e'
       verticale e sta fuori dalla griglia, ma deve poter entrare
       nel visore come tutti gli altri. L'ordine dei riquadri e'
       quello del documento, quindi resta l'ordine che si vede. */
    var grid = document.getElementById("shots");
    if (!grid) { return; }

    var shots = grid.querySelectorAll("a.shot");
    var total = shots.length;
    if (!total) { return; }

    // Senza <dialog> modale (Safari sotto la 15.4) non
    // tocchiamo niente: i link si aprono in una scheda.
    if (!window.HTMLDialogElement ||
        typeof HTMLDialogElement.prototype.showModal !== "function") { return; }

    var SVGNS = "http://www.w3.org/2000/svg";

    var index   = 0;
    var warm    = [];   // copie grandi già scaricate, tenute in vita
    var swipeAt = 0;


    /* --- costruzione del pannello ------------------------- */

    function icon(d) {
        var svg = document.createElementNS(SVGNS, "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("fill", "none");
        svg.setAttribute("stroke", "currentColor");
        svg.setAttribute("stroke-width", "2.4");
        svg.setAttribute("stroke-linecap", "round");
        svg.setAttribute("stroke-linejoin", "round");
        svg.setAttribute("aria-hidden", "true");
        svg.setAttribute("focusable", "false");

        var path = document.createElementNS(SVGNS, "path");
        path.setAttribute("d", d);
        svg.appendChild(path);

        return svg;
    }

    function control(extra, label, d) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "viewer__btn " + extra;
        b.appendChild(icon(d));

        var name = document.createElement("span");
        name.className = "visually-hidden";
        name.textContent = label;
        b.appendChild(name);

        return b;
    }

    var dlg = document.createElement("dialog");
    dlg.className = "viewer";
    dlg.setAttribute("aria-label", "Screenshots, full size");

    var top = document.createElement("div");
    top.className = "viewer__top";

    // Il contatore visibile è aria-hidden: lo stesso dato
    // lo dice la zona di annuncio qui sotto, e sentirlo due
    // volte è solo rumore.
    var count = document.createElement("p");
    count.className = "viewer__count";
    count.setAttribute("aria-hidden", "true");

    var closer = control("viewer__btn--close", "Close the gallery", "M6 6l12 12M18 6L6 18");
    // Il fuoco iniziale va sulla chiusura: è la via d'uscita.
    closer.setAttribute("autofocus", "");

    top.appendChild(count);
    top.appendChild(closer);

    var body = document.createElement("div");
    body.className = "viewer__body";

    var prev  = control("viewer__btn--prev", "Previous picture", "M15 5l-7 7 7 7");
    var stage = document.createElement("div");
    stage.className = "viewer__stage";
    var next  = control("viewer__btn--next", "Next picture", "M9 5l7 7-7 7");

    body.appendChild(prev);
    body.appendChild(stage);
    body.appendChild(next);

    var cap = document.createElement("p");
    cap.className = "viewer__cap";

    var live = document.createElement("p");
    live.className = "visually-hidden";
    live.setAttribute("role", "status");
    live.setAttribute("aria-live", "polite");

    dlg.appendChild(top);
    dlg.appendChild(body);
    dlg.appendChild(cap);
    dlg.appendChild(live);

    document.body.appendChild(dlg);


    /* --- immagini ---------------------------------------- */

    /* Copia la <picture> della miniatura e riscrive sizes a
       tutto schermo. Gli indirizzi restano dichiarati una
       volta sola nell'HTML, ma il browser sceglie la
       variante grande — e sceglie il webp, cosa che aprire
       direttamente l'href (che è un .jpg, perché deve
       funzionare anche senza JavaScript) non farebbe. */
    function bigCopy(i) {
        var pic  = shots[i].querySelector("picture").cloneNode(true);
        var srcs = pic.querySelectorAll("source");
        var img  = pic.querySelector("img");
        var k;

        for (k = 0; k < srcs.length; k++) {
            srcs[k].setAttribute("sizes", "100vw");
        }

        img.setAttribute("sizes", "100vw");
        // staccata dal documento, una lazy non scatterebbe mai
        img.setAttribute("loading", "eager");
        img.removeAttribute("class");

        return pic;
    }

    function warmUp(i) {
        if (total < 2) { return; }
        i = (i + total) % total;
        if (!warm[i]) { warm[i] = bigCopy(i); }
    }

    /* Teniamo viva solo quella in vista e le due vicine.
       Tredici immagini da 1920 decodificate insieme sono
       decine di megabyte su un telefono. */
    function chill() {
        var k, far;
        for (k = 0; k < total; k++) {
            far = Math.abs(k - index);
            if (warm[k] && far > 1 && far !== total - 1) { warm[k] = null; }
        }
    }

    function draw(i) {
        var pic, img;

        index = i;

        pic = warm[i] || bigCopy(i);
        warm[i] = pic;

        img = pic.querySelector("img");
        img.setAttribute("fetchpriority", "high");

        while (stage.firstChild) { stage.removeChild(stage.firstChild); }
        stage.appendChild(pic);

        cap.textContent   = shots[i].getAttribute("data-cap") || "";
        count.textContent = (i + 1) + " / " + total;
        live.textContent  = "Picture " + (i + 1) + " of " + total + ". " + cap.textContent;

        warmUp(i + 1);
        warmUp(i - 1);
        chill();
    }

    function step(delta) {
        draw((index + delta + total) % total);
    }


    /* --- ascolti ----------------------------------------- */

    grid.addEventListener("click", function (event) {
        var link, i;

        // Chi tiene premuto Ctrl/Cmd/Shift, o clicca col
        // tasto centrale, vuole davvero una scheda nuova con
        // il file grezzo: non gliela togliamo.
        if (event.button !== 0 || event.metaKey || event.ctrlKey ||
            event.shiftKey || event.altKey) { return; }

        link = event.target.closest ? event.target.closest("a.shot") : null;
        if (!link) { return; }

        i = Array.prototype.indexOf.call(shots, link);
        if (i < 0) { return; }

        event.preventDefault();
        draw(i);
        dlg.showModal();
    });

    closer.addEventListener("click", function () { dlg.close(); });
    prev.addEventListener("click",   function () { step(-1); });
    next.addEventListener("click",   function () { step(1); });

    /* Un clic sul buio chiude; sull'immagine e sui comandi no. */
    dlg.addEventListener("click", function (event) {
        var t = event.target;
        if (Date.now() - swipeAt < 400) { return; }
        if (t.closest && (t.closest(".viewer__btn") || t.closest("picture"))) { return; }
        dlg.close();
    });

    /* Esc lo gestisce il browser. Qui solo la navigazione. */
    dlg.addEventListener("keydown", function (event) {
        var key = event.key;

        if (key === "ArrowRight" || key === "Right") { event.preventDefault(); step(1);  return; }
        if (key === "ArrowLeft"  || key === "Left")  { event.preventDefault(); step(-1); return; }
        if (key === "Home") { event.preventDefault(); draw(0); return; }
        if (key === "End")  { event.preventDefault(); draw(total - 1); }
    });

    /* Alla chiusura svuotiamo: niente immagini grandi tenute
       in memoria da un visore che non si vede più. */
    dlg.addEventListener("close", function () {
        while (stage.firstChild) { stage.removeChild(stage.firstChild); }
        warm = [];
        cap.textContent  = "";
        live.textContent = "";
    });


    /* Dito che scorre di lato. Non blocchiamo mai il gesto
       (niente touch-action): due dita restano libere per lo
       zoom, che su uno screenshot serve davvero. */

    var fromX = 0, fromY = 0, tracking = false;

    stage.addEventListener("touchstart", function (event) {
        if (event.touches.length !== 1) { tracking = false; return; }
        tracking = true;
        fromX = event.touches[0].clientX;
        fromY = event.touches[0].clientY;
    }, { passive: true });

    stage.addEventListener("touchend", function (event) {
        var t, dx, dy;
        if (!tracking) { return; }
        tracking = false;

        t  = event.changedTouches[0];
        dx = t.clientX - fromX;
        dy = t.clientY - fromY;

        if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.6) {
            swipeAt = Date.now();   // il clic che segue non deve chiudere
            step(dx < 0 ? 1 : -1);
        }
    }, { passive: true });

}());
