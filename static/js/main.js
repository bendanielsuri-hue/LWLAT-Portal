/* Entry point loaded from layout.html - stays a plain list of imports.
   select-row.js and layout/boot.js both export nothing; their whole job is
   the side effect they run at module-load time (a delegated click
   listener, the portal-wide DOMContentLoaded boot sequence). A bare import
   is what makes that happen: nothing else in this file references either
   by name, so without these imports the browser would never fetch or
   execute them at all, and neither would silently run - which is exactly
   what happened to select-row.js's listener until its own import was
   added (found live: the "Create new Panel Group" quick-add button
   stopped doing anything). */
import './components/select-row.js';
import './layout/boot.js';
