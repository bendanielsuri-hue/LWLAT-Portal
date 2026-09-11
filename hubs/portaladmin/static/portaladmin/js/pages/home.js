/* Portal Admin dashboard's own page behavior (#212 - moved out of
   home.html's inline <script>, ADR 0021). */
(function () {
    // Proof-of-concept for the footer's generic status indicator (#128) -
    // one example converted to AJAX per the grilling call; the rest of the
    // app's save forms stay plain POST-and-reload until a dedicated
    // wayfinder map converts them.
    document.querySelectorAll('.settings-body form').forEach(function (form) {
        form.addEventListener('submit', function (event) {
            event.preventDefault();
            if (window.AppStatus) window.AppStatus.show('Saving…');
            fetch(form.action || location.href, {
                method: 'POST',
                headers: { 'X-Requested-With': 'XMLHttpRequest' },
                body: new FormData(form),
            }).then(function (response) {
                if (!response.ok) throw new Error();
                if (window.AppStatus) window.AppStatus.success('Saved');
            }).catch(function () {
                if (window.AppStatus) window.AppStatus.error('Failed to save');
            });
        });
    });
})();
