/* "Report Issue" wiring - one path for every audience (#128 follow-up
   grilling; #212 moved this out of layout.html's inline <script>, ADR 0021).
   window.__footerErrors, set by the dev-only error console when it exists,
   is read at submit time so the attachment stays silent even though this
   always runs.

   The report endpoint's URL now reaches this module via the form's own
   data-report-url attribute instead of fetch('{% url "report_problem" %}')
   inline - ADR 0021 (template context as data, never as code). */
export function initReportProblem() {
    var reportDialog = document.getElementById('report-problem-dialog');
    var reportForm = document.getElementById('report-problem-form');
    var reportBtn = document.getElementById('report-problem-btn');
    if (!reportDialog || !reportForm || !reportBtn) return;

    function getCookie(name) {
        var match = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
        return match ? decodeURIComponent(match[2]) : '';
    }

    reportBtn.addEventListener('click', function () {
        reportForm.reset();
        reportDialog.showModal();
    });
    document.getElementById('report-problem-cancel-btn').addEventListener('click', function () {
        reportDialog.close();
    });
    reportForm.addEventListener('submit', function () {
        var description = document.getElementById('report-problem-description').value.trim();
        if (!description) return;
        reportDialog.close();
        window.AppStatus.show('Sending report…');
        fetch(reportForm.dataset.reportUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
            body: JSON.stringify({
                description: description,
                category: document.getElementById('report-problem-category').value,
                page_url: location.href,
                errors: window.__footerErrors || [],
            }),
        }).then(function (response) {
            if (!response.ok) throw new Error();
            window.AppStatus.success('Report sent - thank you');
        }).catch(function () {
            window.AppStatus.error('Could not send report');
        });
    });
}
